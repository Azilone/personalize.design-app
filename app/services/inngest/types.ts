import { z } from "zod";

export const templateTestGeneratePayloadSchema = z
  .object({
    shop_id: z.string().min(1),
    template_id: z.string().min(1),
    test_photo_url: z.string().optional(),
    prompt: z.string().min(1),
    variable_values: z.record(z.string(), z.string()),
    num_images: z.number().int().min(1).max(4),
    generation_model_identifier: z.string().min(1),
    remove_background_enabled: z.boolean(),
    fake_generation: z.boolean().default(false),
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

export const templateTestRemoveBackgroundPayloadSchema = z.object({
  shop_id: z.string().min(1),
  template_id: z.string().min(1),
  usage_idempotency_id: z.string().min(1).optional(),
  num_images: z.number().int().min(1).max(4),
  generation_total_cost_usd: z.number().nonnegative(),
  generation_total_time_seconds: z.number().nonnegative(),
  generated_images: z.array(
    z.object({
      url: z.string().url(),
      generation_time_seconds: z.number().nullable(),
      cost_usd: z.number().nonnegative(),
      generation_cost_usd: z.number().nonnegative().optional(),
      seed: z.number().optional(),
    }),
  ),
});

export type TemplateTestGeneratePayload = z.infer<
  typeof templateTestGeneratePayloadSchema
>;

export const templateTestFakeGeneratePayloadSchema = z.object({
  shop_id: z.string().min(1),
  template_id: z.string().min(1),
  num_images: z.number().int().min(1).max(4),
});

export type TemplateTestRemoveBackgroundPayload = z.infer<
  typeof templateTestRemoveBackgroundPayloadSchema
>;

export type TemplateTestFakeGeneratePayload = z.infer<
  typeof templateTestFakeGeneratePayloadSchema
>;

export const merchantPreviewGeneratePayloadSchema = z.object({
  job_id: z.string().min(1),
  shop_id: z.string().min(1),
  product_id: z.string().min(1),
  template_id: z.string().min(1),
  cover_print_area: z.boolean(),
  test_image_url: z.string().url(),
  test_text: z.string().optional(),
  variable_values: z.record(z.string(), z.string()),
});

export const merchantPreviewFakeGeneratePayloadSchema = z.object({
  job_id: z.string().min(1),
  shop_id: z.string().min(1),
  product_id: z.string().min(1),
  template_id: z.string().min(1),
  cover_print_area: z.boolean(),
  test_text: z.string().optional(),
  variable_values: z.record(z.string(), z.string()),
});

export const buyerPreviewGeneratePayloadSchema = z.object({
  shop_id: z.string().min(1),
  product_id: z.string().min(1),
  template_id: z.string().min(1),
  buyer_session_id: z.string().min(1),
  image_url: z.string().url(),
  text_input: z.string().optional(),
  variable_values: z.record(z.string(), z.string()),
});

export const generateImagePayloadSchema = z.discriminatedUnion("request_type", [
  buyerPreviewGeneratePayloadSchema.extend({
    request_type: z.literal("buyer_preview"),
  }),
  merchantPreviewGeneratePayloadSchema.extend({
    request_type: z.literal("merchant_preview"),
  }),
  templateTestGeneratePayloadSchema.extend({
    request_type: z.literal("template_test"),
  }),
]);

export const generateDevFakeImagePayloadSchema = z.discriminatedUnion(
  "request_type",
  [
    buyerPreviewGeneratePayloadSchema.extend({
      request_type: z.literal("buyer_preview"),
    }),
    merchantPreviewFakeGeneratePayloadSchema.extend({
      request_type: z.literal("merchant_preview"),
    }),
    templateTestFakeGeneratePayloadSchema.extend({
      request_type: z.literal("template_test"),
    }),
  ],
);

export const generateImageAndRemoveBackgroundPayloadSchema =
  templateTestRemoveBackgroundPayloadSchema;

export const mockupPrintifyPayloadSchema = z.object({
  job_id: z.string().min(1),
  shop_id: z.string().min(1),
  product_id: z.string().min(1),
  template_id: z.string().min(1),
  cover_print_area: z.boolean(),
  design_url: z.string().url().optional(),
  fake_generation: z.boolean().optional().default(false),
});

export type MerchantPreviewGeneratePayload = z.infer<
  typeof merchantPreviewGeneratePayloadSchema
>;

export type MerchantPreviewFakeGeneratePayload = z.infer<
  typeof merchantPreviewFakeGeneratePayloadSchema
>;

export type BuyerPreviewGeneratePayload = z.infer<
  typeof buyerPreviewGeneratePayloadSchema
>;

export type GenerateImagePayload = z.infer<typeof generateImagePayloadSchema>;

export type GenerateDevFakeImagePayload = z.infer<
  typeof generateDevFakeImagePayloadSchema
>;

export type GenerateImageAndRemoveBackgroundPayload = z.infer<
  typeof generateImageAndRemoveBackgroundPayloadSchema
>;

export type MockupPrintifyPayload = z.infer<typeof mockupPrintifyPayloadSchema>;

export const productsSyncPayloadSchema = z.object({
  shop_id: z.string().min(1),
  sync_id: z.string().min(1),
  synced_at: z.string().datetime(),
});

export type ProductsSyncPayload = z.infer<typeof productsSyncPayloadSchema>;
