import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getShopIdFromSession } from "../lib/tenancy";
import { buildEmbeddedRedirectPath } from "../lib/routing";
import { getSubscriptionStatus } from "../services/shopify/billing.server";
import {
  activateEarlyAccessPlan,
  activateStandardPlan,
  clearPlanToNone,
  getShopPlan,
} from "../services/shops/plan.server";
import { PlanStatus } from "@prisma/client";
import logger from "../lib/logger";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldLogAuthFlow = () =>
  process.env.NODE_ENV === "development" ||
  process.env.PD_DEBUG_AUTH_BOUNCE === "1";

const safeBillingConfirmLogContext = (request: Request) => {
  const url = new URL(request.url);

  const shop = url.searchParams.get("shop");
  const embedded = url.searchParams.get("embedded");
  const host = url.searchParams.get("host");
  const locale = url.searchParams.get("locale");
  const chargeId = url.searchParams.get("charge_id");

  return {
    path: url.pathname,
    has_shop: Boolean(shop),
    shop,
    embedded,
    has_host: Boolean(host),
    has_locale: Boolean(locale),
    has_charge_id: Boolean(chargeId),
    has_id_token: url.searchParams.has("id_token"),
    has_x_shopify_bounce: request.headers.has("X-Shopify-Bounce"),
    has_auth_header: request.headers.has("Authorization"),
  };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const logCtx = safeBillingConfirmLogContext(request);
  if (shouldLogAuthFlow()) {
    logger.info(logCtx, "Billing confirm requested");
  }

  try {
    const { admin, session, redirect } = await authenticate.admin(request);
    const shopId = getShopIdFromSession(session);
    const plan = await getShopPlan(shopId);

    if (!plan?.shopify_subscription_id) {
      return redirect(buildEmbeddedRedirectPath(request, "/app/paywall"));
    }

    const subscription = await getSubscriptionStatus({
      admin,
      subscriptionId: plan.shopify_subscription_id,
    });

    // Shopify can be eventually consistent right after approval; a short retry reduces UX flicker.
    let settledSubscription = subscription;
    if (subscription.status === "PENDING") {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await sleep(500);
        settledSubscription = await getSubscriptionStatus({
          admin,
          subscriptionId: plan.shopify_subscription_id,
        });
        if (settledSubscription.status !== "PENDING") {
          break;
        }
      }
    }

    if (settledSubscription.status === "ACTIVE") {
      if (plan.plan_status === PlanStatus.standard_pending) {
        await activateStandardPlan({
          shopId,
          subscriptionId: settledSubscription.id,
          subscriptionStatus: settledSubscription.status,
        });
      }

      if (plan.plan_status === PlanStatus.early_access_pending) {
        await activateEarlyAccessPlan({
          shopId,
          subscriptionId: settledSubscription.id,
          subscriptionStatus: settledSubscription.status,
        });
      }

      if (
        plan.plan_status === PlanStatus.standard ||
        plan.plan_status === PlanStatus.early_access
      ) {
        return redirect(buildEmbeddedRedirectPath(request, "/app"));
      }

      return redirect(buildEmbeddedRedirectPath(request, "/app"));
    }

    if (settledSubscription.status !== "PENDING") {
      await clearPlanToNone(shopId);
    }

    return redirect(buildEmbeddedRedirectPath(request, "/app/paywall"));
  } catch (error) {
    if (error instanceof Response) {
      if (shouldLogAuthFlow()) {
        const location = error.headers.get("location");
        let locationPath: string | null = null;

        if (location) {
          try {
            locationPath = new URL(location, request.url).pathname;
          } catch {
            locationPath = null;
          }
        }

        logger.info(
          {
            ...logCtx,
            status: error.status,
            has_location: Boolean(location),
            location_path: locationPath,
          },
          "Billing confirm responded (Response)",
        );
      }

      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    logger.error({ ...logCtx, err_message: message }, "Billing confirm failed");

    throw error;
  }
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
