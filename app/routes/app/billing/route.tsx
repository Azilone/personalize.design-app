import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useState } from "react";
import {
  Form,
  Link,
  data,
  useActionData,
  useLoaderData,
  useLocation,
  useNavigation,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { PlanStatus } from "@prisma/client";
import { authenticate } from "../../../shopify.server";
import { getShopIdFromSession } from "../../../lib/tenancy";
import { buildEmbeddedSearch } from "../../../lib/embedded-search";
import logger from "../../../lib/logger";
import {
  USAGE_BILLING_NOTES,
  USAGE_PRICING_ITEMS,
} from "../../../lib/usage-pricing";
import { spendSafetyActionSchema } from "../../../schemas/admin";
import { billingSummarySchema } from "../../../schemas/billing";
import {
  getSpendSafetySettings,
  upsertSpendSafetySettings,
} from "../../../services/shops/spend-safety.server";
import { getShopPlan } from "../../../services/shops/plan.server";
import { getUsageLedgerSummary } from "../../../services/shopify/billing.server";
import { trackBillingCapIncreased } from "../../../services/posthog/events";
import {
  centsToMills,
  formatResetDate,
  getNextMonthResetDate,
  millsToUsd,
} from "../../../services/shopify/billing-guardrails";

const DEFAULT_MONTHLY_CAP_CENTS = 1000;

const shouldLogAuthFlow = () =>
  process.env.NODE_ENV === "development" ||
  process.env.PD_DEBUG_AUTH_BOUNCE === "1";

const safeBillingLogContext = (request: Request) => {
  const url = new URL(request.url);

  const shop = url.searchParams.get("shop");
  const embedded = url.searchParams.get("embedded");
  const host = url.searchParams.get("host");
  const locale = url.searchParams.get("locale");

  return {
    path: url.pathname,
    has_shop: Boolean(shop),
    shop,
    embedded,
    has_host: Boolean(host),
    has_locale: Boolean(locale),
    has_id_token: url.searchParams.has("id_token"),
    has_x_shopify_bounce: request.headers.has("X-Shopify-Bounce"),
    has_auth_header: request.headers.has("Authorization"),
  };
};

const isSpendSafetyConfigured = (input: {
  monthlyCapCents: number | null;
  paidUsageConsentAt: string | null;
}) => {
  const monthlyCapCents = input.monthlyCapCents ?? 0;

  return monthlyCapCents > 0 && Boolean(input.paidUsageConsentAt);
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const logCtx = safeBillingLogContext(request);
  if (shouldLogAuthFlow()) {
    logger.info(logCtx, "Billing requested");
  }

  try {
    const { session } = await authenticate.admin(request);
    const shopId = getShopIdFromSession(session);
    const settings = await getSpendSafetySettings(shopId);
    const monthlyCapCents =
      settings.monthlyCapCents ?? DEFAULT_MONTHLY_CAP_CENTS;
    const plan = await getShopPlan(shopId);
    const planStatus = plan?.plan_status ?? PlanStatus.none;
    const ledgerSummary = await getUsageLedgerSummary({ shopId });

    const summary = billingSummarySchema.parse({
      monthlyCapCents,
      paidUsageConsentAt: settings.paidUsageConsentAt
        ? settings.paidUsageConsentAt.toISOString()
        : null,
      giftGrantTotalMills: ledgerSummary.giftGrantTotalMills,
      giftBalanceMills: ledgerSummary.giftBalanceMills,
      paidUsageMonthToDateMills: ledgerSummary.paidUsageMonthToDateMills,
      planStatus,
    });

    return summary;
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
          "Billing responded (Response)",
        );
      }

      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    logger.error({ ...logCtx, err_message: message }, "Billing failed");
    throw error;
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);
  const formData = Object.fromEntries(await request.formData());
  const parsed = spendSafetyActionSchema.safeParse(formData);

  if (!parsed.success) {
    return data(
      { error: { code: "invalid_request", message: "Invalid request." } },
      { status: 400 },
    );
  }

  const settings = await getSpendSafetySettings(shopId);

  // Handle cap increase intent
  if (parsed.data.intent === "increase_cap") {
    if (!parsed.data.confirm_increase) {
      return data(
        {
          error: {
            code: "confirmation_required",
            message: "Please confirm the cap increase.",
          },
        },
        { status: 400 },
      );
    }

    const newCapCents = Math.round(parsed.data.new_cap_usd * 100);
    const oldCapCents = settings.monthlyCapCents ?? 0;

    if (!Number.isFinite(newCapCents) || newCapCents <= 0) {
      return data(
        {
          error: {
            code: "invalid_request",
            message: "New cap must be greater than $0.00.",
          },
        },
        { status: 400 },
      );
    }

    // Validate new cap > current MTD spend
    const ledgerSummary = await getUsageLedgerSummary({ shopId });
    const newCapMills = centsToMills(newCapCents);
    if (newCapMills <= ledgerSummary.paidUsageMonthToDateMills) {
      const mtdSpendUsd = millsToUsd(
        ledgerSummary.paidUsageMonthToDateMills,
      ).toFixed(3);
      return data(
        {
          error: {
            code: "cap_below_spend",
            message: `New cap must be greater than current month-to-date spend ($${mtdSpendUsd}).`,
          },
        },
        { status: 400 },
      );
    }

    await upsertSpendSafetySettings({
      shopId,
      monthlyCapCents: newCapCents,
      paidUsageConsentAt: settings.paidUsageConsentAt,
    });

    // Emit PostHog event for cap increase
    trackBillingCapIncreased({
      shopId,
      oldCapCents,
      newCapCents,
    });

    logger.info(
      {
        shop_id: shopId,
        old_cap_cents: oldCapCents,
        new_cap_cents: newCapCents,
      },
      "Billing cap increased",
    );

    return data({ success: true, capIncreased: true });
  }

  // Handle save_spend_safety intent
  const consentAlreadyRecorded = Boolean(settings.paidUsageConsentAt);
  const consentProvided = Boolean(parsed.data.paid_usage_consent);

  if (!consentAlreadyRecorded && !consentProvided) {
    return data(
      {
        error: {
          code: "consent_required",
          message: "Confirm paid usage consent to continue.",
        },
      },
      { status: 400 },
    );
  }

  const monthlyCapCents = Math.round(parsed.data.monthly_cap_usd * 100);

  if (!Number.isFinite(monthlyCapCents) || monthlyCapCents <= 0) {
    return data(
      {
        error: {
          code: "invalid_request",
          message: "Monthly cap must be greater than $0.00.",
        },
      },
      { status: 400 },
    );
  }

  const paidUsageConsentAt = consentAlreadyRecorded
    ? settings.paidUsageConsentAt
    : new Date();

  await upsertSpendSafetySettings({
    shopId,
    monthlyCapCents,
    paidUsageConsentAt,
  });

  return data({ success: true });
};

export default function BillingSettings() {
  const {
    monthlyCapCents,
    paidUsageConsentAt,
    giftGrantTotalMills,
    giftBalanceMills,
    paidUsageMonthToDateMills,
    planStatus,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const { search } = useLocation();
  const embeddedSearch = buildEmbeddedSearch(search);
  const setupHref = `/app${embeddedSearch}`;

  // State for cap increase flow
  const [showIncreaseForm, setShowIncreaseForm] = useState(false);
  const [newCapValue, setNewCapValue] = useState("");
  const [confirmIncrease, setConfirmIncrease] = useState(false);

  const errorMessage =
    actionData && typeof actionData === "object" && "error" in actionData
      ? actionData.error.message
      : null;
  const successMessage =
    actionData && typeof actionData === "object" && "success" in actionData
      ? "Spend safety updated."
      : null;
  const hasConsent = Boolean(paidUsageConsentAt);
  const consentDate = paidUsageConsentAt
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(paidUsageConsentAt))
    : null;
  const isSubmitting =
    navigation.formData?.get("intent") === "save_spend_safety";
  const isIncreasing = navigation.formData?.get("intent") === "increase_cap";
  const monthlyCapUsd = (monthlyCapCents / 100).toFixed(2);
  const spendSafetyConfigured = isSpendSafetyConfigured({
    monthlyCapCents,
    paidUsageConsentAt,
  });
  const formatUsageUsd = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 3,
    }).format(amount);
  const giftBalanceUsd = formatUsageUsd(millsToUsd(giftBalanceMills));
  const giftGrantTotalUsd = formatUsageUsd(millsToUsd(giftGrantTotalMills));
  const paidUsageUsd = formatUsageUsd(millsToUsd(paidUsageMonthToDateMills));
  const isStandardPlan = planStatus === "standard";
  const planLabel: Record<string, string> = {
    none: "No active plan",
    standard: "Standard",
    early_access: "Early Access",
    standard_pending: "Standard (pending)",
    early_access_pending: "Early Access (pending)",
  };

  // Calculate remaining capacity and cap status
  const monthlyCapMills = centsToMills(monthlyCapCents);
  const remainingCapMills = Math.max(
    0,
    monthlyCapMills - paidUsageMonthToDateMills,
  );
  const remainingCapUsd = formatUsageUsd(millsToUsd(remainingCapMills));
  const capReached = paidUsageMonthToDateMills >= monthlyCapMills;
  const resetDate = getNextMonthResetDate();
  const resetDateFormatted = formatResetDate(resetDate);

  return (
    <s-page heading="Usage & billing">
      <s-section heading="Usage summary">
        <s-stack direction="block" gap="base">
          <s-stack direction="block" gap="base">
            <s-heading>Current usage balance</s-heading>
            <s-paragraph>
              Plan: {planLabel[planStatus] ?? planStatus}
            </s-paragraph>
            <s-paragraph>Free gift issued: ${giftGrantTotalUsd}</s-paragraph>
            <s-paragraph>Free gift remaining: ${giftBalanceUsd}</s-paragraph>
            <s-paragraph>Paid usage month-to-date: ${paidUsageUsd}</s-paragraph>
          </s-stack>
          <s-stack direction="block" gap="base">
            <s-heading>Pricing</s-heading>
            <s-unordered-list>
              {USAGE_PRICING_ITEMS.map((item) => (
                <s-list-item key={item.key}>
                  {item.label}: ${formatUsageUsd(item.priceUsd)}
                </s-list-item>
              ))}
              <s-list-item>
                {USAGE_BILLING_NOTES.gift_applies_first}
              </s-list-item>
              <s-list-item>
                {USAGE_BILLING_NOTES.printify_mockups_not_billed}
              </s-list-item>
            </s-unordered-list>
          </s-stack>
          {isStandardPlan ? (
            <s-banner tone="info">
              <s-text>{USAGE_BILLING_NOTES.standard_trial_note}</s-text>
            </s-banner>
          ) : null}
        </s-stack>
      </s-section>
      <s-section heading="Spend safety">
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
          {spendSafetyConfigured ? (
            <s-banner tone="success">
              <s-text>Spend safety is configured.</s-text>
            </s-banner>
          ) : null}
          {capReached && spendSafetyConfigured ? (
            <s-banner tone="warning">
              <s-text>
                Monthly spending cap reached. Your cap resets{" "}
                {resetDateFormatted}. Increase your cap below to continue using
                paid features.
              </s-text>
            </s-banner>
          ) : null}
          <s-paragraph>
            Set a monthly spending cap and confirm paid usage before usage
            charges can apply. The $1.00 free AI usage gift is applied first.
          </s-paragraph>

          {/* Cap Status Display */}
          {spendSafetyConfigured ? (
            <s-stack direction="block" gap="small">
              <s-heading>Monthly Cap Status</s-heading>
              <s-paragraph>Current cap: ${monthlyCapUsd}</s-paragraph>
              <s-paragraph>
                Month-to-date paid spend: ${paidUsageUsd}
              </s-paragraph>
              <s-paragraph>
                Remaining capacity: ${remainingCapUsd} of ${monthlyCapUsd}
              </s-paragraph>
              <s-paragraph>Cap resets: {resetDateFormatted}</s-paragraph>
            </s-stack>
          ) : null}

          {/* Initial Setup Form (when not configured) */}
          {!spendSafetyConfigured ? (
            <Form method="post">
              <input type="hidden" name="intent" value="save_spend_safety" />
              <s-stack direction="block" gap="base">
                <s-text-field
                  label="Monthly spending cap (USD)"
                  name="monthly_cap_usd"
                  placeholder="10.00"
                  defaultValue={monthlyCapUsd}
                />
                {!hasConsent ? (
                  <s-checkbox
                    label="I understand paid usage charges will apply after the free gift is used."
                    name="paid_usage_consent"
                  />
                ) : (
                  <s-paragraph>
                    Paid usage consent recorded {consentDate}.
                  </s-paragraph>
                )}
                <s-button
                  type="submit"
                  variant="primary"
                  {...(isSubmitting ? { loading: true } : {})}
                >
                  Save spend safety
                </s-button>
              </s-stack>
            </Form>
          ) : null}

          {/* Increase Cap Flow (when already configured) */}
          {spendSafetyConfigured ? (
            <s-stack direction="block" gap="base">
              {!showIncreaseForm ? (
                <s-button
                  variant="secondary"
                  onClick={() => setShowIncreaseForm(true)}
                >
                  Increase Cap
                </s-button>
              ) : (
                <Form method="post">
                  <input type="hidden" name="intent" value="increase_cap" />
                  <s-stack direction="block" gap="base">
                    <s-text-field
                      label="New monthly cap (USD)"
                      name="new_cap_usd"
                      placeholder="20.00"
                      value={newCapValue}
                      onChange={(e: { currentTarget: { value: string } }) =>
                        setNewCapValue(e.currentTarget.value)
                      }
                    />
                    <s-checkbox
                      label="I confirm I want to increase my monthly spending cap."
                      name="confirm_increase"
                      checked={confirmIncrease}
                      onChange={(e: { currentTarget: { checked: boolean } }) =>
                        setConfirmIncrease(e.currentTarget.checked)
                      }
                    />
                    <s-stack direction="inline" gap="small">
                      <s-button
                        type="submit"
                        variant="primary"
                        {...(isIncreasing ? { loading: true } : {})}
                      >
                        Confirm Increase
                      </s-button>
                      <s-button
                        variant="secondary"
                        onClick={() => {
                          setShowIncreaseForm(false);
                          setNewCapValue("");
                          setConfirmIncrease(false);
                        }}
                      >
                        Cancel
                      </s-button>
                    </s-stack>
                  </s-stack>
                </Form>
              )}
            </s-stack>
          ) : null}

          <Link to={setupHref}>Back to setup</Link>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
