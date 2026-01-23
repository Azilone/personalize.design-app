import { z } from "zod";
import {
  MVP_GENERATION_MODEL_ID,
  MVP_PRICE_USD_PER_GENERATION,
} from "../lib/generation-settings";
import {
  DEFAULT_TEMPLATE_ASPECT_RATIO,
  TEMPLATE_ASPECT_RATIOS,
} from "../lib/template-aspect-ratios";

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

const devBypassAccessSchema = z.object({
  intent: z.literal("dev_bypass_access"),
});

const syncPendingStatusSchema = z.object({
  intent: z.literal("sync_pending_status"),
});

export const paywallActionSchema = z.discriminatedUnion("intent", [
  subscribeIntentSchema,
  inviteUnlockSchema,
  resetBillingDevSchema,
  devBypassAccessSchema,
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

const increaseCapSchema = z.object({
  intent: z.literal("increase_cap"),
  new_cap_usd: z.coerce.number().finite().gt(0),
  confirm_increase: z.string(),
});

export const spendSafetyActionSchema = z.discriminatedUnion("intent", [
  spendSafetySaveSchema,
  increaseCapSchema,
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

const productsSyncSchema = z.object({
  intent: z.literal("products_sync"),
});

export const productsActionSchema = z.discriminatedUnion("intent", [
  productsSyncSchema,
]);

export type ProductsActionInput = z.infer<typeof productsActionSchema>;

const productTemplateAssignmentSchema = z.object({
  intent: z.literal("product_template_assignment_save"),
  product_id: z.string().min(1, "Product ID is required"),
  template_id: z.string().optional().default(""),
  personalization_enabled: z.enum(["true", "false"]).default("false"),
});

const productPreviewGenerateSchema = z.object({
  intent: z.literal("product_preview_generate"),
  product_id: z.string().min(1, "Product ID is required"),
  template_id: z.string().min(1, "Template ID is required"),
  cover_print_area: z.enum(["true", "false"]).default("false"),
  test_text: z.string().optional(),
  variable_values_json: z.string().default("{}"),
  fake_generation: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export const productTemplateAssignmentActionSchema = z.discriminatedUnion(
  "intent",
  [productTemplateAssignmentSchema, productPreviewGenerateSchema],
);

export type ProductTemplateAssignmentActionInput = z.infer<
  typeof productTemplateAssignmentActionSchema
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
  aspect_ratio: z
    .enum(TEMPLATE_ASPECT_RATIOS)
    .default(DEFAULT_TEMPLATE_ASPECT_RATIO),
  prompt: z
    .string()
    .max(5000, "Prompt must be less than 5000 characters")
    .optional(),
  // Variable names as JSON array string (FormData workaround)
  variable_names_json: z.string().default("[]"),
  // Generation settings (MVP: single allowed model)
  generation_model_identifier: z
    .literal(MVP_GENERATION_MODEL_ID, {
      message: `Model must be ${MVP_GENERATION_MODEL_ID}`,
    })
    .optional(),
  price_usd_per_generation: z.coerce
    .number()
    .refine((val) => val === MVP_PRICE_USD_PER_GENERATION, {
      message: `Price must be ${MVP_PRICE_USD_PER_GENERATION}`,
    })
    .optional(),
  // Remove background setting
  remove_background_enabled: z.enum(["true", "false"]).default("false"),
});

const templateUpdateSchema = z.object({
  intent: z.literal("template_update"),
  template_id: z.string().min(1, "Template ID is required"),
  template_name: z.string().min(1, "Template name is required"),
  text_input_enabled: z.enum(["true", "false"]).default("false"),
  aspect_ratio: z
    .enum(TEMPLATE_ASPECT_RATIOS)
    .default(DEFAULT_TEMPLATE_ASPECT_RATIO),
  prompt: z
    .string()
    .max(5000, "Prompt must be less than 5000 characters")
    .optional(),
  variable_names_json: z.string().default("[]"),
  // Generation settings (MVP: single allowed model)
  generation_model_identifier: z
    .literal(MVP_GENERATION_MODEL_ID, {
      message: `Model must be ${MVP_GENERATION_MODEL_ID}`,
    })
    .optional(),
  price_usd_per_generation: z.coerce
    .number()
    .refine((val) => val === MVP_PRICE_USD_PER_GENERATION, {
      message: `Price must be ${MVP_PRICE_USD_PER_GENERATION}`,
    })
    .optional(),
  // Remove background setting
  remove_background_enabled: z.enum(["true", "false"]).default("false"),
});

const templateDeleteSchema = z.object({
  intent: z.literal("template_delete"),
  template_id: z.string().min(1, "Template ID is required"),
});

const templateTestGenerateSchema = z
  .object({
    intent: z.literal("template_test_generate"),
    template_id: z.string().min(1, "Template ID is required"),
    test_photo_url: z.string().optional(),
    test_text: z.string().optional(),
    variable_values_json: z.string().default("{}"),
    num_images: z.coerce
      .number()
      .int()
      .min(1, "At least 1 image is required")
      .max(4, "Maximum 4 images allowed"),
    remove_background_enabled: z.enum(["true", "false"]).optional(),
    fake_generation: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
  })
  .refine(
    (data) =>
      data.fake_generation ||
      (data.test_photo_url !== undefined && data.test_photo_url.trim() !== ""),
    "Test photo URL is required for real generation",
  )
  .refine(
    (data) =>
      data.fake_generation ||
      (data.test_photo_url !== undefined &&
        data.test_photo_url.trim() !== "" &&
        z.string().url().safeParse(data.test_photo_url).success),
    "Test photo must be a valid URL for real generation",
  );

const templatePublishSchema = z.object({
  intent: z.literal("template_publish"),
  template_id: z.string().min(1, "Template ID is required"),
});

const templateUnpublishSchema = z.object({
  intent: z.literal("template_unpublish"),
  template_id: z.string().min(1, "Template ID is required"),
});

export const templateActionSchema = z.discriminatedUnion("intent", [
  templateCreateSchema,
  templateUpdateSchema,
  templateDeleteSchema,
  templateTestGenerateSchema,
  templatePublishSchema,
  templateUnpublishSchema,
]);

export type TemplateActionInput = z.infer<typeof templateActionSchema>;
export type TemplateTestGenerateInput = z.infer<
  typeof templateTestGenerateSchema
>;
