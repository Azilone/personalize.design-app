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
