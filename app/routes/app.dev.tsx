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
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getShopIdFromSession } from "../lib/tenancy";
import { devBillingActionSchema } from "../schemas/admin";
import { buildEmbeddedRedirectPath } from "../lib/routing";
import {
  getShopPlan,
  resetPlanForDev,
} from "../services/shops/plan.server";
import { cancelSubscription } from "../services/shopify/billing.server";
import logger from "../lib/logger";
import { captureEvent } from "../lib/posthog.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (process.env.NODE_ENV !== "development") {
    throw new Response("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const showDanger =
    url.searchParams.get("danger") === "1" ||
    url.searchParams.get("danger") === "true";

  const { session } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);
  const plan = await getShopPlan(shopId);

  const embeddedSearchParams = new URLSearchParams();
  for (const key of ["host", "embedded", "shop", "locale"] as const) {
    const value = url.searchParams.get(key);
    if (value) {
      embeddedSearchParams.set(key, value);
    }
  }

  return {
    shopId,
    planStatus: plan?.plan_status ?? null,
    subscriptionId: plan?.shopify_subscription_id ?? null,
    subscriptionStatus: plan?.shopify_subscription_status ?? null,
    showDanger,
    embeddedSearch: embeddedSearchParams.toString()
      ? `?${embeddedSearchParams.toString()}`
      : "",
  };
};

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

  if (!parsed.success) {
    return data(
      { error: { code: "invalid_request", message: "Invalid request." } },
      { status: 400 },
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

  return data(
    { error: { code: "unsupported_intent", message: "Unsupported action." } },
    { status: 400 },
  );
};

export default function DevToolsBilling() {
  const {
    shopId,
    planStatus,
    subscriptionId,
    subscriptionStatus,
    showDanger,
    embeddedSearch,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const dangerSearch = embeddedSearch ? `${embeddedSearch}&danger=1` : "?danger=1";

  return (
    <s-page heading="Billing tools (dev)">
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
          Use these actions to re-test the paywall and switching plans on a dev
          store.
        </s-paragraph>

        <s-box padding="base">
          <s-link href={`/app/paywall${embeddedSearch}`}>Go to paywall</s-link>
        </s-box>

        <s-paragraph>
          <strong>Danger zone</strong>: these are destructive operations.
        </s-paragraph>
        {!showDanger ? (
          <s-banner tone="warning">
            <s-text>
              Destructive buttons are disabled.{" "}
              <s-link href={`/app/dev${dangerSearch}`}>Enable danger actions</s-link>.
            </s-text>
          </s-banner>
        ) : null}

        <s-box padding="base">
          <Form method="post">
            <input type="hidden" name="intent" value="dev_cancel_subscription" />
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
