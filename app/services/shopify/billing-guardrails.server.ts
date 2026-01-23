/**
 * Billing guardrails: enforce consent gating and monthly cap before billable actions.
 *
 * Rules:
 * - If gift balance >= cost → allowed (no paid usage needed)
 * - If gift balance < cost AND no consent → blocked (consent_required)
 * - If gift balance < cost AND consent exists AND (MTD + cost > cap) → blocked (cap_exceeded)
 * - If gift balance < cost AND consent exists AND (MTD + cost <= cap) → allowed (paid overflow OK)
 */

import {
  centsToMills,
  centsToUsd,
  formatResetDate,
  getNextMonthResetDate,
  millsToUsd,
} from "./billing-guardrails";
import { getUsageLedgerSummary } from "./billing.server";
import { getSpendSafetySettings } from "../shops/spend-safety.server";
import {
  trackBillingUsageBlocked,
  trackBillingCapExceeded,
} from "../posthog/events";
import logger from "../../lib/logger";

export type BillableActionCheckInput = {
  shopId: string;
  costMills: number;
};

export type CapExceededDetails = {
  cap_usd: number;
  mtd_spend_usd: number;
  reset_date: string;
  action_cost_usd: number;
  cap_reached_at: string;
};

export type BillableActionCheckResult =
  | { allowed: true }
  | {
      allowed: false;
      code: "consent_required" | "gift_insufficient";
      message: string;
      giftBalanceMills: number;
      costMills: number;
    }
  | {
      allowed: false;
      code: "cap_exceeded";
      message: string;
      giftBalanceMills: number;
      costMills: number;
      details: CapExceededDetails;
    };

/**
 * Check whether a billable action is allowed for a shop.
 *
 * Returns `{ allowed: true }` if the action can proceed.
 * Returns `{ allowed: false, code, message, ... }` if blocked.
 */
export const checkBillableActionAllowed = async (
  input: BillableActionCheckInput,
): Promise<BillableActionCheckResult> => {
  const { shopId, costMills } = input;

  // Zero-cost actions are always allowed
  if (costMills <= 0) {
    return { allowed: true };
  }

  const ledgerSummary = await getUsageLedgerSummary({ shopId });
  const giftBalanceMills = ledgerSummary.giftBalanceMills;

  // If gift balance covers the full cost, no consent needed
  if (giftBalanceMills >= costMills) {
    return { allowed: true };
  }

  // Gift is insufficient - check for consent
  const spendSafety = await getSpendSafetySettings(shopId);
  const hasConsent = Boolean(spendSafety.paidUsageConsentAt);

  if (!hasConsent) {
    const result: BillableActionCheckResult = {
      allowed: false,
      code: "consent_required",
      message:
        "Paid usage consent is required. Configure spend safety in Billing settings to continue.",
      giftBalanceMills,
      costMills,
    };

    // Track blocked usage event
    trackBillingUsageBlocked({
      shopId,
      costMills,
      giftBalanceMills,
      reason: "consent_required",
    });

    return result;
  }

  // Consent exists - check monthly cap (proactive: block if action would exceed cap)
  const monthlyCapCents = spendSafety.monthlyCapCents ?? 0;
  const monthlyCapMills = centsToMills(monthlyCapCents);
  const paidUsageMonthToDateMills = ledgerSummary.paidUsageMonthToDateMills;

  // Calculate overflow amount (how much of costMills goes beyond gift)
  const paidOverflowMills = Math.max(0, costMills - giftBalanceMills);

  if (paidUsageMonthToDateMills + paidOverflowMills > monthlyCapMills) {
    const resetDate = getNextMonthResetDate();
    const resetDateFormatted = formatResetDate(resetDate);
    const details: CapExceededDetails = {
      cap_usd: centsToUsd(monthlyCapCents),
      mtd_spend_usd: millsToUsd(paidUsageMonthToDateMills),
      reset_date: resetDate.toISOString(),
      action_cost_usd: millsToUsd(costMills),
      cap_reached_at: new Date().toISOString(),
    };

    const result: BillableActionCheckResult = {
      allowed: false,
      code: "cap_exceeded",
      message: `Monthly spending cap reached ($${details.cap_usd.toFixed(
        2,
      )}). Your cap resets ${resetDateFormatted}. Increase your cap in Billing settings to continue.`,
      giftBalanceMills,
      costMills,
      details,
    };

    // Log cap exceeded for debugging
    logger.info(
      {
        shop_id: shopId,
        mtd_spend_mills: paidUsageMonthToDateMills,
        action_cost_mills: costMills,
        monthly_cap_cents: monthlyCapCents,
        monthly_cap_mills: monthlyCapMills,
        reset_date: resetDate.toISOString(),
      },
      "Billing cap exceeded - action blocked",
    );

    // Track cap exceeded event
    trackBillingCapExceeded({
      shopId,
      costMills,
      mtdSpendMills: paidUsageMonthToDateMills,
      capCents: monthlyCapCents,
    });

    return result;
  }

  // Consent exists and cap not reached - paid overflow is allowed
  return { allowed: true };
};
