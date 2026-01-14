import type { HeadersFunction } from "react-router";
import { useLocation, useRouteLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { PlanStatus } from "@prisma/client";
import { buildEmbeddedSearch } from "../lib/embedded-search";
import type { ReadinessItem } from "../lib/readiness";
import type { AppLoaderData } from "./app";

export default function Index() {
  const appData = useRouteLoaderData<AppLoaderData>("routes/app");
  const planStatus = appData?.planStatus ?? PlanStatus.none;
  const freeGiftCents = appData?.freeGiftCents ?? 0;
  const freeGiftRemainingCents = appData?.freeGiftRemainingCents ?? 0;
  const readinessItems: ReadinessItem[] = appData?.readinessItems ?? [];
  const { search } = useLocation();
  const formatUsd = (cents: number) => (cents / 100).toFixed(2);

  const embeddedSearch = buildEmbeddedSearch(search);

  return (
    <s-page heading="Dashboard">
      <s-section heading="Plan status">
        {planStatus === PlanStatus.early_access ? (
          <s-banner tone="success">
            <s-text>Early Access is active for your shop.</s-text>
          </s-banner>
        ) : null}
        {planStatus === PlanStatus.standard ? (
          <s-banner tone="success">
            <s-text>Standard plan is active for your shop.</s-text>
          </s-banner>
        ) : null}
        {planStatus === PlanStatus.none ? (
          <s-banner tone="critical">
            <s-text>
              Access is locked. Visit the paywall to subscribe or unlock Early
              Access.
            </s-text>
          </s-banner>
        ) : null}
        {planStatus === PlanStatus.standard_pending ? (
          <s-banner tone="warning">
            <s-text>
              Your Standard plan is pending. Please confirm the subscription in
              Shopify.
            </s-text>
          </s-banner>
        ) : null}
        {planStatus === PlanStatus.early_access_pending ? (
          <s-banner tone="warning">
            <s-text>
              Your Early Access activation is pending. Please confirm the
              subscription in Shopify.
            </s-text>
          </s-banner>
        ) : null}
        <s-paragraph>
          {planStatus === PlanStatus.standard
            ? "Standard includes a 7-day trial for the $19/month access fee only."
            : null}
          {planStatus === PlanStatus.early_access
            ? "Early Access is $0/month while the program is active."
            : null}
        </s-paragraph>
        {planStatus === PlanStatus.none ? (
          <s-link href={`/app/paywall${embeddedSearch}`}>Go to paywall</s-link>
        ) : null}
      </s-section>

      <s-section heading="Setup checklist">
        <s-stack direction="block" gap="base">
          {readinessItems.length === 0 ? (
            <s-banner tone="warning">
              <s-text>Setup checklist is unavailable right now.</s-text>
            </s-banner>
          ) : null}
          {readinessItems.map((item) => {
            const statusLabel =
              item.status === "complete" ? "Complete" : "Incomplete";
            const actionHref = item.actionHref
              ? `${item.actionHref}${embeddedSearch}`
              : null;

            return (
              <s-box
                key={item.key}
                padding="base"
                borderWidth="base"
                borderRadius="base"
              >
                <s-stack direction="block" gap="base">
                  <s-heading>{item.label}</s-heading>
                  <s-text>Status: {statusLabel}</s-text>
                  <s-paragraph>{item.hint}</s-paragraph>
                  {actionHref && item.actionLabel ? (
                    <s-link href={actionHref}>{item.actionLabel}</s-link>
                  ) : null}
                </s-stack>
              </s-box>
            );
          })}
        </s-stack>
      </s-section>

      <s-section heading="Billing overview">
        <s-paragraph>
          Free AI usage gift: ${formatUsd(freeGiftRemainingCents)} remaining (of
          ${formatUsd(freeGiftCents)}).
        </s-paragraph>
        <s-paragraph>
          Usage charges apply after the gift is used. Standard plan trial does
          not waive usage charges or the per-order fee.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
