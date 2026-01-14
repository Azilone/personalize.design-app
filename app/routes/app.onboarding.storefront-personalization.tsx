import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  data,
  useActionData,
  useLoaderData,
  useLocation,
  useNavigation,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getShopIdFromSession } from "../lib/tenancy";
import { buildEmbeddedSearch } from "../lib/embedded-search";
import { storefrontPersonalizationActionSchema } from "../schemas/admin";
import { getShopReadinessSignals } from "../services/shops/readiness.server";
import {
  getStorefrontPersonalizationSettings,
  upsertStorefrontPersonalizationSettings,
} from "../services/shops/storefront-personalization.server";

const spendSafetyErrorMessage =
  "Before you can enable storefront personalization, set a monthly spending cap and enable paid usage.";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);
  const [readinessSignals, storefrontSettings] = await Promise.all([
    getShopReadinessSignals(shopId),
    getStorefrontPersonalizationSettings(shopId),
  ]);

  return {
    spendSafetyConfigured: readinessSignals.spendSafetyConfigured,
    storefrontPersonalizationEnabled: storefrontSettings.enabled,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);
  const formData = Object.fromEntries(await request.formData());
  const parsed = storefrontPersonalizationActionSchema.safeParse(formData);

  if (!parsed.success) {
    return data(
      { error: { code: "invalid_request", message: "Invalid request." } },
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
          error: {
            code: "spend_safety_required",
            message: spendSafetyErrorMessage,
          },
          requiresSpendSafety: true,
        },
        { status: 400 },
      );
    }
  }

  await upsertStorefrontPersonalizationSettings({
    shopId,
    enabled: wantsEnabled,
  });

  return data({
    success: true,
    savedChoice: wantsEnabled ? "enabled" : "disabled",
  });
};

export default function StorefrontPersonalizationOnboarding() {
  const { search } = useLocation();
  const { storefrontPersonalizationEnabled, spendSafetyConfigured } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const embeddedSearch = buildEmbeddedSearch(search);
  const billingHref = `/app/billing${embeddedSearch}`;
  const demoVideoUrl = "https://www.youtube.com/watch?v=XNVfud0I27M&t=123s";

  const shopParam = new URLSearchParams(search).get("shop");
  const shopHandle = shopParam?.split(".")[0] ?? null;
  const shopifyThemesUrl = shopHandle
    ? `https://admin.shopify.com/store/${shopHandle}/themes`
    : null;

  const errorMessage =
    actionData && typeof actionData === "object" && "error" in actionData
      ? actionData.error.message
      : null;
  const requiresSpendSafety =
    actionData &&
    typeof actionData === "object" &&
    "requiresSpendSafety" in actionData
      ? Boolean(actionData.requiresSpendSafety)
      : false;
  const successMessage =
    actionData && typeof actionData === "object" && "success" in actionData
      ? "Storefront personalization choice saved."
      : null;
  const isSubmitting =
    navigation.formData?.get("intent") === "storefront_personalization_choice";
  const defaultChoice =
    storefrontPersonalizationEnabled === null
      ? "disabled"
      : storefrontPersonalizationEnabled
        ? "enabled"
        : "disabled";

  return (
    <s-page heading="Storefront personalization">
      <s-section heading="Confirm storefront personalization">
        <s-stack direction="block" gap="base">
          {errorMessage ? (
            <s-banner tone="critical">
              <s-stack direction="block" gap="small">
                <s-text>{errorMessage}</s-text>
                {requiresSpendSafety ? (
                  <s-link href={billingHref}>Configure spend safety</s-link>
                ) : null}
              </s-stack>
            </s-banner>
          ) : null}
          {successMessage ? (
            <s-banner tone="success">
              <s-text>{successMessage}</s-text>
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
            Choose whether buyers can access personalization on your storefront.
            Default is disabled until you explicitly confirm.
          </s-paragraph>

          <s-card>
            <s-stack direction="block" gap="base">
              <s-heading>Step-by-step setup</s-heading>
              <s-paragraph>
                Personalization lets buyers add text or images and see a live
                preview on the product page.
              </s-paragraph>
              <s-unordered-list>
                <s-list-item>
                  <strong>Step 1:</strong> Enable storefront personalization in
                  this app and save your choice.
                </s-list-item>
                <s-list-item>
                  <strong>Step 2:</strong> Add the app block/extension to your
                  Shopify theme so the personalization UI shows on product
                  pages.
                </s-list-item>
              </s-unordered-list>
              <s-paragraph>
                In Shopify Admin: Online Store → Themes → Customize → Add block
                → Apps → select the Personalize.design block → Save.
              </s-paragraph>

              <s-stack direction="inline" gap="base">
                <s-link href={demoVideoUrl} target="_blank">
                  Watch demo video
                </s-link>
                {shopifyThemesUrl ? (
                  <s-link href={shopifyThemesUrl} target="_blank">
                    Open Shopify themes
                  </s-link>
                ) : null}
              </s-stack>
            </s-stack>
          </s-card>

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
                <s-choice value="enabled" selected={defaultChoice === "enabled"}>
                  Enable storefront personalization
                </s-choice>
                <s-choice value="disabled" selected={defaultChoice === "disabled"}>
                  Keep disabled
                </s-choice>
              </s-choice-list>
              <s-button
                type="submit"
                variant="primary"
                loading={isSubmitting}
              >
                Save choice
              </s-button>
            </s-stack>
          </Form>
          <s-paragraph>
            Enabling storefront personalization does not automatically make
            buyer previews available. Next, assign a published template to a
            product.
          </s-paragraph>
          <s-link href={`/app${embeddedSearch}`}>Back to setup</s-link>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

