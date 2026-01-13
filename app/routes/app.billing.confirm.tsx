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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const loader = async ({ request }: LoaderFunctionArgs) => {
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

    if (plan.plan_status === PlanStatus.standard ||
      plan.plan_status === PlanStatus.early_access) {
      return redirect(buildEmbeddedRedirectPath(request, "/app"));
    }

    return redirect(buildEmbeddedRedirectPath(request, "/app"));
  }

  if (settledSubscription.status !== "PENDING") {
    await clearPlanToNone(shopId);
  }

  return redirect(buildEmbeddedRedirectPath(request, "/app/paywall"));
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
