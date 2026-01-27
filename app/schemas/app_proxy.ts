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

export const generatePreviewStatusResponseSchema = z.union([
  z.object({
    data: z.object({
      job_id: z.string().min(1),
      status: z.enum(["pending", "processing", "succeeded", "failed"]),
      preview_url: z.string().url().optional(),
      error: z.string().optional(),
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
