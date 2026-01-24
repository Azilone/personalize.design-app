import { captureEvent } from "../../lib/posthog.server";

type UsageGiftGrantEventInput = {
  shopId: string;
  ledgerEntryId: string;
  idempotencyKey: string;
  giftAmountCents: number;
};

export const trackUsageGiftGrant = (input: UsageGiftGrantEventInput) => {
  captureEvent("usage_gift_grant", {
    shop_id: input.shopId,
    billable_event_id: input.ledgerEntryId,
    idempotency_key: input.idempotencyKey,
    gift_amount_cents: input.giftAmountCents,
  });
};

type BillingUsageBlockedEventInput = {
  shopId: string;
  costMills: number;
  giftBalanceMills: number;
  reason: "consent_required" | "gift_insufficient";
};

export const trackBillingUsageBlocked = (
  input: BillingUsageBlockedEventInput,
) => {
  const costCents = Math.trunc(input.costMills / 10);
  const giftBalanceCents = Math.trunc(input.giftBalanceMills / 10);
  captureEvent("billing.usage_blocked", {
    shop_id: input.shopId,
    cost_cents: costCents,
    gift_balance_cents: giftBalanceCents,
    cost_mills: input.costMills,
    gift_balance_mills: input.giftBalanceMills,
    reason: input.reason,
  });
};

type BillingCapExceededEventInput = {
  shopId: string;
  costMills: number;
  mtdSpendMills: number;
  capCents: number;
};

export const trackBillingCapExceeded = (
  input: BillingCapExceededEventInput,
) => {
  const capMills = input.capCents * 10;
  const costCents = Math.trunc(input.costMills / 10);
  const mtdSpendCents = Math.trunc(input.mtdSpendMills / 10);
  captureEvent("billing.cap_exceeded", {
    shop_id: input.shopId,
    action_cost_cents: costCents,
    action_cost_mills: input.costMills,
    mtd_spend_cents: mtdSpendCents,
    mtd_spend_mills: input.mtdSpendMills,
    cap_cents: input.capCents,
    cap_mills: capMills,
  });
};

type BillingCapModifiedEventInput = {
  shopId: string;
  oldCapCents: number;
  newCapCents: number;
};

export const trackBillingCapModified = (
  input: BillingCapModifiedEventInput,
) => {
  captureEvent("billing.cap_modified", {
    shop_id: input.shopId,
    old_cap_cents: input.oldCapCents,
    new_cap_cents: input.newCapCents,
  });
};
