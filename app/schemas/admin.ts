import { z } from "zod";

const subscribeIntentSchema = z.object({
  intent: z.literal("subscribe"),
});

const inviteUnlockSchema = z.object({
  intent: z.literal("invite_unlock"),
  invite_code: z.string(),
});

const resetBillingDevSchema = z.object({
  intent: z.literal("reset_billing_dev"),
});

const syncPendingStatusSchema = z.object({
  intent: z.literal("sync_pending_status"),
});

export const paywallActionSchema = z.discriminatedUnion("intent", [
  subscribeIntentSchema,
  inviteUnlockSchema,
  resetBillingDevSchema,
  syncPendingStatusSchema,
]);

export type PaywallActionInput = z.infer<typeof paywallActionSchema>;

const devBillingResetSchema = z.object({
  intent: z.literal("dev_billing_reset"),
});

const devCancelSubscriptionSchema = z.object({
  intent: z.literal("dev_cancel_subscription"),
});

export const devBillingActionSchema = z.discriminatedUnion("intent", [
  devBillingResetSchema,
  devCancelSubscriptionSchema,
]);

export type DevBillingActionInput = z.infer<typeof devBillingActionSchema>;

const spendSafetySaveSchema = z.object({
  intent: z.literal("save_spend_safety"),
  monthly_cap_usd: z.coerce.number().finite().gt(0),
  paid_usage_consent: z.string().optional(),
});

export const spendSafetyActionSchema = z.discriminatedUnion("intent", [
  spendSafetySaveSchema,
]);

export type SpendSafetyActionInput = z.infer<typeof spendSafetyActionSchema>;
