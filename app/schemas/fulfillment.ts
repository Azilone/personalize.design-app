/**
 * Zod schemas for fulfillment asset operations.
 *
 * Validates payloads for:
 * - Asset resolution requests
 * - Asset retrieval responses
 * - Error envelopes
 */

import { z } from "zod";

/**
 * Error codes for asset resolution operations.
 */
export const AssetResolutionErrorCodeSchema = z.enum([
  "asset_not_found",
  "asset_inaccessible",
  "invalid_personalization_id",
  "storage_error",
]);

export type AssetResolutionErrorCode = z.infer<
  typeof AssetResolutionErrorCodeSchema
>;

/**
 * Standard error envelope for API responses.
 */
export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

/**
 * Resolved asset information schema.
 */
export const ResolvedAssetSchema = z.object({
  bucket: z.string(),
  storage_key: z.string(),
  design_url: z.string().nullable(),
  job_id: z.string(),
  template_id: z.string(),
  product_id: z.string(),
});

export type ResolvedAsset = z.infer<typeof ResolvedAssetSchema>;

/**
 * Asset retrieval result with signed URL schema.
 */
export const AssetRetrievalResultSchema = ResolvedAssetSchema.extend({
  signed_url: z.string(),
  expires_at: z.string().datetime(),
});

export type AssetRetrievalResult = z.infer<typeof AssetRetrievalResultSchema>;

/**
 * Request schema for asset resolution by personalization_id.
 */
export const ResolveAssetRequestSchema = z.object({
  shop_id: z.string().min(1),
  order_line_id: z.string().min(1),
  personalization_id: z.string().min(1),
});

export type ResolveAssetRequest = z.infer<typeof ResolveAssetRequestSchema>;

/**
 * Response schema for successful asset resolution.
 */
export const ResolveAssetResponseSchema = z.object({
  success: z.literal(true),
  asset: ResolvedAssetSchema,
});

export type ResolveAssetResponse = z.infer<typeof ResolveAssetResponseSchema>;

/**
 * Response schema for asset retrieval with signed URL.
 */
export const RetrieveAssetResponseSchema = z.object({
  success: z.literal(true),
  asset: AssetRetrievalResultSchema,
});

export type RetrieveAssetResponse = z.infer<typeof RetrieveAssetResponseSchema>;

/**
 * PostHog event payload for fulfillment.asset.persisted.
 */
export const FulfillmentAssetPersistedEventSchema = z.object({
  shop_id: z.string(),
  order_id: z.string(),
  order_line_id: z.string(),
  personalization_id: z.string(),
  storage_key: z.string(),
  bucket: z.string(),
  template_id: z.string(),
  product_id: z.string(),
});

export type FulfillmentAssetPersistedEvent = z.infer<
  typeof FulfillmentAssetPersistedEventSchema
>;

/**
 * PostHog event payload for fulfillment.asset.failed.
 */
export const FulfillmentAssetFailedEventSchema = z.object({
  shop_id: z.string(),
  order_id: z.string(),
  order_line_id: z.string(),
  personalization_id: z.string(),
  error_code: AssetResolutionErrorCodeSchema,
  error_message: z.string(),
});

export type FulfillmentAssetFailedEvent = z.infer<
  typeof FulfillmentAssetFailedEventSchema
>;
