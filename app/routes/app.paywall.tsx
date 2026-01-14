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
  useNavigate,
  useNavigation,
} from "react-router";
import { useEffect } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { paywallActionSchema } from "../schemas/admin";
import { getShopIdFromSession } from "../lib/tenancy";
import { buildEmbeddedRedirectPath } from "../lib/routing";
import { inviteCodeErrorMessage, isInviteCodeValid } from "../lib/invite-code";
import logger from "../lib/logger";
import { captureEvent } from "../lib/posthog.server";
import {
  buildStandardSubscriptionInput,
  createStandardSubscription,
  buildEarlyAccessSubscriptionInput,
  createEarlyAccessSubscription,
  getSubscriptionStatus,
} from "../services/shopify/billing.server";
import {
  activateEarlyAccessPlan,
  activateStandardPlan,
  clearPendingPlan,
  clearPlanToNone,
  getShopPlanStatus,
  getShopPlan,
  isPlanActive,
  reserveEarlyAccessPlanPending,
  reserveStandardPlanPending,
  resetPlanForDev,
  setEarlyAccessPlanPending,
  setStandardPlanPending,
} from "../services/shops/plan.server";
import { PlanStatus } from "@prisma/client";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);
  const plan = await getShopPlan(shopId);
  const planStatus = plan?.plan_status ?? PlanStatus.none;
  const isDev = process.env.NODE_ENV === "development";

  captureEvent("paywall.viewed", { shop_id: shopId });
  logger.info({ shop_id: shopId }, "Paywall viewed");

  return {
    planStatus,
    confirmationUrl: plan?.shopify_confirmation_url ?? null,
    subscriptionStatus: plan?.shopify_subscription_status ?? null,
    isDev,
  };
};

const buildReturnUrl = (request: Request): string => {
  const requestUrl = new URL(request.url);
  const returnUrl = new URL("/app/billing/confirm", requestUrl.origin);
  const host = requestUrl.searchParams.get("host");
  const embedded = requestUrl.searchParams.get("embedded");
  const shop = requestUrl.searchParams.get("shop");
  const locale = requestUrl.searchParams.get("locale");

  if (host) {
    returnUrl.searchParams.set("host", host);
  }

  if (embedded) {
    returnUrl.searchParams.set("embedded", embedded);
  }

  if (shop) {
    returnUrl.searchParams.set("shop", shop);
  }

  if (locale) {
    returnUrl.searchParams.set("locale", locale);
  }

  return returnUrl.toString();
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session, redirect } = await authenticate.admin(request);
  const formData = Object.fromEntries(await request.formData());
  const parsed = paywallActionSchema.safeParse(formData);

  if (!parsed.success) {
    return data(
      { error: { code: "invalid_request", message: "Invalid request." } },
      { status: 400 },
    );
  }

  const shopId = getShopIdFromSession(session);
  const planStatus = await getShopPlanStatus(shopId);
  const plan = await getShopPlan(shopId);

  if (isPlanActive(planStatus)) {
    return redirect(buildEmbeddedRedirectPath(request, "/app"));
  }

  if (parsed.data.intent === "reset_billing_dev") {
    if (process.env.NODE_ENV !== "development") {
      return data(
        { error: { code: "not_found", message: "Not found." } },
        { status: 404 },
      );
    }

    await resetPlanForDev(shopId);
    return redirect(buildEmbeddedRedirectPath(request, "/app/paywall"));
  }

  const resolveBillingErrorMessage = (
    error: unknown,
    fallback: string,
  ): string => {
    if (error instanceof Error) {
      if (error.message.includes("public distribution")) {
        return "Billing isn’t available yet. In the Partner Dashboard, set App distribution to Public and configure your plan, then retry.";
      }
    }

    return fallback;
  };

  if (parsed.data.intent === "subscribe") {
    if (planStatus === PlanStatus.standard_pending) {
      if (plan?.shopify_confirmation_url) {
        return data({ confirmation_url: plan.shopify_confirmation_url });
      }

      return data(
        {
          error: {
            code: "subscription_pending",
            message:
              "Your subscription is pending. Please confirm it in Shopify or contact support.",
          },
        },
        { status: 409 },
      );
    }

    const reservation = await reserveStandardPlanPending(shopId);
    if (!reservation.acquired) {
      if (reservation.planStatus === PlanStatus.standard_pending) {
        if (plan?.shopify_confirmation_url) {
          return data({ confirmation_url: plan.shopify_confirmation_url });
        }

        return data(
          {
            error: {
              code: "subscription_pending",
              message:
                "Your subscription is pending. Please confirm it in Shopify or contact support.",
            },
          },
          { status: 409 },
        );
      }

      if (reservation.planStatus === PlanStatus.early_access_pending) {
        return data(
          {
            error: {
              code: "other_plan_pending",
              message:
                "Your Early Access activation is pending. Please confirm it in Shopify or restart billing setup.",
            },
          },
          { status: 409 },
        );
      }

      if (isPlanActive(reservation.planStatus)) {
        return redirect(buildEmbeddedRedirectPath(request, "/app"));
      }

      return data(
        {
          error: {
            code: "subscription_locked",
            message:
              "We’re already processing your subscription. Please wait a moment and try again.",
          },
        },
        { status: 409 },
      );
    }

    captureEvent("paywall.subscribe_clicked", { shop_id: shopId });
    logger.info(
      { shop_id: shopId, intent: "subscribe" },
      "Paywall subscribe clicked",
    );

    const subscriptionInput = buildStandardSubscriptionInput({
      returnUrl: buildReturnUrl(request),
    });

    try {
      const result = await createStandardSubscription({
        admin,
        subscriptionInput,
      });

      await setStandardPlanPending({
        shopId,
        subscriptionId: result.subscriptionId,
        subscriptionStatus: result.subscriptionStatus,
        confirmationUrl: result.confirmationUrl,
      });

      captureEvent("paywall.subscribe_succeeded", {
        shop_id: shopId,
        subscription_id: result.subscriptionId,
        subscription_status: result.subscriptionStatus,
      });
      logger.info(
        {
          shop_id: shopId,
          subscription_id: result.subscriptionId,
          subscription_status: result.subscriptionStatus,
        },
        "Paywall subscribe created",
      );

      return data({ confirmation_url: result.confirmationUrl });
    } catch (error) {
      captureEvent("paywall.subscribe_failed", { shop_id: shopId });
      logger.error({ shop_id: shopId, err: error }, "Paywall subscribe failed");
      await clearPendingPlan({
        shopId,
        pendingStatus: "standard_pending",
      });

      return data(
        {
          error: {
            code: "billing_failed",
            message: resolveBillingErrorMessage(
              error,
              "We couldn’t start the subscription. Please try again or contact support.",
            ),
          },
        },
        { status: 500 },
      );
    }
  }

  if (parsed.data.intent === "invite_unlock") {
    if (planStatus === PlanStatus.early_access_pending) {
      if (plan?.shopify_confirmation_url) {
        return data({ confirmation_url: plan.shopify_confirmation_url });
      }

      return data(
        {
          error: {
            code: "subscription_pending",
            message:
              "Your Early Access activation is pending. Please confirm it in Shopify or contact support.",
          },
        },
        { status: 409 },
      );
    }

    const reservation = await reserveEarlyAccessPlanPending(shopId);
    if (!reservation.acquired) {
      if (reservation.planStatus === PlanStatus.early_access_pending) {
        if (plan?.shopify_confirmation_url) {
          return data({ confirmation_url: plan.shopify_confirmation_url });
        }

        return data(
          {
            error: {
              code: "subscription_pending",
              message:
                "Your Early Access activation is pending. Please confirm it in Shopify or contact support.",
            },
          },
          { status: 409 },
        );
      }

      if (reservation.planStatus === PlanStatus.standard_pending) {
        return data(
          {
            error: {
              code: "other_plan_pending",
              message:
                "Your Standard subscription is pending. Please confirm it in Shopify or restart billing setup.",
            },
          },
          { status: 409 },
        );
      }

      if (isPlanActive(reservation.planStatus)) {
        return redirect(buildEmbeddedRedirectPath(request, "/app"));
      }

      return data(
        {
          error: {
            code: "subscription_locked",
            message:
              "We’re already processing your Early Access activation. Please wait a moment and try again.",
          },
        },
        { status: 409 },
      );
    }

    captureEvent("paywall.invite_unlock_attempted", { shop_id: shopId });
    logger.info(
      { shop_id: shopId, intent: "invite_unlock" },
      "Paywall invite unlock attempted",
    );

    if (!isInviteCodeValid(parsed.data.invite_code)) {
      await new Promise((resolve) => setTimeout(resolve, 3000));

      captureEvent("paywall.invite_unlock_failed", { shop_id: shopId });
      logger.warn(
        { shop_id: shopId, intent: "invite_unlock" },
        "Paywall invite unlock failed",
      );

      return data(
        {
          error: {
            code: "invalid_invite_code",
            message: inviteCodeErrorMessage(),
          },
        },
        { status: 400 },
      );
    }

    const subscriptionInput = buildEarlyAccessSubscriptionInput({
      returnUrl: buildReturnUrl(request),
    });

    try {
      const result = await createEarlyAccessSubscription({
        admin,
        subscriptionInput,
      });

      await setEarlyAccessPlanPending({
        shopId,
        subscriptionId: result.subscriptionId,
        subscriptionStatus: result.subscriptionStatus,
        confirmationUrl: result.confirmationUrl,
      });

      if (result.subscriptionStatus === "ACTIVE") {
        await activateEarlyAccessPlan({
          shopId,
          subscriptionId: result.subscriptionId,
          subscriptionStatus: result.subscriptionStatus,
        });
      }

      captureEvent("paywall.invite_unlock_succeeded", {
        shop_id: shopId,
        subscription_id: result.subscriptionId,
        subscription_status: result.subscriptionStatus,
      });
      logger.info(
        {
          shop_id: shopId,
          subscription_id: result.subscriptionId,
          subscription_status: result.subscriptionStatus,
        },
        "Paywall invite unlock succeeded",
      );

      return data({ confirmation_url: result.confirmationUrl });
    } catch (error) {
      captureEvent("paywall.invite_unlock_failed", { shop_id: shopId });
      logger.error(
        { shop_id: shopId, err: error },
        "Paywall invite unlock failed",
      );
      await clearPendingPlan({
        shopId,
        pendingStatus: "early_access_pending",
      });

      return data(
        {
          error: {
            code: "billing_failed",
            message: resolveBillingErrorMessage(
              error,
              "We couldn’t unlock Early Access. Please try again or contact support.",
            ),
          },
        },
        { status: 500 },
      );
    }
  }

  if (parsed.data.intent === "sync_pending_status") {
    if (
      plan?.shopify_subscription_id &&
      (planStatus === PlanStatus.standard_pending ||
        planStatus === PlanStatus.early_access_pending)
    ) {
      try {
        const subscription = await getSubscriptionStatus({
          admin,
          subscriptionId: plan.shopify_subscription_id,
        });

        if (subscription.status === "ACTIVE") {
          if (planStatus === PlanStatus.standard_pending) {
            await activateStandardPlan({
              shopId,
              subscriptionId: subscription.id,
              subscriptionStatus: subscription.status,
            });
          }

          if (planStatus === PlanStatus.early_access_pending) {
            await activateEarlyAccessPlan({
              shopId,
              subscriptionId: subscription.id,
              subscriptionStatus: subscription.status,
            });
          }

          return redirect(buildEmbeddedRedirectPath(request, "/app"));
        }

        if (subscription.status !== "PENDING") {
          await clearPlanToNone(shopId);
          return data(
            {
              error: {
                code: "subscription_not_active",
                message:
                  "The subscription wasn’t approved. Please try again to start a new subscription.",
              },
            },
            { status: 409 },
          );
        }

        if (plan.shopify_confirmation_url) {
          return data({ confirmation_url: plan.shopify_confirmation_url });
        }

        return data(
          {
            error: {
              code: "subscription_pending",
              message:
                "Your subscription is pending. Please confirm it in Shopify.",
            },
          },
          { status: 409 },
        );
      } catch (error) {
        logger.error(
          { shop_id: shopId, err: error },
          "Paywall subscription status sync failed",
        );
      }
    }

    return data(
      {
        error: {
          code: "subscription_not_found",
          message: "No pending subscription found.",
        },
      },
      { status: 404 },
    );
  }

  return data(
    { error: { code: "unsupported_intent", message: "Unsupported action." } },
    { status: 400 },
  );
};

export default function Paywall() {
  const actionData = useActionData<typeof action>();
  const { planStatus, confirmationUrl, subscriptionStatus, isDev } =
    useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const isInviteSubmitting =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "invite_unlock";
  const isSubscribeSubmitting =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "subscribe";
  const isResetSubmitting =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "reset_billing_dev";
  const isSyncSubmitting =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "sync_pending_status";
  const showReset =
    planStatus === PlanStatus.standard_pending ||
    planStatus === PlanStatus.early_access_pending;

  const errorMessage =
    actionData && typeof actionData === "object" && "error" in actionData
      ? actionData.error.message
      : null;

  useEffect(() => {
    if (!actionData || typeof actionData !== "object") {
      return;
    }

    if (!("confirmation_url" in actionData)) {
      return;
    }

    const url = actionData.confirmation_url;
    if (typeof url !== "string" || !url) {
      return;
    }

    navigate(url);
  }, [actionData, navigate]);

  return (
    <s-page heading="Paywall – Access Required">
      <s-section heading="Choose how to unlock access">
        <s-stack direction="block" gap="base">
          {errorMessage ? (
            <s-banner tone="critical">
              <s-text>{errorMessage}</s-text>
            </s-banner>
          ) : null}
          {showReset ? (
            <s-banner tone="warning">
              <s-text>
                A subscription is pending. If you don’t see the Shopify
                confirmation screen, you may have closed it or it may have been
                blocked.
              </s-text>
              {subscriptionStatus ? (
                <s-paragraph>Status: {subscriptionStatus}</s-paragraph>
              ) : null}
              {confirmationUrl ? (
                <s-button
                  variant="primary"
                  onClick={() => navigate(confirmationUrl)}
                >
                  Continue on Shopify
                </s-button>
              ) : null}
              <s-paragraph>
                If you hit Back or closed the screen, use “Continue on Shopify”.
              </s-paragraph>
              <Form method="post">
                <input
                  type="hidden"
                  name="intent"
                  value="sync_pending_status"
                />
                <s-button
                  type="submit"
                  variant="secondary"
                  {...(isSyncSubmitting ? { loading: true } : {})}
                >
                  I already approved
                </s-button>
              </Form>
              {isDev ? (
                <Form method="post">
                  <input
                    type="hidden"
                    name="intent"
                    value="reset_billing_dev"
                  />
                  <s-button
                    type="submit"
                    variant="tertiary"
                    {...(isResetSubmitting ? { loading: true } : {})}
                  >
                    Reset billing state (dev)
                  </s-button>
                </Form>
              ) : null}
            </s-banner>
          ) : null}
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Standard Plan</s-heading>
            <s-paragraph>
              $19/month + $0.25 per successful personalized order line
            </s-paragraph>
            <s-paragraph>
              Includes a 7-day free trial for the $19/month access fee.
            </s-paragraph>
            <s-paragraph>
              The trial does not waive AI usage charges or the $0.25 per order
              line fee.
            </s-paragraph>
            <s-paragraph>
              Standard and Early Access both include a one-time $1.00 free AI
              usage gift.
            </s-paragraph>
            <Form method="post">
              <input type="hidden" name="intent" value="subscribe" />
              <s-button
                type="submit"
                variant="primary"
                {...(isSubscribeSubmitting ? { loading: true } : {})}
              >
                Subscribe
              </s-button>
            </Form>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Early Access (Invite Code)</s-heading>
            <s-paragraph>
              Unlock Early Access with your invite code to access $0/month
              pricing during the program.
            </s-paragraph>
            <Form method="post">
              <input type="hidden" name="intent" value="invite_unlock" />
              <s-stack direction="inline" gap="base">
                <s-text-field
                  label="Invite code"
                  placeholder="Enter invite code"
                  name="invite_code"
                  disabled={isInviteSubmitting}
                />
                <s-button
                  type="submit"
                  variant="secondary"
                  {...(isInviteSubmitting ? { loading: true } : {})}
                >
                  Unlock Early Access
                </s-button>
              </s-stack>
            </Form>
          </s-box>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
