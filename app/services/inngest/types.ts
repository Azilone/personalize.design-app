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

export const previewGeneratePayloadSchema = z.object({
  job_id: z.string().min(1),
  shop_id: z.string().min(1),
  product_id: z.string().min(1),
  template_id: z.string().min(1),
  type: z.enum(["buyer", "merchant", "template_test"]),
  image_url: z.string().url().optional(),
  text_input: z.string().optional(),
  test_image_url: z.string().url().optional(),
  test_text: z.string().optional(),
  variable_values: z.record(z.string(), z.string()).optional(),
  cover_print_area: z.boolean().optional(),
  session_id: z.string().optional(),
});

export const previewFakeGeneratePayloadSchema = z.object({
  job_id: z.string().min(1),
  shop_id: z.string().min(1),
  product_id: z.string().min(1),
  template_id: z.string().min(1),
  type: z.enum(["buyer", "merchant", "template_test"]),
  image_url: z.string().url().optional(),
  text_input: z.string().optional(),
  test_image_url: z.string().url().optional(),
  test_text: z.string().optional(),
  variable_values: z.record(z.string(), z.string()).optional(),
  cover_print_area: z.boolean().optional(),
  session_id: z.string().optional(),
});

export type PreviewGeneratePayload = z.infer<
  typeof previewGeneratePayloadSchema
>;

export type PreviewFakeGeneratePayload = z.infer<
  typeof previewFakeGeneratePayloadSchema
>;

export const productsSyncPayloadSchema = z.object({
  shop_id: z.string().min(1),
  sync_id: z.string().min(1),
  synced_at: z.string().datetime(),
});

export type ProductsSyncPayload = z.infer<typeof productsSyncPayloadSchema>;
