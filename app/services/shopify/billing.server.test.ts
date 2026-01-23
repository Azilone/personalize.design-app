import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { UsageLedgerEntryType } from "@prisma/client";

const mockPrisma = vi.hoisted(() => ({
  usageLedgerEntry: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    aggregate: vi.fn(),
  },
  $transaction: vi.fn(),
}));

const mockTrackUsageGiftGrant = vi.hoisted(() => vi.fn());

vi.mock("../../db.server", () => ({
  default: mockPrisma,
}));

vi.mock("../posthog/events", () => ({
  trackUsageGiftGrant: mockTrackUsageGiftGrant,
}));
import {
  buildEarlyAccessSubscriptionInput,
  buildUsageGiftGrantIdempotencyKey,
  buildStandardSubscriptionInput,
  calculateGiftBalanceMills,
  grantUsageGift,
  getSubscriptionStatus,
  recordUsageCharge,
} from "./billing.server";

describe("buildStandardSubscriptionInput", () => {
  it("builds a $19/month subscription with 7-day trial and usage line item", () => {
    const input = buildStandardSubscriptionInput({
      returnUrl: "https://example.com/app/billing/confirm",
    });

    expect(input.name).toBe("Personalize Design Standard");
    expect(input.trialDays).toBe(7);
    expect(input.returnUrl).toBe("https://example.com/app/billing/confirm");
    expect(input.lineItems).toHaveLength(2);

    const recurring = input.lineItems[0]?.plan.appRecurringPricingDetails;
    const usage = input.lineItems[1]?.plan.appUsagePricingDetails;

    expect(recurring?.price.amount).toBe(19);
    expect(recurring?.price.currencyCode).toBe("USD");
    expect(usage?.cappedAmount.amount).toBe(10);
    expect(usage?.cappedAmount.currencyCode).toBe("USD");
  });
});

describe("grantUsageGift", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing entry on duplicate idempotency key", async () => {
    const error = Object.assign(new Error("duplicate"), { code: "P2002" });
    mockPrisma.usageLedgerEntry.create.mockRejectedValueOnce(error);
    mockPrisma.usageLedgerEntry.findUnique.mockResolvedValueOnce({
      id: "entry_1",
    });

    const result = await grantUsageGift({ shopId: "shop.myshopify.com" });

    expect(result).toEqual({ created: false, entryId: "entry_1" });
    expect(mockTrackUsageGiftGrant).not.toHaveBeenCalled();
  });
});

describe("recordUsageCharge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (callback) =>
      callback(mockPrisma),
    );
  });

  it("applies gift balance before paid usage", async () => {
    mockPrisma.usageLedgerEntry.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          entry_type: UsageLedgerEntryType.gift_grant,
          amount_cents: 100,
          amount_mills: 1000,
        },
      ]);
    mockPrisma.usageLedgerEntry.create.mockResolvedValue({ id: "entry_1" });

    const result = await recordUsageCharge({
      shopId: "shop.myshopify.com",
      totalCostUsd: 0.75,
      idempotencyKey: "usage_charge:test:1",
    });

    expect(result).toEqual({
      created: true,
      giftAppliedMills: 750,
      paidUsageMills: 0,
    });
    expect(mockPrisma.usageLedgerEntry.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.usageLedgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entry_type: UsageLedgerEntryType.gift_spend,
        amount_cents: -75,
        amount_mills: -750,
        idempotency_key: "usage_charge:test:1:gift_spend",
      }),
    });
  });
});

describe("buildEarlyAccessSubscriptionInput", () => {
  it("builds a $0/month subscription with usage line item", () => {
    const input = buildEarlyAccessSubscriptionInput({
      returnUrl: "https://example.com/app/billing/confirm",
    });

    expect(input.name).toBe("Personalize Design Early Access");
    expect(input.trialDays).toBe(0);
    expect(input.lineItems).toHaveLength(2);

    const recurring = input.lineItems[0]?.plan.appRecurringPricingDetails;
    const usage = input.lineItems[1]?.plan.appUsagePricingDetails;

    expect(recurring?.price.amount).toBe(0);
    expect(recurring?.price.currencyCode).toBe("USD");
    expect(usage?.cappedAmount.amount).toBe(10);
    expect(usage?.cappedAmount.currencyCode).toBe("USD");
  });
});

describe("getSubscriptionStatus", () => {
  it("reads status via node(id:) for AppSubscription", async () => {
    const admin = {
      graphql: async () =>
        new Response(
          JSON.stringify({
            data: {
              node: {
                __typename: "AppSubscription",
                id: "gid://shopify/AppSubscription/123",
                status: "ACTIVE",
              },
            },
          }),
        ),
    } satisfies Pick<AdminApiContext, "graphql"> as unknown as AdminApiContext;

    const result = await getSubscriptionStatus({
      admin,
      subscriptionId: "gid://shopify/AppSubscription/123",
    });

    expect(result).toEqual({
      id: "gid://shopify/AppSubscription/123",
      status: "ACTIVE",
    });
  });

  it("throws when node is not an AppSubscription", async () => {
    const admin = {
      graphql: async () =>
        new Response(
          JSON.stringify({
            data: {
              node: {
                __typename: "Shop",
                id: "gid://shopify/Shop/1",
              },
            },
          }),
        ),
    } satisfies Pick<AdminApiContext, "graphql"> as unknown as AdminApiContext;

    await expect(
      getSubscriptionStatus({
        admin,
        subscriptionId: "gid://shopify/AppSubscription/123",
      }),
    ).rejects.toThrow("Subscription status not found.");
  });
});

describe("buildUsageGiftGrantIdempotencyKey", () => {
  it("builds a stable idempotency key per shop", () => {
    const key = buildUsageGiftGrantIdempotencyKey("example.myshopify.com");

    expect(key).toBe("usage_gift_grant:example.myshopify.com");
  });
});

describe("calculateGiftBalanceMills", () => {
  it("sums gift grant and spend entries", () => {
    const balance = calculateGiftBalanceMills([
      { entryType: UsageLedgerEntryType.gift_grant, amountMills: 1000 },
      { entryType: UsageLedgerEntryType.gift_spend, amountMills: -250 },
      { entryType: UsageLedgerEntryType.paid_usage, amountMills: 500 },
    ]);

    expect(balance).toBe(750);
  });
});
