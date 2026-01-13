import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getShopIdFromSession } from "../lib/tenancy";
import { getSubscriptionStatus } from "../services/shopify/billing.server";
import {
  activateEarlyAccessPlan,
  activateStandardPlan,
  getShopPlan,
} from "../services/shops/plan.server";
import { PlanStatus } from "@prisma/client";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session, redirect } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);
  const plan = await getShopPlan(shopId);

  if (!plan?.shopify_subscription_id) {
    return redirect("/app/paywall");
  }

  const subscription = await getSubscriptionStatus({
    admin,
    subscriptionId: plan.shopify_subscription_id,
  });

  if (subscription.status === "ACTIVE") {
    if (plan.plan_status === PlanStatus.standard_pending) {
      await activateStandardPlan({
        shopId,
        subscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
      });
    }

    if (plan.plan_status === PlanStatus.early_access_pending) {
      await activateEarlyAccessPlan({
        shopId,
        subscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
      });
    }

    if (plan.plan_status === PlanStatus.standard ||
      plan.plan_status === PlanStatus.early_access) {
      return redirect("/app");
    }

    return redirect("/app");
  }

  return redirect("/app/paywall");
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
