import { describe, expect, it } from "vitest";
import { PlanStatus } from "@prisma/client";
import {
  buildReadinessChecklist,
  canFinishOnboarding,
  type ReadinessChecklistInput,
} from "./readiness";

const build = (overrides: Partial<ReadinessChecklistInput>) => {
  return buildReadinessChecklist({
    planStatus: PlanStatus.none,
    printifyConnected: false,
    storefrontPersonalizationEnabled: false,
    storefrontPersonalizationConfirmed: false,
    spendSafetyConfigured: false,
    ...overrides,
  });
};

describe("buildReadinessChecklist", () => {
  it("marks plan status as complete for active plans", () => {
    const activePlans = [PlanStatus.standard, PlanStatus.early_access];

    for (const planStatus of activePlans) {
      const items = build({ planStatus });
      const planItem = items.find((item) => item.key === "plan_status");

      expect(planItem?.status).toBe("complete");
    }
  });

  it("marks plan status as incomplete for inactive plans", () => {
    const inactivePlans = [
      PlanStatus.none,
      PlanStatus.standard_pending,
      PlanStatus.early_access_pending,
    ];

    for (const planStatus of inactivePlans) {
      const items = build({ planStatus });
      const planItem = items.find((item) => item.key === "plan_status");

      expect(planItem?.status).toBe("incomplete");
    }
  });

  it("marks Printify as complete when connected", () => {
    const items = build({
      planStatus: PlanStatus.standard,
      printifyConnected: true,
    });
    const item = items.find(
      (candidate) => candidate.key === "printify_connection",
    );

    expect(item?.status).toBe("complete");
    expect(item?.actionHref).toBeUndefined();
  });

  it("marks storefront personalization as complete when enabled", () => {
    const items = build({
      planStatus: PlanStatus.standard,
      storefrontPersonalizationEnabled: true,
      storefrontPersonalizationConfirmed: true,
    });
    const item = items.find(
      (candidate) => candidate.key === "storefront_personalization",
    );

    expect(item?.status).toBe("complete");
    expect(item?.actionHref).toBeUndefined();
  });

  it("marks storefront personalization as complete when disabled", () => {
    const items = build({
      planStatus: PlanStatus.standard,
      storefrontPersonalizationEnabled: false,
      storefrontPersonalizationConfirmed: true,
    });
    const item = items.find(
      (candidate) => candidate.key === "storefront_personalization",
    );

    expect(item?.status).toBe("complete");
    expect(item?.actionHref).toBe("/app/onboarding/storefront-personalization");
    expect(item?.hint).toBe(
      "Personalization is disabled. Use the setup guide to update it anytime.",
    );
  });

  it("marks spend safety as complete when configured", () => {
    const items = build({
      planStatus: PlanStatus.standard,
      spendSafetyConfigured: true,
    });
    const item = items.find((candidate) => candidate.key === "spend_safety");

    expect(item?.status).toBe("complete");
    expect(item?.actionHref).toBeUndefined();
  });

  it("provides action links for incomplete items", () => {
    const items = build({ planStatus: PlanStatus.standard });

    expect(
      items.find((candidate) => candidate.key === "printify_connection")
        ?.actionHref,
    ).toBe("/app/printify");

    expect(
      items.find((candidate) => candidate.key === "storefront_personalization")
        ?.actionHref,
    ).toBe("/app/onboarding/storefront-personalization");

    expect(
      items.find((candidate) => candidate.key === "spend_safety")?.actionHref,
    ).toBe("/app/onboarding/spend-safety");
  });

  it("includes the required checklist items", () => {
    const items = build({ planStatus: PlanStatus.standard });

    expect(items.map((item) => item.key)).toEqual([
      "plan_status",
      "printify_connection",
      "storefront_personalization",
      "spend_safety",
    ]);
  });
});

describe("canFinishOnboarding", () => {
  it("allows finishing when personalization is confirmed", () => {
    expect(
      canFinishOnboarding({ storefrontPersonalizationConfirmed: true }),
    ).toBe(true);
  });

  it("blocks finishing when personalization is not confirmed", () => {
    expect(
      canFinishOnboarding({ storefrontPersonalizationConfirmed: false }),
    ).toBe(false);
  });
});
