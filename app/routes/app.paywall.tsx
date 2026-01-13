import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { data, useActionData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { paywallActionSchema } from "../schemas/admin";
import { getShopIdFromSession } from "../lib/tenancy";
import { inviteCodeErrorMessage, isInviteCodeValid } from "../lib/invite-code";
import logger from "../lib/logger";
import { captureEvent } from "../lib/posthog.server";
import {
  buildStandardSubscriptionInput,
  createStandardSubscription,
  buildEarlyAccessSubscriptionInput,
  createEarlyAccessSubscription,
} from "../services/shopify/billing.server";
import {
  activateEarlyAccessPlan,
  getShopPlanStatus,
  isPlanActive,
  setEarlyAccessPlanPending,
  setStandardPlanPending,
} from "../services/shops/plan.server";
import { PlanStatus } from "@prisma/client";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);

  captureEvent("paywall.viewed", { shop_id: shopId });
  logger.info({ shop_id: shopId }, "Paywall viewed");

  return null;
};

const buildReturnUrl = (request: Request): string => {
  const requestUrl = new URL(request.url);
  const returnUrl = new URL("/app/billing/confirm", requestUrl.origin);
  const host = requestUrl.searchParams.get("host");
  const embedded = requestUrl.searchParams.get("embedded");

  if (host) {
    returnUrl.searchParams.set("host", host);
  }

  if (embedded) {
    returnUrl.searchParams.set("embedded", embedded);
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

  if (isPlanActive(planStatus)) {
    return redirect("/app");
  }

  if (parsed.data.intent === "subscribe") {
    if (planStatus === PlanStatus.standard_pending) {
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

      return redirect(result.confirmationUrl);
    } catch (error) {
      captureEvent("paywall.subscribe_failed", { shop_id: shopId });
      logger.error({ shop_id: shopId, err: error }, "Paywall subscribe failed");

      return data(
        {
          error: {
            code: "billing_failed",
            message:
              "We couldn’t start the subscription. Please try again or contact support.",
          },
        },
        { status: 500 },
      );
    }
  }

  if (parsed.data.intent === "invite_unlock") {
    if (planStatus === PlanStatus.early_access_pending) {
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

      return redirect(result.confirmationUrl);
    } catch (error) {
      captureEvent("paywall.invite_unlock_failed", { shop_id: shopId });
      logger.error(
        { shop_id: shopId, err: error },
        "Paywall invite unlock failed",
      );

      return data(
        {
          error: {
            code: "billing_failed",
            message:
              "We couldn’t unlock Early Access. Please try again or contact support.",
          },
        },
        { status: 500 },
      );
    }
  }

  return data(
    { error: { code: "unsupported_intent", message: "Unsupported action." } },
    { status: 400 },
  );
};

export default function Paywall() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isInviteSubmitting =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "invite_unlock";
  const isSubscribeSubmitting =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "subscribe";

  return (
    <s-page heading="Personalize Design – Access Required">
      <s-section heading="Choose how to unlock access">
        <s-stack direction="block" gap="base">
          {actionData?.error ? (
            <s-banner tone="critical">
              <s-text>{actionData.error.message}</s-text>
            </s-banner>
          ) : null}
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Standard Plan</s-heading>
            <s-paragraph>$19/month + $0.25 per successful personalized order line</s-paragraph>
            <s-paragraph>
              Includes a 7-day free trial for the $19/month access fee.
            </s-paragraph>
            <s-paragraph>
              The trial does not waive AI usage charges or the $0.25 per order line fee.
            </s-paragraph>
            <s-paragraph>
              Standard and Early Access both include a one-time $1.00 free AI usage gift.
            </s-paragraph>
            <form method="post">
              <input type="hidden" name="intent" value="subscribe" />
              <s-button
                type="submit"
                variant="primary"
                {...(isSubscribeSubmitting ? { loading: true } : {})}
              >
                Subscribe
              </s-button>
            </form>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Early Access (Invite Code)</s-heading>
            <s-paragraph>
              Unlock Early Access with your invite code to access $0/month pricing during the program.
            </s-paragraph>
            <form method="post">
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
            </form>
          </s-box>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
