import { useState } from "react";
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
import { printifyActionSchema } from "../../../schemas/admin";
import {
  PrintifyRequestError,
  listPrintifyShops,
  type PrintifyShopChoice,
} from "../../../services/printify/client.server";
import {
  encryptPrintifyToken,
  decryptPrintifyToken,
} from "../../../services/printify/token-encryption.server";
import {
  getPrintifyIntegrationWithToken,
  upsertPrintifyIntegration,
  clearPrintifyIntegration,
  type PrintifyIntegration,
} from "../../../services/printify/integration.server";
import { ensurePrintifyWebhooks } from "../../../services/printify/webhooks.server";

type LoaderData = {
  integration: Omit<PrintifyIntegration, "createdAt" | "updatedAt"> | null;
  availableShops: PrintifyShopChoice[] | null;
  shopInvalid: boolean;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);
  const integration = await getPrintifyIntegrationWithToken(shopId);

  if (!integration) {
    return {
      integration: null,
      availableShops: null,
      shopInvalid: false,
    } satisfies LoaderData;
  }

  try {
    const token = decryptPrintifyToken(integration.encryptedToken);
    const shops = await listPrintifyShops(token);
    const isCurrentShopValid = shops.some(
      (shop) => shop.shopId === integration.printifyShopId,
    );

    if (!isCurrentShopValid) {
      await clearPrintifyIntegration(shopId);
      logger.warn(
        { shop_id: shopId, printify_shop_id: integration.printifyShopId },
        "Printify shop no longer available, integration cleared",
      );
      return {
        integration: null,
        availableShops: shops,
        shopInvalid: true,
      } satisfies LoaderData;
    }

    return {
      integration: {
        shopId: integration.shopId,
        printifyShopId: integration.printifyShopId,
        printifyShopTitle: integration.printifyShopTitle,
        printifySalesChannel: integration.printifySalesChannel,
      },
      availableShops: shops,
      shopInvalid: false,
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
        integration: null,
        availableShops: null,
        shopInvalid: true,
      } satisfies LoaderData;
    }

    logger.error(
      { shop_id: shopId, err: error },
      "Failed to fetch Printify shops on load",
    );
    return {
      integration: {
        shopId: integration.shopId,
        printifyShopId: integration.printifyShopId,
        printifyShopTitle: integration.printifyShopTitle,
        printifySalesChannel: integration.printifySalesChannel,
      },
      availableShops: null,
      shopInvalid: false,
    } satisfies LoaderData;
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);
  const formData = Object.fromEntries(await request.formData());
  const parsed = printifyActionSchema.safeParse(formData);

  if (!parsed.success) {
    return data(
      { error: { code: "invalid_request", message: "Invalid request." } },
      { status: 400 },
    );
  }

  // Handle disconnect intent
  if (parsed.data.intent === "printify_disconnect") {
    await clearPrintifyIntegration(shopId);
    logger.info({ shop_id: shopId }, "Printify disconnected");
    return data({ disconnected: true });
  }

  // Handle connect intent
  const connectData = parsed.data;
  try {
    const token = connectData.printify_api_token;
    const shops = await listPrintifyShops(token);
    const shopCount = shops.length;
    let selectedShop = shops[0];

    if (shopCount > 1) {
      // Check if we have a previously saved shop ID that's still valid
      const existingIntegration = await getPrintifyIntegrationWithToken(shopId);
      const previousShopId = existingIntegration?.printifyShopId;

      if (connectData.printify_shop_id) {
        // User explicitly selected a shop
        const matched = shops.find(
          (shop) => shop.shopId === connectData.printify_shop_id,
        );

        if (!matched) {
          return data(
            {
              error: {
                code: "invalid_request",
                message: "Select a valid Printify shop.",
              },
            },
            { status: 400 },
          );
        }

        selectedShop = matched;
      } else if (previousShopId) {
        // Auto-select previously saved shop if still valid
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
          // Previous shop no longer valid, prompt for selection
          return data({ needsSelection: true, shops });
        }
      } else {
        // No previous shop, prompt for selection
        return data({ needsSelection: true, shops });
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

    const baseUrl = process.env.SHOPIFY_APP_URL ?? new URL(request.url).origin;
    if (baseUrl) {
      try {
        await ensurePrintifyWebhooks({
          token,
          printifyShopId: selectedShop.shopId,
          baseUrl,
          topics: [
            "order:created",
            "order:updated",
            "order:shipment:created",
            "order:shipment:delivered",
          ],
          secret: process.env.PRINTIFY_WEBHOOK_SECRET || undefined,
        });
      } catch (error) {
        logger.warn(
          {
            shop_id: shopId,
            printify_shop_id: selectedShop.shopId,
            error: error instanceof Error ? error.message : String(error),
          },
          "Printify connected but webhook setup failed",
        );
      }
    } else {
      logger.warn(
        { shop_id: shopId },
        "SHOPIFY_APP_URL not set; skipping Printify webhook setup",
      );
    }

    logger.info(
      { shop_id: shopId, printify_shop_id: selectedShop.shopId },
      "Printify connected",
    );

    return data({ success: true, shopCount });
  } catch (error) {
    if (error instanceof PrintifyRequestError) {
      const status =
        error.code === "invalid_token"
          ? 401
          : error.code === "rate_limited"
            ? 429
            : 400;

      return data(
        { error: { code: error.code, message: error.message } },
        { status },
      );
    }

    logger.error({ shop_id: shopId, err: error }, "Printify connection failed");

    return data(
      {
        error: {
          code: "printify_unavailable",
          message:
            "We couldn't validate the Printify token. Please try again soon.",
        },
      },
      { status: 500 },
    );
  }
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export default function PrintifySetup() {
  const { integration, availableShops, shopInvalid } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const { search } = useLocation();
  const embeddedSearch = buildEmbeddedSearch(search);
  const setupHref = `/app${embeddedSearch}`;
  const isSubmitting =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "printify_connect";
  const isDisconnecting =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "printify_disconnect";
  const errorMessage =
    actionData && typeof actionData === "object" && "error" in actionData
      ? actionData.error.message
      : null;
  const successMessage =
    actionData && typeof actionData === "object" && "success" in actionData
      ? "Printify connected."
      : null;
  const disconnectedMessage =
    actionData && typeof actionData === "object" && "disconnected" in actionData
      ? "Printify disconnected."
      : null;
  const shopCount =
    actionData &&
    typeof actionData === "object" &&
    "shopCount" in actionData &&
    typeof (actionData as { shopCount?: unknown }).shopCount === "number"
      ? (actionData as { shopCount: number }).shopCount
      : null;
  const needsSelection =
    actionData &&
    typeof actionData === "object" &&
    "needsSelection" in actionData
      ? (actionData as { needsSelection?: boolean }).needsSelection === true
      : false;
  const shopOptionsFromAction =
    actionData &&
    typeof actionData === "object" &&
    "shops" in actionData &&
    Array.isArray((actionData as { shops?: unknown }).shops)
      ? (
          actionData as {
            shops: Array<{
              shopId: string;
              shopTitle: string;
              salesChannel: string | null;
            }>;
          }
        ).shops
      : null;
  // Use shops from action (after token submit) or loader (on page load)
  const shopOptions = shopOptionsFromAction ?? availableShops;
  const showShopSelector = needsSelection && shopOptions;
  const [tokenValue, setTokenValue] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  // Show connected when we have an integration and haven't just disconnected
  const isConnected = integration && !disconnectedMessage;

  return (
    <s-page heading="Printify setup">
      <s-section heading="Connect Printify">
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
                Shop: {integration.printifyShopTitle} (ID:{" "}
                {integration.printifyShopId})
              </s-paragraph>
              {integration.printifySalesChannel ? (
                <s-paragraph>
                  Sales channel: {integration.printifySalesChannel}
                </s-paragraph>
              ) : null}
            </s-stack>
          ) : null}
          <s-paragraph>
            Paste a Printify API token to connect your account. We&apos;ll store
            it securely and use it to validate your Printify shop connection.
          </s-paragraph>
          <Form method="post">
            <input type="hidden" name="intent" value="printify_connect" />
            <s-stack direction="block" gap="base">
              <s-password-field
                label="Printify API token"
                name="printify_api_token"
                placeholder="Enter your token"
                autocomplete="off"
                disabled={isSubmitting}
                value={tokenValue}
                onChange={(event) => setTokenValue(event.currentTarget.value)}
                details="You can generate a token in your Printify account settings."
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
              <s-button type="submit" variant="primary" loading={isSubmitting}>
                {needsSelection ? "Connect selected shop" : "Connect Printify"}
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
              Disconnecting will remove your Printify API token and shop
              selection. Printify-required features will be unavailable until
              you reconnect.
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
                  loading={isDisconnecting}
                >
                  Disconnect Printify
                </s-button>
              </s-stack>
            </Form>
          </s-stack>
        </s-section>
      ) : null}
    </s-page>
  );
}
