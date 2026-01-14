import { PlanStatus } from "@prisma/client";

export type ReadinessStatus = "complete" | "incomplete";

export type ReadinessItemKey =
  | "plan_status"
  | "printify_connection"
  | "storefront_personalization"
  | "spend_safety";

export type ReadinessItem = {
  key: ReadinessItemKey;
  label: string;
  status: ReadinessStatus;
  hint: string;
  actionHref?: string;
  actionLabel?: string;
};

const ACTIVE_PLAN_STATUSES = new Set<PlanStatus>([
  PlanStatus.standard,
  PlanStatus.early_access,
]);

const resolvePlanHint = (status: PlanStatus): string => {
  if (status === PlanStatus.standard_pending) {
    return "Confirm the Standard subscription in Shopify.";
  }

  if (status === PlanStatus.early_access_pending) {
    return "Confirm the Early Access activation in Shopify.";
  }

  if (status === PlanStatus.none) {
    return "Activate Early Access or subscribe to Standard to continue.";
  }

  return "Plan access is active.";
};

export type ReadinessChecklistInput = {
  planStatus: PlanStatus;
  printifyConnected: boolean;
  storefrontPersonalizationEnabled: boolean;
  spendSafetyConfigured: boolean;
};

export const buildReadinessChecklist = (
  input: ReadinessChecklistInput,
): ReadinessItem[] => {
  const planReady = ACTIVE_PLAN_STATUSES.has(input.planStatus);

  return [
    {
      key: "plan_status",
      label: "Plan status (Early Access or Standard)",
      status: planReady ? "complete" : "incomplete",
      hint: resolvePlanHint(input.planStatus),
      actionHref: planReady ? undefined : "/app/paywall",
      actionLabel: planReady ? undefined : "Review plan options",
    },
    {
      key: "printify_connection",
      label: "Printify connection",
      status: input.printifyConnected ? "complete" : "incomplete",
      hint: input.printifyConnected
        ? "Printify is connected."
        : "Connect Printify to sync products (coming soon).",
      actionHref: input.printifyConnected ? undefined : "/app/printify",
      actionLabel: input.printifyConnected ? undefined : "Open Printify setup",
    },
    {
      key: "storefront_personalization",
      label: "Storefront personalization",
      status: input.storefrontPersonalizationEnabled
        ? "complete"
        : "incomplete",
      hint: input.storefrontPersonalizationEnabled
        ? "Personalization is enabled."
        : "Enable personalization in store settings (coming soon).",
      actionHref: input.storefrontPersonalizationEnabled
        ? undefined
        : "/app/storefront",
      actionLabel: input.storefrontPersonalizationEnabled
        ? undefined
        : "Review storefront settings",
    },
    {
      key: "spend_safety",
      label: "Spend safety",
      status: input.spendSafetyConfigured ? "complete" : "incomplete",
      hint: input.spendSafetyConfigured
        ? "Spend safety is configured."
        : "Review spend safety, set a monthly cap, and enable paid usage.",
      actionHref: input.spendSafetyConfigured
        ? undefined
        : "/app/onboarding/spend-safety",
      actionLabel: input.spendSafetyConfigured
        ? undefined
        : "Configure spend safety",
    },
  ];
};
