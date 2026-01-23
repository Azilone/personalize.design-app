import type {
  HeadersFunction,
  LoaderFunctionArgs,
  ShouldRevalidateFunction,
} from "react-router";
import {
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
import { getOrSetCachedValue } from "../../lib/ttl-cache.server";
import type { ReadinessItem } from "../../lib/readiness";
import {
  getSubscriptionStatus,
  getUsageLedgerSummary,
} from "../../services/shopify/billing.server";
import {
  activateEarlyAccessPlan,
  activateStandardPlan,
  clearPlanToNone,
  getShopPlan,
  getShopPlanStatus,
  isPlanActive,
} from "../../services/shops/plan.server";
import type { ShopReadinessSignals } from "../../services/shops/readiness.server";
import { PlanStatus } from "@prisma/client";

const SUBSCRIPTION_STATUS_CACHE_TTL_MS = 15_000;

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
  let plan = await getShopPlan(shopId);
  let planStatus = plan?.plan_status ?? PlanStatus.none;
  let shouldRefreshPlan = false;

  if (
    planStatus === PlanStatus.standard_pending ||
    planStatus === PlanStatus.early_access_pending
  ) {
    const subscriptionId = plan?.shopify_subscription_id ?? null;
    if (subscriptionId) {
      try {
        const subscription = await getOrSetCachedValue(
          `subscription-status:${subscriptionId}`,
          SUBSCRIPTION_STATUS_CACHE_TTL_MS,
          () =>
            getSubscriptionStatus({
              admin,
              subscriptionId,
            }),
        );

        if (subscription.status === "ACTIVE") {
          if (planStatus === PlanStatus.standard_pending) {
            await activateStandardPlan({
              shopId,
              subscriptionId: subscription.id,
              subscriptionStatus: subscription.status,
            });
            planStatus = PlanStatus.standard;
          }

          if (planStatus === PlanStatus.early_access_pending) {
            await activateEarlyAccessPlan({
              shopId,
              subscriptionId: subscription.id,
              subscriptionStatus: subscription.status,
            });
            planStatus = PlanStatus.early_access;
          }
          shouldRefreshPlan = true;
        } else if (subscription.status !== "PENDING") {
          await clearPlanToNone(shopId);
          planStatus = PlanStatus.none;
          shouldRefreshPlan = true;
        }
      } catch {
        // If billing status check fails, keep pending state and let paywall handle resume UX.
      }
    }
  }

  if (shouldRefreshPlan) {
    plan = await getShopPlan(shopId);
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

  const planStatusForUi = plan?.plan_status ?? planStatus;
  const ledgerSummary = await getUsageLedgerSummary({ shopId });
  const fallbackReadinessSignals: ShopReadinessSignals = {
    printifyConnected: false,
    storefrontPersonalizationEnabled: false,
    storefrontPersonalizationConfirmed: false,
    spendSafetyConfigured: false,
  };
  const readinessSignals = fallbackReadinessSignals;
  const readinessItems: ReadinessItem[] = [];

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
    freeGiftCents: ledgerSummary.giftGrantTotalCents,
    freeGiftRemainingCents: ledgerSummary.giftBalanceCents,
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
        <a href={`/app${embeddedSearch}`} rel="home">
          Setup
        </a>
        <a href={`/app/billing${embeddedSearch}`}>Usage & Billing</a>
        <a href={`/app/templates${embeddedSearch}`}>Templates</a>
        <a href={`/app/products${embeddedSearch}`}>Products</a>
        {isDev ? (
          <a href={`/app/dev${embeddedSearch}`}>Dev tools (dev)</a>
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
