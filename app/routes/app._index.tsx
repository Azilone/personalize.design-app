import type { ActionFunctionArgs, HeadersFunction } from "react-router";
import {
  Form,
  Link,
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
    storefrontPersonalizationConfirmed:
      readinessSignals.storefrontPersonalizationConfirmed,
  });

  if (!canFinish) {
    return data(
      {
        error: {
          code: "storefront_personalization_required",
          message:
            "Confirm storefront personalization before finishing onboarding.",
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

  return (
    <s-page heading="Setup">
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
          <Link to={`/app/paywall${embeddedSearch}`}>Go to paywall</Link>
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
                    <Link to={actionHref}>{item.actionLabel}</Link>
                  ) : null}
                </s-stack>
              </s-box>
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
            Confirm your storefront personalization choice before finishing
            onboarding.
          </s-paragraph>
          <Form method="post">
            <input type="hidden" name="intent" value="finish_onboarding" />
            <s-button
              type="submit"
              variant="primary"
              {...(isSubmitting ? { loading: true } : {})}
            >
              Finish onboarding
            </s-button>
          </Form>
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
