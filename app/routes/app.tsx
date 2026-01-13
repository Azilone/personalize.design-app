import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useLocation, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { getShopIdFromSession } from "../lib/tenancy";
import { buildEmbeddedRedirectPath, isPaywallPath } from "../lib/routing";
import { getSubscriptionStatus } from "../services/shopify/billing.server";
import {
  activateEarlyAccessPlan,
  activateStandardPlan,
  clearPlanToNone,
  getShopPlan,
  getShopPlanStatus,
  isPlanActive,
} from "../services/shops/plan.server";
import { PlanStatus } from "@prisma/client";

export type AppLoaderData = {
  apiKey: string;
  isDev: boolean;
  planStatus: PlanStatus;
  freeGiftCents: number;
  freeGiftRemainingCents: number;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session, redirect } = await authenticate.admin(request);
  const pathname = new URL(request.url).pathname;
  const shopId = getShopIdFromSession(session);
  let planStatus = await getShopPlanStatus(shopId);

  if (
    planStatus === PlanStatus.standard_pending ||
    planStatus === PlanStatus.early_access_pending
  ) {
    const plan = await getShopPlan(shopId);

    if (plan?.shopify_subscription_id) {
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

          planStatus = await getShopPlanStatus(shopId);
        } else if (subscription.status !== "PENDING") {
          await clearPlanToNone(shopId);
          planStatus = PlanStatus.none;
        }
      } catch {
        // If billing status check fails, keep pending state and let paywall handle resume UX.
      }
    }
  }
  const hasAccess = isPlanActive(planStatus);
  const isDev = process.env.NODE_ENV === "development";
  const isDevToolsPath = pathname === "/app/dev" || pathname === "/app/dev/";
  const allowWhenLocked = isPaywallPath(pathname) || (isDev && isDevToolsPath);

  if (!hasAccess && !allowWhenLocked) {
    return redirect(buildEmbeddedRedirectPath(request, "/app/paywall"));
  }

  if (hasAccess && isPaywallPath(pathname)) {
    return redirect(buildEmbeddedRedirectPath(request, "/app"));
  }

  const plan = await getShopPlan(shopId);

  // eslint-disable-next-line no-undef
  const data: AppLoaderData = {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    isDev,
    planStatus: plan?.plan_status ?? PlanStatus.none,
    freeGiftCents: plan?.free_usage_gift_cents ?? 0,
    freeGiftRemainingCents: plan?.free_usage_gift_remaining_cents ?? 0,
  };

  return data;
};

export default function App() {
  const { apiKey, isDev } = useLoaderData<typeof loader>();
  const { search } = useLocation();

  const embeddedSearch = (() => {
    const current = new URLSearchParams(search);
    const next = new URLSearchParams();

    for (const key of ["host", "embedded", "shop", "locale"] as const) {
      const value = current.get(key);
      if (value) {
        next.set(key, value);
      }
    }

    const query = next.toString();
    return query ? `?${query}` : "";
  })();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href={`/app${embeddedSearch}`}>Dashboard</s-link>
        {isDev ? (
          <s-link href={`/app/additional${embeddedSearch}`}>
            Sandbox (dev)
          </s-link>
        ) : null}
        {isDev ? (
          <s-link href={`/app/dev${embeddedSearch}`}>Billing tools (dev)</s-link>
        ) : null}
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
