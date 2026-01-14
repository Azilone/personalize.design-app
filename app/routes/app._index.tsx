import type { ActionFunctionArgs, HeadersFunction } from "react-router";
import {
  Form,
  data,
  useActionData,
  useLocation,
  useNavigation,
  useRouteLoaderData,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { PlanStatus } from "@prisma/client";
import { authenticate } from "../shopify.server";
import { buildEmbeddedSearch } from "../lib/embedded-search";
import { getShopIdFromSession } from "../lib/tenancy";
import { canFinishOnboarding, type ReadinessItem } from "../lib/readiness";
import { finishOnboardingActionSchema } from "../schemas/admin";
import { getShopReadinessSignals } from "../services/shops/readiness.server";
import type { AppLoaderData } from "./app";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);
  const formData = Object.fromEntries(await request.formData());
  const parsed = finishOnboardingActionSchema.safeParse(formData);

  if (!parsed.success) {
    return data(
      { error: { code: "invalid_request", message: "Invalid request." } },
      { status: 400 },
    );
  }

  const readinessSignals = await getShopReadinessSignals(shopId);
  const canFinish = canFinishOnboarding({
    printifyConnected: readinessSignals.printifyConnected,
    storefrontPersonalizationConfirmed:
      readinessSignals.storefrontPersonalizationConfirmed,
  });

  if (!canFinish) {
    return data(
      {
        error: {
          code: "onboarding_requirements_incomplete",
          message:
            "Connect Printify and confirm storefront personalization before finishing onboarding.",
        },
      },
      { status: 400 },
    );
  }

  return data({ success: true });
};

export default function Index() {
  const appData = useRouteLoaderData<AppLoaderData>("routes/app");
  const planStatus = appData?.planStatus ?? PlanStatus.none;
  const freeGiftCents = appData?.freeGiftCents ?? 0;
  const freeGiftRemainingCents = appData?.freeGiftRemainingCents ?? 0;
  const readinessItems: ReadinessItem[] = appData?.readinessItems ?? [];
  const readinessSignals = appData?.readinessSignals ?? null;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const { search } = useLocation();
  const formatUsd = (cents: number) => (cents / 100).toFixed(2);

  const embeddedSearch = buildEmbeddedSearch(search);
  const errorMessage =
    actionData && typeof actionData === "object" && "error" in actionData
      ? actionData.error.message
      : null;
  const successMessage =
    actionData && typeof actionData === "object" && "success" in actionData
      ? "Onboarding marked as complete."
      : null;
  const isSubmitting =
    navigation.formData?.get("intent") === "finish_onboarding";
  const canFinish = readinessSignals
    ? canFinishOnboarding({
        printifyConnected: readinessSignals.printifyConnected,
        storefrontPersonalizationConfirmed:
          readinessSignals.storefrontPersonalizationConfirmed,
      })
    : false;

  return (
    <s-page heading="Setup">
      <s-section heading="Plan status">
        <s-stack direction="block" gap="base">
          {planStatus === PlanStatus.early_access ? (
            <s-banner tone="success">
              <s-stack direction="inline" gap="small">
                <s-badge tone="success">Active</s-badge>
                <s-text>Early Access is active for your shop.</s-text>
              </s-stack>
            </s-banner>
          ) : null}
          {planStatus === PlanStatus.standard ? (
            <s-banner tone="success">
              <s-stack direction="inline" gap="small">
                <s-badge tone="success">Active</s-badge>
                <s-text>Standard plan is active for your shop.</s-text>
              </s-stack>
            </s-banner>
          ) : null}
          {planStatus === PlanStatus.none ? (
            <s-banner tone="critical">
              <s-stack direction="inline" gap="small">
                <s-badge tone="critical">Locked</s-badge>
                <s-text>
                  Access is locked. Visit the paywall to subscribe or unlock Early
                  Access.
                </s-text>
              </s-stack>
            </s-banner>
          ) : null}
          {planStatus === PlanStatus.standard_pending ? (
            <s-banner tone="warning">
              <s-stack direction="inline" gap="small">
                <s-badge tone="warning">Pending</s-badge>
                <s-text>
                  Your Standard plan is pending. Please confirm the subscription in
                  Shopify.
                </s-text>
              </s-stack>
            </s-banner>
          ) : null}
          {planStatus === PlanStatus.early_access_pending ? (
            <s-banner tone="warning">
              <s-stack direction="inline" gap="small">
                <s-badge tone="warning">Pending</s-badge>
                <s-text>
                  Your Early Access activation is pending. Please confirm the
                  subscription in Shopify.
                </s-text>
              </s-stack>
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
        </s-stack>
      </s-section>

      <s-section heading="Setup checklist">
        <s-stack direction="block" gap="base">
          {readinessItems.length === 0 ? (
            <s-banner tone="warning">
              <s-text>Setup checklist is unavailable right now.</s-text>
            </s-banner>
          ) : null}
          {readinessItems.map((item) => {
            const isComplete = item.status === "complete";
            const actionHref = item.actionHref
              ? `${item.actionHref}${embeddedSearch}`
              : null;

            return (
              <s-card key={item.key}>
                <s-stack direction="block" gap="small">
                  <s-stack direction="inline" gap="small">
                    <s-heading>{item.label}</s-heading>
                    <s-badge tone={isComplete ? "success" : "warning"}>
                      {isComplete ? "Complete" : "Incomplete"}
                    </s-badge>
                  </s-stack>
                  <s-paragraph>{item.hint}</s-paragraph>
                  {actionHref && item.actionLabel ? (
                    <s-link href={actionHref}>{item.actionLabel}</s-link>
                  ) : null}
                </s-stack>
              </s-card>
            );
          })}
        </s-stack>
      </s-section>

      <s-section heading="Finish onboarding">
        <s-stack direction="block" gap="base">
          {errorMessage ? (
            <s-banner tone="critical">
              <s-text>{errorMessage}</s-text>
            </s-banner>
          ) : null}
          {successMessage ? (
            <s-banner tone="success">
              <s-text>{successMessage}</s-text>
            </s-banner>
          ) : null}
          <s-paragraph>
            Connect Printify and confirm your storefront personalization choice
            before finishing onboarding.
          </s-paragraph>
          {!readinessSignals?.printifyConnected ? (
            <s-link href={`/app/printify${embeddedSearch}`}>Connect Printify</s-link>
          ) : null}
          <Form method="post">
            <input type="hidden" name="intent" value="finish_onboarding" />
            <s-button
              type="submit"
              variant="primary"
              disabled={!canFinish}
              loading={isSubmitting}
            >
              Finish onboarding
            </s-button>
          </Form>
        </s-stack>
      </s-section>

      <s-section heading="Billing overview">
        <s-stack direction="block" gap="small">
          <s-paragraph>
            Free AI usage gift: ${formatUsd(freeGiftRemainingCents)} remaining (of
            ${formatUsd(freeGiftCents)}).
          </s-paragraph>
          <s-paragraph>
            Usage charges apply after the gift is used. Standard plan trial does
            not waive usage charges or the per-order fee.
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

