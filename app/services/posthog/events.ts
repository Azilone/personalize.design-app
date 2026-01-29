import { captureEvent } from "../../lib/posthog.server";

type UsageGiftGrantEventInput = {
  shopId: string;
  ledgerEntryId: string;
  idempotencyKey: string;
  giftAmountCents: number;
};

export const trackUsageGiftGrant = (input: UsageGiftGrantEventInput) => {
  captureEvent("usage.gift.granted", {
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

// --------------------------------------------------------------------------
// Billable Event State Transition Events (AC 5, 6, 7, 8)
// --------------------------------------------------------------------------

type BillableEventCreatedInput = {
  shopId: string;
  billableEventId: string;
  idempotencyKey: string;
  eventType: string;
  amountMills: number;
  sourceId?: string;
};

export const trackBillableEventCreated = (input: BillableEventCreatedInput) => {
  captureEvent("billing.event_created", {
    shop_id: input.shopId,
    billable_event_id: input.billableEventId,
    idempotency_key: input.idempotencyKey,
    event_type: input.eventType,
    amount_mills: input.amountMills,
    source_id: input.sourceId ?? null,
  });
};

type BillableEventConfirmedInput = {
  shopId: string;
  billableEventId: string;
  idempotencyKey: string;
  eventType?: string;
  amountMills?: number;
};

export const trackBillableEventConfirmed = (
  input: BillableEventConfirmedInput,
) => {
  captureEvent("billing.event_confirmed", {
    shop_id: input.shopId,
    billable_event_id: input.billableEventId,
    idempotency_key: input.idempotencyKey,
    event_type: input.eventType ?? null,
    amount_mills: input.amountMills ?? null,
  });
};

type ChargeSucceededInput = {
  shopId: string;
  billableEventId: string;
  idempotencyKey: string;
  totalCostMills: number;
  giftAppliedMills: number;
  paidUsageMills: number;
};

export const trackChargeSucceeded = (input: ChargeSucceededInput) => {
  captureEvent("billing.charge_succeeded", {
    shop_id: input.shopId,
    billable_event_id: input.billableEventId,
    idempotency_key: input.idempotencyKey,
    total_cost_mills: input.totalCostMills,
    gift_applied_mills: input.giftAppliedMills,
    paid_usage_mills: input.paidUsageMills,
  });
};

type ChargeFailedInput = {
  shopId: string;
  billableEventId: string;
  idempotencyKey: string;
  errorMessage?: string;
};

export const trackChargeFailed = (input: ChargeFailedInput) => {
  captureEvent("billing.charge_failed", {
    shop_id: input.shopId,
    billable_event_id: input.billableEventId,
    idempotency_key: input.idempotencyKey,
    error_message: input.errorMessage ?? null,
  });
};

type BillableEventWaivedInput = {
  shopId: string;
  billableEventId: string;
  idempotencyKey: string;
  errorMessage?: string;
};

export const trackBillableEventWaived = (input: BillableEventWaivedInput) => {
  captureEvent("billing.event_waived", {
    shop_id: input.shopId,
    billable_event_id: input.billableEventId,
    idempotency_key: input.idempotencyKey,
    error_message: input.errorMessage ?? null,
  });
};

// --------------------------------------------------------------------------
// Webhook Processing Events
// --------------------------------------------------------------------------

type WebhookReceivedInput = {
  shopId: string;
  webhookId: string;
  topic: string;
  correlationId: string;
};

export const trackWebhookReceived = (input: WebhookReceivedInput) => {
  captureEvent("webhook.order_paid.received", {
    shop_id: input.shopId,
    webhook_id: input.webhookId,
    topic: input.topic,
    correlation_id: input.correlationId,
  });
};

type WebhookProcessedInput = {
  shopId: string;
  webhookId: string;
  orderId: string;
  correlationId: string;
  hasPersonalization: boolean;
  eligibleLinesCount: number;
  processingStatus:
    | "success"
    | "partial_failure"
    | "duplicate"
    | "no_personalization";
  successCount?: number;
  duplicateCount?: number;
  errorCount?: number;
};

export const trackWebhookProcessed = (input: WebhookProcessedInput) => {
  captureEvent("webhook.order_paid.processed", {
    shop_id: input.shopId,
    webhook_id: input.webhookId,
    order_id: input.orderId,
    correlation_id: input.correlationId,
    has_personalization: input.hasPersonalization,
    eligible_lines_count: input.eligibleLinesCount,
    processing_status: input.processingStatus,
    success_count: input.successCount ?? null,
    duplicate_count: input.duplicateCount ?? null,
    error_count: input.errorCount ?? null,
  });
};

type WebhookDuplicateInput = {
  shopId: string;
  webhookId: string;
  orderId: string;
  orderLineId: string;
  correlationId: string;
};

export const trackWebhookDuplicate = (input: WebhookDuplicateInput) => {
  captureEvent("webhook.order_paid.duplicate", {
    shop_id: input.shopId,
    webhook_id: input.webhookId,
    order_id: input.orderId,
    order_line_id: input.orderLineId,
    correlation_id: input.correlationId,
  });
};
