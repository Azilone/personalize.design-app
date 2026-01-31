import { z } from "zod";
import {
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE_BYTES,
} from "../services/supabase/storage";

const isAllowedFileType = (filename: string): boolean => {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1 || lastDot === filename.length - 1) {
    return false;
  }
  const extension = filename.slice(lastDot + 1).toLowerCase();
  return ALLOWED_FILE_TYPES.includes(
    extension as (typeof ALLOWED_FILE_TYPES)[number],
  );
};

const appProxyErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.array(z.string())).optional(),
  }),
});

export const generatePreviewRequestSchema = z.object({
  shop_id: z.string().min(1),
  product_id: z.string().min(1),
  variant_id: z.string().optional(),
  template_id: z.string().min(1),
  session_id: z.string().min(1),
  image_file: z
    .custom<File>((value) => value instanceof File, "Image file is required.")
    .refine((file) => file.size <= MAX_FILE_SIZE_BYTES, {
      message: "Image file is too large.",
    })
    .refine((file) => isAllowedFileType(file.name), {
      message: "Image file type is not allowed.",
    }),
  text_input: z.string().optional(),
  variable_values_json: z.string().optional(),
  fake_generation: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export const generatePreviewResponseSchema = z.union([
  z.object({
    data: z.object({
      job_id: z.string().min(1),
      status: z.enum(["pending", "processing", "succeeded", "failed"]),
    }),
  }),
  appProxyErrorSchema,
]);

export const templateConfigRequestSchema = z.object({
  shop_id: z.string().min(1),
  template_id: z.string().min(1),
});

export const templateConfigResponseSchema = z.union([
  z.object({
    data: z.object({
      template_id: z.string().min(1),
      template_name: z.string().min(1),
      photo_required: z.boolean(),
      text_input_enabled: z.boolean(),
      variables: z.array(
        z.object({
          id: z.string().min(1),
          name: z.string().min(1),
        }),
      ),
    }),
  }),
  appProxyErrorSchema,
]);

// Regeneration schemas
export const regeneratePreviewRequestSchema = z.object({
  shop_id: z.string().min(1),
  product_id: z.string().min(1),
  variant_id: z.string().optional(),
  template_id: z.string().min(1),
  session_id: z.string().min(1),
  previous_job_id: z.string().min(1),
  fake_generation: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export const regeneratePreviewResponseSchema = z.union([
  z.object({
    data: z.object({
      job_id: z.string().min(1),
      status: z.enum(["pending", "processing", "succeeded", "failed"]),
      tries_remaining: z.number().int().min(0).optional(),
      per_product_tries_remaining: z.number().int().min(0).optional(),
      per_session_tries_remaining: z.number().int().min(0).optional(),
      reset_at: z.string().datetime().optional(),
      reset_in_minutes: z.number().int().min(0).optional(),
      cost_usd: z.number().optional(),
    }),
  }),
  appProxyErrorSchema,
]);

// Extended status response with limit info
export const generatePreviewStatusResponseSchema = z.union([
  z.object({
    data: z.object({
      job_id: z.string().min(1),
      status: z.enum([
        "pending",
        "processing",
        "succeeded",
        "failed",
        "mockups_failed",
      ]),
      preview_url: z.string().url().optional(),
      design_url: z.string().url().optional(),
      mockup_urls: z.array(z.string().url()).optional(),
      mockup_status: z.enum(["loading", "ready", "error"]).optional(),
      error: z.string().optional(),
      // Limit tracking fields
      tries_remaining: z.number().int().min(0).optional(),
      per_product_tries_remaining: z.number().int().min(0).optional(),
      per_session_tries_remaining: z.number().int().min(0).optional(),
      reset_at: z.string().datetime().optional(),
      reset_in_minutes: z.number().int().min(0).optional(),
      can_regenerate: z.boolean().optional(),
    }),
  }),
  appProxyErrorSchema,
]);

export type GeneratePreviewRequest = z.infer<
  typeof generatePreviewRequestSchema
>;
export type GeneratePreviewResponse = z.infer<
  typeof generatePreviewResponseSchema
>;
export type GeneratePreviewStatusResponse = z.infer<
  typeof generatePreviewStatusResponseSchema
>;
export type TemplateConfigResponse = z.infer<
  typeof templateConfigResponseSchema
>;
export type RegeneratePreviewRequest = z.infer<
  typeof regeneratePreviewRequestSchema
>;
export type RegeneratePreviewResponse = z.infer<
  typeof regeneratePreviewResponseSchema
>;

// Product config schemas
export const productConfigRequestSchema = z.object({
  shop_id: z.string().min(1),
  product_id: z.string().min(1),
});

export const productConfigResponseSchema = z.union([
  z.object({
    data: z
      .object({
        template_id: z.string().min(1),
        personalization_enabled: z.boolean(),
        text_enabled: z.boolean(),
      })
      .nullable(),
  }),
  appProxyErrorSchema,
]);

export type ProductConfigResponse = z.infer<typeof productConfigResponseSchema>;
