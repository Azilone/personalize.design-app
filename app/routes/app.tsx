import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { getShopIdFromSession } from "../lib/tenancy";
import { isPaywallPath } from "../lib/routing";
import { getShopPlanStatus, isPlanActive } from "../services/shops/plan.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, redirect } = await authenticate.admin(request);
  const pathname = new URL(request.url).pathname;
  const shopId = getShopIdFromSession(session);
  const planStatus = await getShopPlanStatus(shopId);
  const hasAccess = isPlanActive(planStatus);

  if (!hasAccess && !isPaywallPath(pathname)) {
    return redirect("/app/paywall");
  }

  if (hasAccess && isPaywallPath(pathname)) {
    return redirect("/app");
  }

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Home</s-link>
        <s-link href="/app/additional">Additional page</s-link>
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
