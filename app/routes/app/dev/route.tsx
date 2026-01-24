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
import { authenticate } from "../../../shopify.server";
import { getShopIdFromSession } from "../../../lib/tenancy";
import { buildEmbeddedSearch } from "../../../lib/embedded-search";
import { devBillingActionSchema } from "../../../schemas/admin";
import { buildEmbeddedRedirectPath } from "../../../lib/routing";
import {
  getShopPlan,
  resetPlanForDev,
} from "../../../services/shops/plan.server";
import {
  cancelSubscription,
  addFakeUsageCharge,
  resetUsageGift,
  consumeUsageGift,
  resetPaidUsage,
} from "../../../services/shopify/billing.server";
import { resetOnboardingForDev } from "../../../services/shops/onboarding-reset.server";
import { waivePendingTemplateTestGenerationEvents } from "../../../services/shopify/billable-events.server";
import logger from "../../../lib/logger";
import { captureEvent } from "../../../lib/posthog.server";
import type { AppLoaderData } from "../route";

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

  if (parsed.data.intent === "dev_reconcile_billing") {
    const result = await waivePendingTemplateTestGenerationEvents(shopId);
    captureEvent("dev.billing_reconcile", {
      shop_id: shopId,
      updated_count: result.updated,
    });
    return data({
      success: {
        code: "billing_reconciled",
        message: `Waived ${result.updated} pending test generation events.`,
      },
    });
  }

  if (parsed.data.intent === "dev_add_fake_charge") {
    await addFakeUsageCharge({
      shopId,
      amountUsd: 9.97,
    });
    captureEvent("dev.add_fake_charge", {
      shop_id: shopId,
      amount_usd: 9.97,
    });
    return data({
      success: {
        code: "fake_charge_added",
        message: "Added $9.97 fake charge to ledger.",
      },
    });
  }

  if (parsed.data.intent === "dev_reset_usage_gift") {
    await resetUsageGift(shopId);
    captureEvent("dev.reset_usage_gift", { shop_id: shopId });
    return data({
      success: {
        code: "usage_gift_reset",
        message: "Usage gift balance reset to full ($1.00).",
      },
    });
  }

  if (parsed.data.intent === "dev_consume_usage_gift") {
    await consumeUsageGift(shopId);
    captureEvent("dev.consume_usage_gift", { shop_id: shopId });
    return data({
      success: {
        code: "usage_gift_consumed",
        message: "Usage gift balance consumed fully ($0.00).",
      },
    });
  }

  if (parsed.data.intent === "dev_reset_paid_usage") {
    await resetPaidUsage(shopId);
    captureEvent("dev.reset_paid_usage", { shop_id: shopId });
    return data({
      success: {
        code: "paid_usage_reset",
        message: "Paid usage month-to-date reset to $0.00.",
      },
    });
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
  const actionError =
    actionData && "error" in actionData ? actionData.error : null;
  const actionSuccess =
    actionData && "success" in actionData ? actionData.success : null;

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
        {actionError ? (
          <s-banner tone="critical">
            <s-text>{actionError.message}</s-text>
          </s-banner>
        ) : null}
        {actionSuccess ? (
          <s-banner tone="success">
            <s-text>{actionSuccess.message}</s-text>
          </s-banner>
        ) : null}

        <s-paragraph>
          Use these actions to re-test onboarding and billing flows on a dev
          store.
        </s-paragraph>

        <s-box padding="base">
          <Link to={`/app/paywall${embeddedSearch}`}>Go to paywall</Link>
        </s-box>

        {!showDanger ? (
          <s-banner tone="warning">
            <s-text>
              Destructive buttons are disabled.{" "}
              <Link to={`/app/dev${dangerSearch}`}>Enable danger actions</Link>.
            </s-text>
          </s-banner>
        ) : null}

        <div
          style={{
            display: "grid",
            gap: "1rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          }}
        >
          <s-card>
            <s-stack direction="block" gap="base">
              <s-heading>Onboarding</s-heading>
              <s-paragraph>
                Resets spend safety, storefront, and Printify completion.
              </s-paragraph>
              <Form method="post">
                <input
                  type="hidden"
                  name="intent"
                  value="dev_onboarding_reset"
                />
                <s-button disabled={!showDanger} tone="critical" type="submit">
                  Reset onboarding state
                </s-button>
              </Form>
            </s-stack>
          </s-card>

          <s-card>
            <s-stack direction="block" gap="base">
              <s-heading>Subscription</s-heading>
              <s-paragraph>
                Cancels Shopify subscription and resets local plan to 'none'.
              </s-paragraph>
              <s-stack direction="inline" gap="small">
                <Form method="post">
                  <input
                    type="hidden"
                    name="intent"
                    value="dev_cancel_subscription"
                  />
                  <s-button
                    disabled={!showDanger}
                    tone="critical"
                    type="submit"
                  >
                    Cancel & Reset
                  </s-button>
                </Form>
                <Form method="post">
                  <input
                    type="hidden"
                    name="intent"
                    value="dev_billing_reset"
                  />
                  <s-button
                    disabled={!showDanger}
                    tone="critical"
                    type="submit"
                  >
                    Reset Local Only
                  </s-button>
                </Form>
              </s-stack>
            </s-stack>
          </s-card>

          <s-card>
            <s-stack direction="block" gap="base">
              <s-heading>Billing Ledger (Gift)</s-heading>
              <s-paragraph>
                Reset gift to $1.00 or consume it to $0.00 to test paid usage
                transitions.
              </s-paragraph>
              <s-stack direction="inline" gap="small">
                <Form method="post">
                  <input
                    type="hidden"
                    name="intent"
                    value="dev_reset_usage_gift"
                  />
                  <s-button disabled={!showDanger} type="submit">
                    Reset Gift to Full
                  </s-button>
                </Form>
                <Form method="post">
                  <input
                    type="hidden"
                    name="intent"
                    value="dev_consume_usage_gift"
                  />
                  <s-button disabled={!showDanger} type="submit">
                    Consume Gift
                  </s-button>
                </Form>
              </s-stack>
            </s-stack>
          </s-card>

          <s-card>
            <s-stack direction="block" gap="base">
              <s-heading>Billing Ledger (Paid Spend)</s-heading>
              <s-paragraph>
                Reset MTD spend or add fake charges to test cap limits.
              </s-paragraph>
              <s-stack direction="inline" gap="small">
                <Form method="post">
                  <input
                    type="hidden"
                    name="intent"
                    value="dev_reset_paid_usage"
                  />
                  <s-button disabled={!showDanger} type="submit">
                    Reset Spend to $0
                  </s-button>
                </Form>
                <Form method="post">
                  <input
                    type="hidden"
                    name="intent"
                    value="dev_add_fake_charge"
                  />
                  <s-button disabled={!showDanger} type="submit">
                    Add Fake $9.97
                  </s-button>
                </Form>
              </s-stack>
            </s-stack>
          </s-card>

          <s-card>
            <s-stack direction="block" gap="base">
              <s-heading>Reconciliation</s-heading>
              <s-paragraph>
                Fixes stuck 'pending' generation events by marking them waived.
              </s-paragraph>
              <Form method="post">
                <input
                  type="hidden"
                  name="intent"
                  value="dev_reconcile_billing"
                />
                <s-button disabled={!showDanger} type="submit">
                  Waive pending events
                </s-button>
              </Form>
            </s-stack>
          </s-card>
        </div>
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
