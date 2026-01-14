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

const devOnboardingResetSchema = z.object({
  intent: z.literal("dev_onboarding_reset"),
});

export const devBillingActionSchema = z.discriminatedUnion("intent", [
  devBillingResetSchema,
  devCancelSubscriptionSchema,
  devOnboardingResetSchema,
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

const printifyConnectSchema = z.object({
  intent: z.literal("printify_connect"),
  printify_api_token: z.string().min(1),
  printify_shop_id: z.string().min(1).optional(),
  printify_shop_title: z.string().min(1).optional(),
  printify_sales_channel: z.string().min(1).optional(),
});

const printifyDisconnectSchema = z.object({
  intent: z.literal("printify_disconnect"),
});

export const printifyActionSchema = z.discriminatedUnion("intent", [
  printifyConnectSchema,
  printifyDisconnectSchema,
]);

export type PrintifyActionInput = z.infer<typeof printifyActionSchema>;

const storefrontPersonalizationSchema = z.object({
  intent: z.literal("storefront_personalization_choice"),
  storefront_personalization_choice: z.enum(["enabled", "disabled"]),
});

export const storefrontPersonalizationActionSchema = z.discriminatedUnion(
  "intent",
  [storefrontPersonalizationSchema],
);

export type StorefrontPersonalizationActionInput = z.infer<
  typeof storefrontPersonalizationActionSchema
>;

const finishOnboardingSchema = z.object({
  intent: z.literal("finish_onboarding"),
});

export const finishOnboardingActionSchema = z.discriminatedUnion("intent", [
  finishOnboardingSchema,
]);

export type FinishOnboardingActionInput = z.infer<
  typeof finishOnboardingActionSchema
>;

// Template action schemas

/**
 * Template variable_names is sent as JSON string to avoid FormData array issues
 * with Object.fromEntries. Parse and validate in the route action.
 */
const templateCreateSchema = z.object({
  intent: z.literal("template_create"),
  template_name: z.string().min(1, "Template name is required"),
  text_input_enabled: z.enum(["true", "false"]).default("false"),
  prompt: z
    .string()
    .max(5000, "Prompt must be less than 5000 characters")
    .optional(),
  // Variable names as JSON array string (FormData workaround)
  variable_names_json: z.string().default("[]"),
});

const templateUpdateSchema = z.object({
  intent: z.literal("template_update"),
  template_id: z.string().min(1, "Template ID is required"),
  template_name: z.string().min(1, "Template name is required"),
  text_input_enabled: z.enum(["true", "false"]).default("false"),
  prompt: z
    .string()
    .max(5000, "Prompt must be less than 5000 characters")
    .optional(),
  variable_names_json: z.string().default("[]"),
});

const templateDeleteSchema = z.object({
  intent: z.literal("template_delete"),
  template_id: z.string().min(1, "Template ID is required"),
});

export const templateActionSchema = z.discriminatedUnion("intent", [
  templateCreateSchema,
  templateUpdateSchema,
  templateDeleteSchema,
]);

export type TemplateActionInput = z.infer<typeof templateActionSchema>;
