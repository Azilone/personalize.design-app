import { useState, useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  Link,
  data,
  useActionData,
  useLoaderData,
  useLocation,
  useNavigation,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../../../shopify.server";
import { getShopIdFromSession } from "../../../lib/tenancy";
import { buildEmbeddedSearch } from "../../../lib/embedded-search";
import logger from "../../../lib/logger";
import {
  generationLimitsActionSchema,
  printifyActionSchema,
  storefrontPersonalizationActionSchema,
} from "../../../schemas/admin";
import {
  PrintifyRequestError,
  listPrintifyShops,
  type PrintifyShopChoice,
} from "../../../services/printify/client.server";
import {
  decryptPrintifyToken,
  encryptPrintifyToken,
} from "../../../services/printify/token-encryption.server";
import {
  clearPrintifyIntegration,
  getPrintifyIntegrationWithToken,
  upsertPrintifyIntegration,
  type PrintifyIntegration,
} from "../../../services/printify/integration.server";
import { getShopReadinessSignals } from "../../../services/shops/readiness.server";
import {
  getStorefrontPersonalizationSettings,
  upsertStorefrontPersonalizationSettings,
} from "../../../services/shops/storefront-personalization.server";
import {
  getShopGenerationLimits,
  upsertShopGenerationLimits,
} from "../../../services/shops/generation-limits.server";

type LoaderData = {
  printifyIntegration: Omit<
    PrintifyIntegration,
    "createdAt" | "updatedAt"
  > | null;
  shopInvalid: boolean;
  storefrontPersonalizationEnabled: boolean | null;
  spendSafetyConfigured: boolean;
  generationLimits: {
    perProductLimit: number;
    perSessionLimit: number;
    resetWindowMinutes: number;
  };
};

type SettingsActionData =
  | {
      scope: "printify";
      success?: boolean;
      disconnected?: boolean;
      shopCount?: number;
      needsSelection?: boolean;
      shops?: PrintifyShopChoice[];
      error?: { code: string; message: string };
    }
  | {
      scope: "storefront";
      success?: boolean;
      savedChoice?: "enabled" | "disabled";
      requiresSpendSafety?: boolean;
      error?: { code: string; message: string };
    }
  | {
      scope: "button_styles";
      success?: boolean;
      error?: { code: string; message: string };
    }
  | {
      scope: "generation_limits";
      success?: boolean;
      error?: { code: string; message: string };
    };

const spendSafetyErrorMessage =
  "Before you can enable storefront personalization, set a monthly spending cap and enable paid usage.";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);
  const [printifyIntegration, storefrontSettings, readinessSignals, limits] =
    await Promise.all([
      getPrintifyIntegrationWithToken(shopId),
      getStorefrontPersonalizationSettings(shopId),
      getShopReadinessSignals(shopId),
      getShopGenerationLimits(shopId),
    ]);

  if (!printifyIntegration) {
    return {
      printifyIntegration: null,
      shopInvalid: false,
      storefrontPersonalizationEnabled: storefrontSettings.enabled,
      spendSafetyConfigured: readinessSignals.spendSafetyConfigured,
      generationLimits: limits,
    } satisfies LoaderData;
  }

  try {
    const token = decryptPrintifyToken(printifyIntegration.encryptedToken);
    const shops = await listPrintifyShops(token);
    const isCurrentShopValid = shops.some(
      (shop) => shop.shopId === printifyIntegration.printifyShopId,
    );

    if (!isCurrentShopValid) {
      await clearPrintifyIntegration(shopId);
      logger.warn(
        {
          shop_id: shopId,
          printify_shop_id: printifyIntegration.printifyShopId,
        },
        "Printify shop no longer available, integration cleared",
      );
      return {
        printifyIntegration: null,
        shopInvalid: true,
        storefrontPersonalizationEnabled: storefrontSettings.enabled,
        spendSafetyConfigured: readinessSignals.spendSafetyConfigured,
        generationLimits: limits,
      } satisfies LoaderData;
    }

    return {
      printifyIntegration: {
        shopId: printifyIntegration.shopId,
        printifyShopId: printifyIntegration.printifyShopId,
        printifyShopTitle: printifyIntegration.printifyShopTitle,
        printifySalesChannel: printifyIntegration.printifySalesChannel,
      },
      shopInvalid: false,
      storefrontPersonalizationEnabled: storefrontSettings.enabled,
      spendSafetyConfigured: readinessSignals.spendSafetyConfigured,
      generationLimits: limits,
    } satisfies LoaderData;
  } catch (error) {
    if (
      error instanceof PrintifyRequestError &&
      error.code === "invalid_token"
    ) {
      await clearPrintifyIntegration(shopId);
      logger.warn(
        { shop_id: shopId },
        "Printify token invalid, integration cleared",
      );
      return {
        printifyIntegration: null,
        shopInvalid: true,
        storefrontPersonalizationEnabled: storefrontSettings.enabled,
        spendSafetyConfigured: readinessSignals.spendSafetyConfigured,
        generationLimits: limits,
      } satisfies LoaderData;
    }

    logger.error(
      { shop_id: shopId, err: error },
      "Failed to fetch Printify shops on load",
    );
    return {
      printifyIntegration: {
        shopId: printifyIntegration.shopId,
        printifyShopId: printifyIntegration.printifyShopId,
        printifyShopTitle: printifyIntegration.printifyShopTitle,
        printifySalesChannel: printifyIntegration.printifySalesChannel,
      },
      shopInvalid: false,
      storefrontPersonalizationEnabled: storefrontSettings.enabled,
      spendSafetyConfigured: readinessSignals.spendSafetyConfigured,
      generationLimits: limits,
    } satisfies LoaderData;
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);
  const formData = Object.fromEntries(await request.formData());
  const intent =
    typeof formData.intent === "string" ? formData.intent : "unknown";

  if (intent === "storefront_personalization_choice") {
    const parsed = storefrontPersonalizationActionSchema.safeParse(formData);

    if (!parsed.success) {
      return data(
        {
          scope: "storefront",
          error: { code: "invalid_request", message: "Invalid request." },
        } satisfies SettingsActionData,
        { status: 400 },
      );
    }

    const wantsEnabled =
      parsed.data.storefront_personalization_choice === "enabled";

    if (wantsEnabled) {
      const readinessSignals = await getShopReadinessSignals(shopId);

      if (!readinessSignals.spendSafetyConfigured) {
        return data(
          {
            scope: "storefront",
            error: {
              code: "spend_safety_required",
              message: spendSafetyErrorMessage,
            },
            requiresSpendSafety: true,
          } satisfies SettingsActionData,
          { status: 400 },
        );
      }
    }

    await upsertStorefrontPersonalizationSettings({
      shopId,
      enabled: wantsEnabled,
    });

    return data({
      scope: "storefront",
      success: true,
      savedChoice: wantsEnabled ? "enabled" : "disabled",
    } satisfies SettingsActionData);
  }

  if (intent === "generation_limits_save") {
    const parsed = generationLimitsActionSchema.safeParse(formData);

    if (!parsed.success) {
      return data(
        {
          scope: "generation_limits",
          error: { code: "invalid_request", message: "Invalid request." },
        } satisfies SettingsActionData,
        { status: 400 },
      );
    }

    await upsertShopGenerationLimits({
      shopId,
      perProductLimit: parsed.data.per_product_limit,
      perSessionLimit: parsed.data.per_session_limit,
      resetWindowMinutes: parsed.data.reset_window_minutes,
    });

    return data({
      scope: "generation_limits",
      success: true,
    } satisfies SettingsActionData);
  }

  const parsed = printifyActionSchema.safeParse(formData);

  if (!parsed.success) {
    return data(
      {
        scope: "printify",
        error: { code: "invalid_request", message: "Invalid request." },
      } satisfies SettingsActionData,
      { status: 400 },
    );
  }

  if (parsed.data.intent === "printify_disconnect") {
    await clearPrintifyIntegration(shopId);
    logger.info({ shop_id: shopId }, "Printify disconnected");
    return data({
      scope: "printify",
      disconnected: true,
    } satisfies SettingsActionData);
  }

  const connectData = parsed.data;

  try {
    const token = connectData.printify_api_token;
    const shops = await listPrintifyShops(token);
    const shopCount = shops.length;
    let selectedShop = shops[0];

    if (shopCount > 1) {
      const existingIntegration = await getPrintifyIntegrationWithToken(shopId);
      const previousShopId = existingIntegration?.printifyShopId;

      if (connectData.printify_shop_id) {
        const matched = shops.find(
          (shop) => shop.shopId === connectData.printify_shop_id,
        );

        if (!matched) {
          return data(
            {
              scope: "printify",
              error: {
                code: "invalid_request",
                message: "Select a valid Printify shop.",
              },
            } satisfies SettingsActionData,
            { status: 400 },
          );
        }

        selectedShop = matched;
      } else if (previousShopId) {
        const previousShopMatch = shops.find(
          (shop) => shop.shopId === previousShopId,
        );

        if (previousShopMatch) {
          selectedShop = previousShopMatch;
          logger.info(
            { shop_id: shopId, printify_shop_id: previousShopId },
            "Auto-selected previously saved Printify shop during token rotation",
          );
        } else {
          return data({
            scope: "printify",
            needsSelection: true,
            shops,
            shopCount,
          } satisfies SettingsActionData);
        }
      } else {
        return data({
          scope: "printify",
          needsSelection: true,
          shops,
          shopCount,
        } satisfies SettingsActionData);
      }
    }

    const encryptedToken = encryptPrintifyToken(token);

    await upsertPrintifyIntegration({
      shopId,
      encryptedToken,
      printifyShopId: selectedShop.shopId,
      printifyShopTitle: selectedShop.shopTitle,
      printifySalesChannel: selectedShop.salesChannel,
    });

    logger.info(
      { shop_id: shopId, printify_shop_id: selectedShop.shopId },
      "Printify connected",
    );

    return data({
      scope: "printify",
      success: true,
      shopCount,
    } satisfies SettingsActionData);
  } catch (error) {
    if (error instanceof PrintifyRequestError) {
      const status =
        error.code === "invalid_token"
          ? 401
          : error.code === "rate_limited"
            ? 429
            : 400;

      return data(
        {
          scope: "printify",
          error: { code: error.code, message: error.message },
        } satisfies SettingsActionData,
        { status },
      );
    }

    logger.error({ shop_id: shopId, err: error }, "Printify connection failed");

    return data(
      {
        scope: "printify",
        error: {
          code: "printify_unavailable",
          message:
            "We couldn't validate the Printify token. Please try again soon.",
        },
      } satisfies SettingsActionData,
      { status: 500 },
    );
  }
};

export default function Settings() {
  const {
    printifyIntegration,
    shopInvalid,
    storefrontPersonalizationEnabled,
    spendSafetyConfigured,
    generationLimits,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<
    typeof action
  >() as SettingsActionData | null;
  const navigation = useNavigation();
  const { search } = useLocation();
  const embeddedSearch = buildEmbeddedSearch(search);
  const setupHref = `/app${embeddedSearch}`;
  const billingHref = `/app/billing${embeddedSearch}`;

  const printifyAction = actionData?.scope === "printify" ? actionData : null;
  const storefrontAction =
    actionData?.scope === "storefront" ? actionData : null;
  const generationLimitsAction =
    actionData?.scope === "generation_limits" ? actionData : null;

  const isSubmittingPrintifyConnect =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "printify_connect";
  const isSubmittingPrintifyDisconnect =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "printify_disconnect";
  const isSubmittingStorefront =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "storefront_personalization_choice";
  const isSubmittingLimits =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "generation_limits_save";

  const errorMessage = printifyAction?.error?.message ?? null;
  const successMessage =
    printifyAction && "success" in printifyAction && printifyAction.success
      ? "Printify updated."
      : null;
  const disconnectedMessage =
    printifyAction &&
    "disconnected" in printifyAction &&
    printifyAction.disconnected
      ? "Printify disconnected."
      : null;
  const shopCount =
    printifyAction && "shopCount" in printifyAction
      ? (printifyAction.shopCount ?? null)
      : null;
  const needsSelection =
    printifyAction &&
    "needsSelection" in printifyAction &&
    printifyAction.needsSelection === true;
  const shopOptionsFromAction =
    printifyAction && "shops" in printifyAction
      ? (printifyAction.shops ?? null)
      : null;
  const shopOptions = shopOptionsFromAction ?? [];
  const showShopSelector = needsSelection && shopOptions.length > 0;
  const [tokenValue, setTokenValue] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const isConnected = printifyIntegration && !disconnectedMessage;

  const storefrontErrorMessage = storefrontAction?.error?.message ?? null;
  const requiresSpendSafety = storefrontAction?.requiresSpendSafety ?? false;
  const storefrontSuccessMessage =
    storefrontAction && storefrontAction.success
      ? "Storefront personalization updated."
      : null;
  const defaultChoice =
    storefrontPersonalizationEnabled === null
      ? "disabled"
      : storefrontPersonalizationEnabled
        ? "enabled"
        : "disabled";

  const generationLimitsErrorMessage =
    generationLimitsAction?.error?.message ?? null;
  const generationLimitsSuccessMessage =
    generationLimitsAction && generationLimitsAction.success
      ? "Generation limits updated."
      : null;

  return (
    <s-page heading="Settings">
      <s-section heading="Printify API">
        <s-stack direction="block" gap="base">
          {errorMessage ? (
            <s-banner tone="critical">
              <s-text>{errorMessage}</s-text>
            </s-banner>
          ) : null}
          {shopInvalid ? (
            <s-banner tone="critical">
              <s-text>
                Your Printify connection is no longer valid. Please reconnect
                with a valid API token.
              </s-text>
            </s-banner>
          ) : null}
          {disconnectedMessage ? (
            <s-banner tone="info">
              <s-text>{disconnectedMessage}</s-text>
            </s-banner>
          ) : null}
          {needsSelection ? (
            <s-banner tone="warning">
              <s-text>
                This token has access to multiple Printify shops. Select the one
                to connect.
              </s-text>
            </s-banner>
          ) : null}
          {shopCount && shopCount > 1 ? (
            <s-banner tone="warning">
              <s-text>
                This token has access to {shopCount} Printify shops.
              </s-text>
            </s-banner>
          ) : null}
          {isConnected || successMessage ? (
            <s-banner tone="success">
              <s-text>Connected</s-text>
            </s-banner>
          ) : !shopInvalid && !needsSelection && !disconnectedMessage ? (
            <s-banner tone="warning">
              <s-text>Not connected</s-text>
            </s-banner>
          ) : null}
          {isConnected ? (
            <s-stack direction="block" gap="small">
              <s-paragraph>
                Shop: {printifyIntegration.printifyShopTitle} (ID:{" "}
                {printifyIntegration.printifyShopId})
              </s-paragraph>
              {printifyIntegration.printifySalesChannel ? (
                <s-paragraph>
                  Sales channel: {printifyIntegration.printifySalesChannel}
                </s-paragraph>
              ) : null}
            </s-stack>
          ) : null}
          <s-paragraph>
            Paste a Printify API token to connect your account or rotate the
            existing token.
          </s-paragraph>
          <Form method="post">
            <input type="hidden" name="intent" value="printify_connect" />
            <s-stack direction="block" gap="base">
              <s-password-field
                label="Printify API token"
                name="printify_api_token"
                placeholder="Enter your token"
                autocomplete="off"
                disabled={isSubmittingPrintifyConnect}
                value={tokenValue}
                onChange={(event) => setTokenValue(event.currentTarget.value)}
                details="Generate a token in your Printify account settings."
              ></s-password-field>
              {showShopSelector ? (
                <s-box padding="base" borderWidth="base" borderRadius="base">
                  <s-choice-list label="Printify shop" name="printify_shop_id">
                    {shopOptions.map((shop, index) => (
                      <s-choice
                        key={shop.shopId}
                        value={shop.shopId}
                        selected={index === 0}
                      >
                        {shop.shopTitle} (ID: {shop.shopId})
                        {shop.salesChannel ? ` — ${shop.salesChannel}` : ""}
                      </s-choice>
                    ))}
                  </s-choice-list>
                </s-box>
              ) : null}
              <s-button
                type="submit"
                variant="primary"
                loading={isSubmittingPrintifyConnect}
              >
                {needsSelection ? "Connect selected shop" : "Update Printify"}
              </s-button>
            </s-stack>
          </Form>
          <Link to={setupHref}>Back to setup</Link>
        </s-stack>
      </s-section>

      {isConnected ? (
        <s-section heading="Disconnect Printify">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Disconnecting removes your Printify API token and shop selection.
            </s-paragraph>
            <Form method="post">
              <input type="hidden" name="intent" value="printify_disconnect" />
              <s-stack direction="block" gap="base">
                <s-checkbox
                  label="I understand this will disconnect Printify"
                  checked={confirmDisconnect}
                  onChange={() => setConfirmDisconnect(!confirmDisconnect)}
                />
                <s-button
                  type="submit"
                  variant="tertiary"
                  tone="critical"
                  disabled={!confirmDisconnect}
                  loading={isSubmittingPrintifyDisconnect}
                >
                  Disconnect Printify
                </s-button>
              </s-stack>
            </Form>
          </s-stack>
        </s-section>
      ) : null}

      <s-section heading="Storefront personalization">
        <s-stack direction="block" gap="base">
          {storefrontErrorMessage ? (
            <s-banner tone="critical">
              <s-stack direction="block" gap="small">
                <s-text>{storefrontErrorMessage}</s-text>
                {requiresSpendSafety ? (
                  <Link to={billingHref}>Configure spend safety</Link>
                ) : null}
              </s-stack>
            </s-banner>
          ) : null}
          {storefrontSuccessMessage ? (
            <s-banner tone="success">
              <s-text>{storefrontSuccessMessage}</s-text>
            </s-banner>
          ) : null}
          {!spendSafetyConfigured ? (
            <s-banner tone="warning">
              <s-text>
                Spend safety must be configured before enabling storefront
                personalization.
              </s-text>
            </s-banner>
          ) : null}
          <s-paragraph>
            Toggle whether buyers can access personalization on your storefront.
          </s-paragraph>
          <Form method="post">
            <input
              type="hidden"
              name="intent"
              value="storefront_personalization_choice"
            />
            <s-stack direction="block" gap="base">
              <s-choice-list
                label="Storefront personalization"
                name="storefront_personalization_choice"
              >
                <s-choice
                  value="enabled"
                  selected={defaultChoice === "enabled"}
                >
                  Enable storefront personalization
                </s-choice>
                <s-choice
                  value="disabled"
                  selected={defaultChoice === "disabled"}
                >
                  Keep disabled
                </s-choice>
              </s-choice-list>
              <s-button
                type="submit"
                variant="primary"
                loading={isSubmittingStorefront}
              >
                Save choice
              </s-button>
            </s-stack>
          </Form>
        </s-stack>
      </s-section>

      <s-section heading="Generation limits">
        <s-stack direction="block" gap="base">
          {generationLimitsErrorMessage ? (
            <s-banner tone="critical">
              <s-text>{generationLimitsErrorMessage}</s-text>
            </s-banner>
          ) : null}
          {generationLimitsSuccessMessage ? (
            <s-banner tone="success">
              <s-text>{generationLimitsSuccessMessage}</s-text>
            </s-banner>
          ) : null}
          <s-paragraph>
            Control how many times buyers can generate previews before the limit
            resets.
          </s-paragraph>
          <Form method="post">
            <input type="hidden" name="intent" value="generation_limits_save" />
            <s-stack direction="block" gap="base">
              <s-text-field
                label="Per-product limit"
                name="per_product_limit"
                defaultValue={String(generationLimits.perProductLimit)}
                placeholder="5"
              />
              <s-text-field
                label="Per-session limit"
                name="per_session_limit"
                defaultValue={String(generationLimits.perSessionLimit)}
                placeholder="15"
              />
              <s-text-field
                label="Reset window (minutes)"
                name="reset_window_minutes"
                defaultValue={String(generationLimits.resetWindowMinutes)}
                placeholder="30"
              />
              <s-button
                type="submit"
                variant="primary"
                loading={isSubmittingLimits}
              >
                Save limits
              </s-button>
            </s-stack>
          </Form>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
