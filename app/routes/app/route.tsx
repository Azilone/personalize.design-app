import type {
  HeadersFunction,
  LoaderFunctionArgs,
  ShouldRevalidateFunction,
} from "react-router";
import {
  Link,
  Outlet,
  useLoaderData,
  useLocation,
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";

import { authenticate } from "../../shopify.server";
import { getShopIdFromSession } from "../../lib/tenancy";
import { buildEmbeddedRedirectPath, isPaywallPath } from "../../lib/routing";
import { buildEmbeddedSearch } from "../../lib/embedded-search";
import {
  buildReadinessChecklist,
  type ReadinessItem,
} from "../../lib/readiness";
import { getSubscriptionStatus } from "../../services/shopify/billing.server";
import {
  activateEarlyAccessPlan,
  activateStandardPlan,
  clearPlanToNone,
  getShopPlan,
  getShopPlanStatus,
  isPlanActive,
} from "../../services/shops/plan.server";
import {
  getShopReadinessSignals,
  type ShopReadinessSignals,
} from "../../services/shops/readiness.server";
import { PlanStatus } from "@prisma/client";

export type AppLoaderData = {
  apiKey: string;
  isDev: boolean;
  shopId: string;
  planStatus: PlanStatus;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  readinessItems: ReadinessItem[];
  readinessSignals: ShopReadinessSignals;
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

  if (!isDev && isDevToolsPath) {
    throw new Response("Not found", { status: 404 });
  }

  if (!hasAccess && !allowWhenLocked) {
    return redirect(buildEmbeddedRedirectPath(request, "/app/paywall"));
  }

  if (hasAccess && isPaywallPath(pathname)) {
    return redirect(buildEmbeddedRedirectPath(request, "/app"));
  }

  const plan = await getShopPlan(shopId);
  const planStatusForUi = plan?.plan_status ?? PlanStatus.none;
  const readinessSignals = await getShopReadinessSignals(shopId);

  const readinessItems = buildReadinessChecklist({
    planStatus: planStatusForUi,
    ...readinessSignals,
  });

  // eslint-disable-next-line no-undef
  const data: AppLoaderData = {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    isDev,
    shopId,
    planStatus: planStatusForUi,
    subscriptionId: plan?.shopify_subscription_id ?? null,
    subscriptionStatus: plan?.shopify_subscription_status ?? null,
    readinessItems,
    readinessSignals,
    freeGiftCents: plan?.free_usage_gift_cents ?? 0,
    freeGiftRemainingCents: plan?.free_usage_gift_remaining_cents ?? 0,
  };

  return data;
};

export const shouldRevalidate: ShouldRevalidateFunction = ({
  formMethod,
  defaultShouldRevalidate,
}) => {
  if (formMethod) {
    return defaultShouldRevalidate;
  }

  return defaultShouldRevalidate;
};

export default function App() {
  const { apiKey, isDev } = useLoaderData<typeof loader>();
  const { search } = useLocation();
  const embeddedSearch = buildEmbeddedSearch(search);

  return (
    <AppProvider embedded apiKey={apiKey}>
      <NavMenu>
        <Link to={`/app${embeddedSearch}`} rel="home">
          Setup
        </Link>
        <Link to={`/app/templates${embeddedSearch}`}>Templates</Link>
        <Link to={`/app/products${embeddedSearch}`}>Products</Link>
        {isDev ? (
          <Link to={`/app/additional${embeddedSearch}`}>Sandbox (dev)</Link>
        ) : null}
        {isDev ? (
          <Link to={`/app/dev${embeddedSearch}`}>Dev tools (dev)</Link>
        ) : null}
      </NavMenu>
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
