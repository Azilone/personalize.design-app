import { describe, expect, it } from "vitest";
import {
  buildEarlyAccessSubscriptionInput,
  buildStandardSubscriptionInput,
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
