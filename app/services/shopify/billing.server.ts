import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { UsageLedgerEntryType } from "@prisma/client";
import prisma from "../../db.server";
import { USAGE_GIFT_CENTS } from "../../lib/usage-pricing";
import { trackUsageGiftGrant } from "../posthog/events";

type MoneyInput = {
  amount: number;
  currencyCode: "USD";
};

type AppRecurringPricingDetailsInput = {
  price: MoneyInput;
  interval: "EVERY_30_DAYS";
};

type AppUsagePricingDetailsInput = {
  cappedAmount: MoneyInput;
  terms: string;
};

type AppSubscriptionLineItemInput = {
  plan: {
    appRecurringPricingDetails?: AppRecurringPricingDetailsInput;
    appUsagePricingDetails?: AppUsagePricingDetailsInput;
  };
};

type AppSubscriptionCreateInput = {
  name: string;
  returnUrl: string;
  trialDays: number;
  lineItems: AppSubscriptionLineItemInput[];
};

type UsageLedgerEntryInput = {
  entryType: UsageLedgerEntryType;
  amountCents: number;
};

const giftEntryTypes: UsageLedgerEntryType[] = [
  UsageLedgerEntryType.gift_grant,
  UsageLedgerEntryType.gift_spend,
];

export const buildUsageGiftGrantIdempotencyKey = (shopId: string) =>
  `usage_gift_grant:${shopId}`;

export const buildUsageChargeIdempotencyKey = (
  source: string,
  sourceId: string,
) => `usage_charge:${source}:${sourceId}`;

export const calculateGiftBalanceCents = (
  entries: UsageLedgerEntryInput[],
): number => {
  return entries.reduce((total, entry) => {
    if (!giftEntryTypes.includes(entry.entryType)) {
      return total;
    }

    return total + entry.amountCents;
  }, 0);
};

type GrantUsageGiftInput = {
  shopId: string;
  reason?: string;
};

type GrantUsageGiftResult = {
  created: boolean;
  entryId: string;
};

export const grantUsageGift = async (
  input: GrantUsageGiftInput,
): Promise<GrantUsageGiftResult> => {
  const idempotencyKey = buildUsageGiftGrantIdempotencyKey(input.shopId);

  try {
    const entry = await prisma.usageLedgerEntry.create({
      data: {
        shop_id: input.shopId,
        entry_type: UsageLedgerEntryType.gift_grant,
        amount_cents: USAGE_GIFT_CENTS,
        currency_code: "USD",
        idempotency_key: idempotencyKey,
        description: input.reason ?? "usage_gift_grant",
      },
    });

    trackUsageGiftGrant({
      shopId: input.shopId,
      ledgerEntryId: entry.id,
      idempotencyKey,
      giftAmountCents: USAGE_GIFT_CENTS,
    });

    return { created: true, entryId: entry.id };
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      const existing = await prisma.usageLedgerEntry.findUnique({
        where: {
          shop_id_idempotency_key: {
            shop_id: input.shopId,
            idempotency_key: idempotencyKey,
          },
        },
        select: { id: true },
      });

      if (!existing) {
        throw error;
      }

      return { created: false, entryId: existing.id };
    }

    throw error;
  }
};

type UsageLedgerSummary = {
  giftGrantTotalCents: number;
  giftBalanceCents: number;
  paidUsageMonthToDateCents: number;
};

type UsageLedgerSummaryInput = {
  shopId: string;
  fallbackGiftBalanceCents?: number;
  now?: Date;
};

export const getUsageLedgerSummary = async (
  input: UsageLedgerSummaryInput,
): Promise<UsageLedgerSummary> => {
  const now = input.now ?? new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );

  const giftEntries = await prisma.usageLedgerEntry.findMany({
    where: {
      shop_id: input.shopId,
      entry_type: {
        in: giftEntryTypes,
      },
    },
    select: {
      entry_type: true,
      amount_cents: true,
    },
  });

  const giftGrantTotalCents = giftEntries.reduce((total, entry) => {
    if (entry.entry_type !== UsageLedgerEntryType.gift_grant) {
      return total;
    }

    return total + entry.amount_cents;
  }, 0);

  const mappedGiftEntries = giftEntries.map((entry) => ({
    entryType: entry.entry_type,
    amountCents: entry.amount_cents,
  }));
  const giftBalanceCents = giftEntries.length
    ? calculateGiftBalanceCents(mappedGiftEntries)
    : (input.fallbackGiftBalanceCents ?? 0);

  const paidUsage = await prisma.usageLedgerEntry.aggregate({
    where: {
      shop_id: input.shopId,
      entry_type: UsageLedgerEntryType.paid_usage,
      created_at: {
        gte: monthStart,
      },
    },
    _sum: {
      amount_cents: true,
    },
  });

  return {
    giftGrantTotalCents,
    giftBalanceCents,
    paidUsageMonthToDateCents: paidUsage._sum.amount_cents ?? 0,
  };
};

type UsageChargeResult = {
  created: boolean;
  giftAppliedCents: number;
  paidUsageCents: number;
};

type UsageChargeInput = {
  shopId: string;
  totalCostUsd: number;
  idempotencyKey: string;
  description?: string;
  now?: Date;
};

const normalizeUsageCents = (amountUsd: number) =>
  Math.max(0, Math.round(amountUsd * 100));

export const recordUsageCharge = async (
  input: UsageChargeInput,
): Promise<UsageChargeResult> => {
  const totalCostCents = normalizeUsageCents(input.totalCostUsd);
  if (totalCostCents === 0) {
    return { created: false, giftAppliedCents: 0, paidUsageCents: 0 };
  }

  const giftIdempotencyKey = `${input.idempotencyKey}:gift_spend`;
  const paidIdempotencyKey = `${input.idempotencyKey}:paid_usage`;

  return prisma.$transaction(async (tx) => {
    const existingEntries = await tx.usageLedgerEntry.findMany({
      where: {
        shop_id: input.shopId,
        idempotency_key: { in: [giftIdempotencyKey, paidIdempotencyKey] },
      },
      select: { entry_type: true, amount_cents: true },
    });

    if (existingEntries.length > 0) {
      const giftAppliedCents = Math.abs(
        existingEntries.find(
          (entry) => entry.entry_type === UsageLedgerEntryType.gift_spend,
        )?.amount_cents ?? 0,
      );
      const paidUsageCents =
        existingEntries.find(
          (entry) => entry.entry_type === UsageLedgerEntryType.paid_usage,
        )?.amount_cents ?? 0;

      return { created: false, giftAppliedCents, paidUsageCents };
    }

    const giftEntries = await tx.usageLedgerEntry.findMany({
      where: {
        shop_id: input.shopId,
        entry_type: { in: giftEntryTypes },
      },
      select: { entry_type: true, amount_cents: true },
    });

    const giftBalanceCents = calculateGiftBalanceCents(
      giftEntries.map((entry) => ({
        entryType: entry.entry_type,
        amountCents: entry.amount_cents,
      })),
    );

    const giftAppliedCents = Math.min(giftBalanceCents, totalCostCents);
    const paidUsageCents = totalCostCents - giftAppliedCents;

    if (giftAppliedCents > 0) {
      await tx.usageLedgerEntry.create({
        data: {
          shop_id: input.shopId,
          entry_type: UsageLedgerEntryType.gift_spend,
          amount_cents: -giftAppliedCents,
          currency_code: "USD",
          idempotency_key: giftIdempotencyKey,
          description: input.description ?? "usage_charge",
        },
      });
    }

    if (paidUsageCents > 0) {
      await tx.usageLedgerEntry.create({
        data: {
          shop_id: input.shopId,
          entry_type: UsageLedgerEntryType.paid_usage,
          amount_cents: paidUsageCents,
          currency_code: "USD",
          idempotency_key: paidIdempotencyKey,
          description: input.description ?? "usage_charge",
        },
      });
    }

    return { created: true, giftAppliedCents, paidUsageCents };
  });
};

type BuildStandardInputArgs = {
  returnUrl: string;
};

export const buildStandardSubscriptionInput = (
  args: BuildStandardInputArgs,
): AppSubscriptionCreateInput => {
  return {
    name: "Personalize Design Standard",
    returnUrl: args.returnUrl,
    trialDays: 7,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: { amount: 19, currencyCode: "USD" },
            interval: "EVERY_30_DAYS",
          },
        },
      },
      {
        plan: {
          appUsagePricingDetails: {
            cappedAmount: { amount: 10, currencyCode: "USD" },
            terms: "Usage charges for personalized order lines and AI usage.",
          },
        },
      },
    ],
  };
};

type BuildEarlyAccessInputArgs = {
  returnUrl: string;
};

export const buildEarlyAccessSubscriptionInput = (
  args: BuildEarlyAccessInputArgs,
): AppSubscriptionCreateInput => {
  return {
    name: "Personalize Design Early Access",
    returnUrl: args.returnUrl,
    trialDays: 0,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: { amount: 0, currencyCode: "USD" },
            interval: "EVERY_30_DAYS",
          },
        },
      },
      {
        plan: {
          appUsagePricingDetails: {
            cappedAmount: { amount: 10, currencyCode: "USD" },
            terms: "Usage charges for personalized order lines and AI usage.",
          },
        },
      },
    ],
  };
};

type AppSubscriptionCreateResult = {
  confirmationUrl: string;
  subscriptionId: string;
  subscriptionStatus: string;
};

type SubscriptionCreateArgs = {
  admin: AdminApiContext;
  subscriptionInput: AppSubscriptionCreateInput;
  test: boolean;
};

const getIsTestSubscription = (): boolean => {
  const configured =
    process.env.SHOPIFY_BILLING_TEST_MODE ??
    (process.env.NODE_ENV === "development" ? "true" : "false");

  if (configured !== "true" && configured !== "false") {
    throw new Error(
      "Invalid SHOPIFY_BILLING_TEST_MODE (expected 'true' or 'false').",
    );
  }

  if (configured === "true" && process.env.NODE_ENV !== "development") {
    throw new Error(
      "SHOPIFY_BILLING_TEST_MODE=true is only allowed in development.",
    );
  }

  return configured === "true";
};

const createSubscription = async (
  input: SubscriptionCreateArgs,
): Promise<AppSubscriptionCreateResult> => {
  const isTest = input.test;
  const response = await input.admin.graphql(
    `#graphql
      mutation createAppSubscription(
        $name: String!
        $returnUrl: URL!
        $trialDays: Int!
        $lineItems: [AppSubscriptionLineItemInput!]!
        $test: Boolean
      ) {
        appSubscriptionCreate(
          name: $name
          returnUrl: $returnUrl
          trialDays: $trialDays
          lineItems: $lineItems
          test: $test
        ) {
          userErrors {
            field
            message
          }
          confirmationUrl
          appSubscription {
            id
            status
          }
        }
      }
    `,
    { variables: { ...input.subscriptionInput, test: isTest } },
  );

  const responseJson = await response.json();
  const payload = responseJson?.data?.appSubscriptionCreate;
  const userErrors = payload?.userErrors ?? [];

  if (userErrors.length > 0) {
    const message = userErrors[0]?.message ?? "Unable to start subscription.";
    throw new Error(message);
  }

  const confirmationUrl = payload?.confirmationUrl;
  const subscriptionId = payload?.appSubscription?.id;
  const subscriptionStatus = payload?.appSubscription?.status;

  if (!confirmationUrl || !subscriptionId || !subscriptionStatus) {
    throw new Error("Subscription response was incomplete.");
  }

  return {
    confirmationUrl,
    subscriptionId,
    subscriptionStatus,
  };
};

export const createStandardSubscription = async (input: {
  admin: AdminApiContext;
  subscriptionInput: AppSubscriptionCreateInput;
}): Promise<AppSubscriptionCreateResult> => {
  return createSubscription({
    ...input,
    test: getIsTestSubscription(),
  });
};

export const createEarlyAccessSubscription = async (input: {
  admin: AdminApiContext;
  subscriptionInput: AppSubscriptionCreateInput;
}): Promise<AppSubscriptionCreateResult> => {
  return createSubscription({
    ...input,
    test: getIsTestSubscription(),
  });
};

type SubscriptionStatusResult = {
  id: string;
  status: string;
};

type SubscriptionCancelResult = {
  id: string;
  status: string;
};

export const getSubscriptionStatus = async (input: {
  admin: AdminApiContext;
  subscriptionId: string;
}): Promise<SubscriptionStatusResult> => {
  const response = await input.admin.graphql(
    `#graphql
      query subscriptionStatus($id: ID!) {
        node(id: $id) {
          ... on AppSubscription {
            id
            status
          }
        }
      }
    `,
    { variables: { id: input.subscriptionId } },
  );

  const responseJson = await response.json();
  const subscription = responseJson?.data?.node;

  if (!subscription?.id || !subscription?.status) {
    throw new Error("Subscription status not found.");
  }

  return {
    id: subscription.id,
    status: subscription.status,
  };
};

export const cancelSubscription = async (input: {
  admin: AdminApiContext;
  subscriptionId: string;
}): Promise<SubscriptionCancelResult> => {
  const response = await input.admin.graphql(
    `#graphql
      mutation cancelSubscription($id: ID!) {
        appSubscriptionCancel(id: $id) {
          userErrors {
            field
            message
          }
          appSubscription {
            id
            status
          }
        }
      }
    `,
    { variables: { id: input.subscriptionId } },
  );

  const responseJson = await response.json();
  const payload = responseJson?.data?.appSubscriptionCancel;
  const userErrors = payload?.userErrors ?? [];

  if (userErrors.length > 0) {
    const message = userErrors[0]?.message ?? "Unable to cancel subscription.";
    throw new Error(message);
  }

  const cancelled = payload?.appSubscription;
  if (!cancelled?.id || !cancelled?.status) {
    throw new Error("Subscription cancel response was incomplete.");
  }

  return {
    id: cancelled.id,
    status: cancelled.status,
  };
};
