/**
 * Tests for billing guardrails.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetUsageLedgerSummary = vi.hoisted(() => vi.fn());
const mockGetSpendSafetySettings = vi.hoisted(() => vi.fn());
const mockTrackBillingUsageBlocked = vi.hoisted(() => vi.fn());
const mockTrackBillingCapExceeded = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("./billing.server", () => ({
  getUsageLedgerSummary: mockGetUsageLedgerSummary,
}));

vi.mock("../shops/spend-safety.server", () => ({
  getSpendSafetySettings: mockGetSpendSafetySettings,
}));

vi.mock("../posthog/events", () => ({
  trackBillingUsageBlocked: mockTrackBillingUsageBlocked,
  trackBillingCapExceeded: mockTrackBillingCapExceeded,
}));

vi.mock("../../lib/logger", () => ({
  default: mockLogger,
}));

import {
  centsToUsd,
  formatResetDate,
  getNextMonthResetDate,
  millsToUsd,
  usdToCents,
  usdToMills,
} from "./billing-guardrails";
import { checkBillableActionAllowed } from "./billing-guardrails.server";

describe("checkBillableActionAllowed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows zero-cost actions without checking ledger", async () => {
    const result = await checkBillableActionAllowed({
      shopId: "shop.myshopify.com",
      costMills: 0,
    });

    expect(result).toEqual({ allowed: true });
    expect(mockGetUsageLedgerSummary).not.toHaveBeenCalled();
  });

  it("allows action when gift balance covers full cost", async () => {
    mockGetUsageLedgerSummary.mockResolvedValueOnce({
      giftGrantTotalMills: 1000,
      giftBalanceMills: 1000,
      paidUsageMonthToDateMills: 0,
    });

    const result = await checkBillableActionAllowed({
      shopId: "shop.myshopify.com",
      costMills: 500,
    });

    expect(result).toEqual({ allowed: true });
    expect(mockGetSpendSafetySettings).not.toHaveBeenCalled();
  });

  it("blocks action when gift insufficient and no consent", async () => {
    mockGetUsageLedgerSummary.mockResolvedValueOnce({
      giftGrantTotalMills: 1000,
      giftBalanceMills: 300,
      paidUsageMonthToDateMills: 700,
    });
    mockGetSpendSafetySettings.mockResolvedValueOnce({
      monthlyCapCents: null,
      paidUsageConsentAt: null,
    });

    const result = await checkBillableActionAllowed({
      shopId: "shop.myshopify.com",
      costMills: 500,
    });

    expect(result).toEqual({
      allowed: false,
      code: "consent_required",
      message:
        "Paid usage consent is required. Configure spend safety in Billing settings to continue.",
      giftBalanceMills: 300,
      costMills: 500,
    });
    expect(mockTrackBillingUsageBlocked).toHaveBeenCalledWith({
      shopId: "shop.myshopify.com",
      costMills: 500,
      giftBalanceMills: 300,
      reason: "consent_required",
    });
  });

  it("blocks action when monthly cap would be exceeded (proactive)", async () => {
    mockGetUsageLedgerSummary.mockResolvedValueOnce({
      giftGrantTotalMills: 1000,
      giftBalanceMills: 0,
      paidUsageMonthToDateMills: 9960, // $9.96 spent
    });
    mockGetSpendSafetySettings.mockResolvedValueOnce({
      monthlyCapCents: 1000, // $10.00 cap
      paidUsageConsentAt: new Date("2026-01-20T12:00:00Z"),
    });

    const result = await checkBillableActionAllowed({
      shopId: "shop.myshopify.com",
      costMills: 50, // $0.05 - would exceed cap ($10.01 > $10.00)
    });

    expect(result.allowed).toBe(false);
    if (!result.allowed && result.code === "cap_exceeded") {
      expect(result.message).toContain("Monthly spending cap reached ($10.00)");
      expect(result.message).toContain("resets");
      expect(result.details).toBeDefined();
      expect(result.details.cap_usd).toBe(10);
      expect(result.details.mtd_spend_usd).toBe(9.96);
      expect(result.details.action_cost_usd).toBe(0.05);
      expect(result.details.reset_date).toBeDefined();
      expect(result.details.cap_reached_at).toBeDefined();
    }
    expect(mockTrackBillingCapExceeded).toHaveBeenCalledWith({
      shopId: "shop.myshopify.com",
      costMills: 50,
      mtdSpendMills: 9960,
      capCents: 1000,
    });
  });

  it("blocks action when MTD spend already equals cap", async () => {
    mockGetUsageLedgerSummary.mockResolvedValueOnce({
      giftGrantTotalMills: 1000,
      giftBalanceMills: 0,
      paidUsageMonthToDateMills: 10000, // $10.00 spent (at cap)
    });
    mockGetSpendSafetySettings.mockResolvedValueOnce({
      monthlyCapCents: 1000, // $10.00 cap
      paidUsageConsentAt: new Date("2026-01-20T12:00:00Z"),
    });

    const result = await checkBillableActionAllowed({
      shopId: "shop.myshopify.com",
      costMills: 50,
    });

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("cap_exceeded");
    }
  });

  it("allows action when gift insufficient but consent exists and within cap", async () => {
    mockGetUsageLedgerSummary.mockResolvedValueOnce({
      giftGrantTotalMills: 1000,
      giftBalanceMills: 300,
      paidUsageMonthToDateMills: 700,
    });
    mockGetSpendSafetySettings.mockResolvedValueOnce({
      monthlyCapCents: 1000,
      paidUsageConsentAt: new Date("2026-01-20T12:00:00Z"),
    });

    const result = await checkBillableActionAllowed({
      shopId: "shop.myshopify.com",
      costMills: 500,
    });

    expect(result).toEqual({ allowed: true });
    expect(mockTrackBillingUsageBlocked).not.toHaveBeenCalled();
    expect(mockTrackBillingCapExceeded).not.toHaveBeenCalled();
  });

  it("allows action when gift exactly covers cost", async () => {
    mockGetUsageLedgerSummary.mockResolvedValueOnce({
      giftGrantTotalMills: 1000,
      giftBalanceMills: 500,
      paidUsageMonthToDateMills: 500,
    });

    const result = await checkBillableActionAllowed({
      shopId: "shop.myshopify.com",
      costMills: 500,
    });

    expect(result).toEqual({ allowed: true });
  });

  it("allows action when gift partially covers and remaining fits in cap", async () => {
    // Gift: 30 cents remaining, cost: 50 cents
    // Overflow to paid: 20 cents
    // MTD: 70 cents, Cap: 1000 cents
    // 70 + 20 = 90 cents <= 1000 cap -> allowed
    mockGetUsageLedgerSummary.mockResolvedValueOnce({
      giftGrantTotalMills: 1000,
      giftBalanceMills: 300,
      paidUsageMonthToDateMills: 700,
    });
    mockGetSpendSafetySettings.mockResolvedValueOnce({
      monthlyCapCents: 1000,
      paidUsageConsentAt: new Date("2026-01-20T12:00:00Z"),
    });

    const result = await checkBillableActionAllowed({
      shopId: "shop.myshopify.com",
      costMills: 500,
    });

    expect(result).toEqual({ allowed: true });
  });

  it("blocks when gift partially covers but overflow exceeds cap", async () => {
    // Gift: 30 cents remaining, cost: 50 cents
    // Overflow to paid: 20 cents
    // MTD: 990 cents, Cap: 1000 cents
    // 990 + 20 = 1010 cents > 1000 cap -> blocked
    mockGetUsageLedgerSummary.mockResolvedValueOnce({
      giftGrantTotalMills: 1000,
      giftBalanceMills: 300,
      paidUsageMonthToDateMills: 9900,
    });
    mockGetSpendSafetySettings.mockResolvedValueOnce({
      monthlyCapCents: 1000,
      paidUsageConsentAt: new Date("2026-01-20T12:00:00Z"),
    });

    const result = await checkBillableActionAllowed({
      shopId: "shop.myshopify.com",
      costMills: 500,
    });

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("cap_exceeded");
    }
  });
});

describe("usdToCents", () => {
  it("converts USD to cents", () => {
    expect(usdToCents(1.0)).toBe(100);
    expect(usdToCents(0.05)).toBe(5);
    expect(usdToCents(0.025)).toBe(3); // Rounds to nearest cent
  });

  it("returns 0 for negative values", () => {
    expect(usdToCents(-1)).toBe(0);
  });
});

describe("usdToMills", () => {
  it("converts USD to mills", () => {
    expect(usdToMills(1.0)).toBe(1000);
    expect(usdToMills(0.05)).toBe(50);
    expect(usdToMills(0.025)).toBe(25);
  });

  it("returns 0 for negative values", () => {
    expect(usdToMills(-1)).toBe(0);
  });
});

describe("millsToUsd", () => {
  it("converts mills to USD", () => {
    expect(millsToUsd(1000)).toBe(1);
    expect(millsToUsd(50)).toBe(0.05);
    expect(millsToUsd(25)).toBe(0.025);
  });
});

describe("centsToUsd", () => {
  it("converts cents to USD", () => {
    expect(centsToUsd(100)).toBe(1);
    expect(centsToUsd(5)).toBe(0.05);
    expect(centsToUsd(1000)).toBe(10);
  });
});

describe("getNextMonthResetDate", () => {
  it("returns first of next month for mid-month date", () => {
    const now = new Date("2026-01-15T12:00:00Z");
    const reset = getNextMonthResetDate(now);

    expect(reset.getUTCFullYear()).toBe(2026);
    expect(reset.getUTCMonth()).toBe(1); // February
    expect(reset.getUTCDate()).toBe(1);
    expect(reset.getUTCHours()).toBe(0);
    expect(reset.getUTCMinutes()).toBe(0);
    expect(reset.getUTCSeconds()).toBe(0);
  });

  it("returns first of next month for last day of month", () => {
    const now = new Date("2026-01-31T23:59:59Z");
    const reset = getNextMonthResetDate(now);

    expect(reset.getUTCFullYear()).toBe(2026);
    expect(reset.getUTCMonth()).toBe(1); // February
    expect(reset.getUTCDate()).toBe(1);
  });

  it("handles year rollover (December to January)", () => {
    const now = new Date("2026-12-15T12:00:00Z");
    const reset = getNextMonthResetDate(now);

    expect(reset.getUTCFullYear()).toBe(2027);
    expect(reset.getUTCMonth()).toBe(0); // January
    expect(reset.getUTCDate()).toBe(1);
  });
});

describe("formatResetDate", () => {
  it("formats date in human-readable format", () => {
    const date = new Date("2026-02-01T00:00:00Z");
    const formatted = formatResetDate(date);

    expect(formatted).toBe("February 1, 2026");
  });
});
