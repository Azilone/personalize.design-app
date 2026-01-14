import {
  ActionFunctionArgs,
  Form,
  HeadersFunction,
  Link,
  data,
  useActionData,
  useLocation,
  useRouteError,
  useRouteLoaderData,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getShopIdFromSession } from "../lib/tenancy";
import { buildEmbeddedSearch } from "../lib/embedded-search";
import { devBillingActionSchema } from "../schemas/admin";
import { buildEmbeddedRedirectPath } from "../lib/routing";
import { getShopPlan, resetPlanForDev } from "../services/shops/plan.server";
import { cancelSubscription } from "../services/shopify/billing.server";
import { resetOnboardingForDev } from "../services/shops/onboarding-reset.server";
import logger from "../lib/logger";
import { captureEvent } from "../lib/posthog.server";
import type { AppLoaderData } from "./app";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (process.env.NODE_ENV !== "development") {
    return data(
      { error: { code: "not_found", message: "Not found." } },
      { status: 404 },
    );
  }

  const { admin, session, redirect } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);
  const formData = Object.fromEntries(await request.formData());
  const parsed = devBillingActionSchema.safeParse(formData);
  const url = new URL(request.url);
  const showDanger =
    url.searchParams.get("danger") === "1" ||
    url.searchParams.get("danger") === "true";

  if (!parsed.success) {
    return data(
      { error: { code: "invalid_request", message: "Invalid request." } },
      { status: 400 },
    );
  }

  if (!showDanger) {
    return data(
      {
        error: {
          code: "danger_required",
          message: "Enable danger actions before using dev resets.",
        },
      },
      { status: 403 },
    );
  }

  if (parsed.data.intent === "dev_cancel_subscription") {
    const plan = await getShopPlan(shopId);
    if (!plan?.shopify_subscription_id) {
      return data(
        {
          error: {
            code: "no_subscription",
            message: "No subscription found for this shop.",
          },
        },
        { status: 404 },
      );
    }

    captureEvent("dev.billing_cancel_attempted", {
      shop_id: shopId,
      subscription_id: plan.shopify_subscription_id,
    });

    try {
      const cancelled = await cancelSubscription({
        admin,
        subscriptionId: plan.shopify_subscription_id,
      });

      captureEvent("dev.billing_cancel_succeeded", {
        shop_id: shopId,
        subscription_id: cancelled.id,
        subscription_status: cancelled.status,
      });

      await resetPlanForDev(shopId);
      return redirect(buildEmbeddedRedirectPath(request, "/app/paywall"));
    } catch (error) {
      logger.error(
        { shop_id: shopId, err: error },
        "Dev billing cancel failed",
      );

      captureEvent("dev.billing_cancel_failed", { shop_id: shopId });
      return data(
        {
          error: {
            code: "cancel_failed",
            message:
              error instanceof Error
                ? error.message
                : "Failed to cancel subscription.",
          },
        },
        { status: 500 },
      );
    }
  }

  if (parsed.data.intent === "dev_billing_reset") {
    captureEvent("dev.billing_reset", { shop_id: shopId });
    await resetPlanForDev(shopId);
    return redirect(buildEmbeddedRedirectPath(request, "/app/paywall"));
  }

  if (parsed.data.intent === "dev_onboarding_reset") {
    captureEvent("dev.onboarding_reset", { shop_id: shopId });
    await resetOnboardingForDev(shopId);
    return redirect(buildEmbeddedRedirectPath(request, "/app"));
  }

  return data(
    { error: { code: "unsupported_intent", message: "Unsupported action." } },
    { status: 400 },
  );
};

export default function DevToolsBilling() {
  const appData = useRouteLoaderData<AppLoaderData>("routes/app");
  const { search } = useLocation();
  const actionData = useActionData<typeof action>();
  const embeddedSearch = buildEmbeddedSearch(search);
  const dangerSearch = embeddedSearch
    ? `${embeddedSearch}&danger=1`
    : "?danger=1";
  const searchParams = new URLSearchParams(search);
  const showDanger =
    searchParams.get("danger") === "1" || searchParams.get("danger") === "true";
  const shopId = appData?.shopId ?? "";
  const planStatus = appData?.planStatus ?? null;
  const subscriptionId = appData?.subscriptionId ?? null;
  const subscriptionStatus = appData?.subscriptionStatus ?? null;

  return (
    <s-page heading="Dev tools (dev)">
      <s-section heading="Current state">
        <s-paragraph>
          <strong>Shop:</strong> {shopId}
        </s-paragraph>
        <s-paragraph>
          <strong>Plan status:</strong> {planStatus ?? "none"}
        </s-paragraph>
        <s-paragraph>
          <strong>Subscription:</strong>{" "}
          {subscriptionId
            ? `${subscriptionId} (${subscriptionStatus ?? "unknown"})`
            : "none"}
        </s-paragraph>
      </s-section>

      <s-section heading="Actions">
        {actionData?.error ? (
          <s-banner tone="critical">
            <s-text>{actionData.error.message}</s-text>
          </s-banner>
        ) : null}

        <s-paragraph>
          Use these actions to re-test onboarding and billing flows on a dev
          store.
        </s-paragraph>

        <s-box padding="base">
          <Link to={`/app/paywall${embeddedSearch}`}>Go to paywall</Link>
        </s-box>

        <s-paragraph>
          <strong>Danger zone</strong>: these are destructive operations.
        </s-paragraph>
        {!showDanger ? (
          <s-banner tone="warning">
            <s-text>
              Destructive buttons are disabled.{" "}
              <Link to={`/app/dev${dangerSearch}`}>Enable danger actions</Link>.
            </s-text>
          </s-banner>
        ) : null}

        <s-box padding="base">
          <Form method="post">
            <input type="hidden" name="intent" value="dev_onboarding_reset" />
            <s-button disabled={!showDanger} tone="critical" type="submit">
              Reset onboarding state (spend safety + storefront personalization)
            </s-button>
          </Form>
          <s-paragraph>
            This resets onboarding completion for the current shop so you can
            re-test the setup checklist. Printify reset will be added when the
            integration ships.
          </s-paragraph>
        </s-box>

        <s-box padding="base">
          <Form method="post">
            <input
              type="hidden"
              name="intent"
              value="dev_cancel_subscription"
            />
            <s-button disabled={!showDanger} tone="critical" type="submit">
              Cancel subscription on Shopify + reset local state
            </s-button>
          </Form>
        </s-box>

        <s-box padding="base">
          <Form method="post">
            <input type="hidden" name="intent" value="dev_billing_reset" />
            <s-button disabled={!showDanger} tone="critical" type="submit">
              Reset local billing state only
            </s-button>
          </Form>
        </s-box>
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
