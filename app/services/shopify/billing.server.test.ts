import { describe, expect, it } from "vitest";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import {
  buildEarlyAccessSubscriptionInput,
  buildStandardSubscriptionInput,
  getSubscriptionStatus,
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
