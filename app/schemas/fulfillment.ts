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

// ============================================================================
// Printify Fulfillment Schemas (Story 7.3)
// ============================================================================

/**
 * Printify order status values from API.
 * Maps to internal pending/succeeded/failed statuses.
 */
export const PrintifyOrderStatusSchema = z.enum([
  "pending",
  "on-hold",
  "sending-to-production",
  "in-production",
  "canceled",
  "fulfilled",
  "partially-fulfilled",
  "has-issues",
  "unfulfillable",
]);

export type PrintifyOrderStatus = z.infer<typeof PrintifyOrderStatusSchema>;

/**
 * Internal fulfillment submit status.
 */
export const FulfillmentSubmitStatusSchema = z.enum([
  "pending",
  "succeeded",
  "failed",
]);

export type FulfillmentSubmitStatus = z.infer<
  typeof FulfillmentSubmitStatusSchema
>;

/**
 * Printify submission error codes.
 */
export const PrintifySubmitErrorCodeSchema = z.enum([
  "printify_not_configured",
  "printify_api_error",
  "printify_rate_limited",
  "printify_invalid_token",
  "printify_order_rejected",
  "protected_customer_data_not_approved",
  "shipping_address_incomplete",
  "asset_url_unavailable",
  "order_line_not_found",
  "unknown_error",
]);

export type PrintifySubmitErrorCode = z.infer<
  typeof PrintifySubmitErrorCodeSchema
>;

/**
 * Recovery guidance for Printify submission errors.
 */
export const PRINTIFY_RECOVERY_GUIDANCE: Record<
  PrintifySubmitErrorCode,
  string
> = {
  printify_not_configured:
    "Printify integration is not configured. Go to the Printify section in the app and connect your Printify account.",
  printify_api_error:
    "Printify API returned an error. This is usually temporary. Retry the order or contact support if the issue persists.",
  printify_rate_limited:
    "Printify is rate limiting requests. Wait a few minutes and retry the order.",
  printify_invalid_token:
    "The Printify API token is invalid or expired. Go to Settings and reconnect your Printify account.",
  printify_order_rejected:
    "Printify rejected the order. Check the error details and verify the product configuration is correct.",
  protected_customer_data_not_approved:
    "This app is not approved to access protected customer data (email/shipping address). Request protected customer data access in Shopify Partner Dashboard and reinstall the app with the required scopes.",
  shipping_address_incomplete:
    "Shipping address is missing required fields. Update the order in Shopify with a complete shipping address, then retry fulfillment.",
  asset_url_unavailable:
    "Unable to generate a URL for the design asset. Retry the order or regenerate the design.",
  order_line_not_found:
    "Order line processing record not found. This may indicate a data integrity issue. Contact support.",
  unknown_error:
    "An unexpected error occurred. Retry the order or contact support if the issue persists.",
};

/**
 * Printify order submission request payload.
 */
export const PrintifyOrderSubmissionRequestSchema = z.object({
  shop_id: z.string().min(1),
  order_id: z.string().min(1),
  order_line_id: z.string().min(1),
  printify_shop_id: z.string().min(1),
  asset_url: z.string().url(),
  idempotency_key: z.string().min(1),
});

export type PrintifyOrderSubmissionRequest = z.infer<
  typeof PrintifyOrderSubmissionRequestSchema
>;

/**
 * Printify order submission result.
 */
export const PrintifyOrderSubmissionResultSchema = z.object({
  success: z.boolean(),
  printify_order_id: z.string().optional(),
  printify_order_number: z.number().optional(),
  error_code: PrintifySubmitErrorCodeSchema.optional(),
  error_message: z.string().optional(),
});

export type PrintifyOrderSubmissionResult = z.infer<
  typeof PrintifyOrderSubmissionResultSchema
>;

/**
 * Fulfillment status response for admin/operator UI (AC: 4).
 */
export const FulfillmentStatusResponseSchema = z.object({
  order_line_id: z.string(),
  status: z.string(),
  printify_submit_status: FulfillmentSubmitStatusSchema.nullable(),
  printify_order_id: z.string().nullable(),
  printify_order_number: z.number().nullable(),
  printify_submitted_at: z.string().datetime().nullable(),
  printify_order_status: z.string().nullable(),
  printify_order_status_updated_at: z.string().datetime().nullable(),
  printify_last_event: z.string().nullable(),
  printify_last_event_at: z.string().datetime().nullable(),
  printify_tracking_number: z.string().nullable(),
  printify_tracking_url: z.string().nullable(),
  printify_tracking_carrier: z.string().nullable(),
  printify_shipped_at: z.string().datetime().nullable(),
  printify_delivered_at: z.string().datetime().nullable(),
  printify_error_code: PrintifySubmitErrorCodeSchema.nullable(),
  printify_error_message: z.string().nullable(),
  recovery_guidance: z.string().nullable(),
});

export type FulfillmentStatusResponse = z.infer<
  typeof FulfillmentStatusResponseSchema
>;

/**
 * PostHog event payload for fulfillment.submitted.
 */
export const FulfillmentSubmittedEventSchema = z.object({
  shop_id: z.string(),
  order_id: z.string(),
  order_line_id: z.string(),
  personalization_id: z.string(),
  printify_order_id: z.string(),
  printify_order_number: z.number().optional(),
  idempotency_key: z.string(),
});

export type FulfillmentSubmittedEvent = z.infer<
  typeof FulfillmentSubmittedEventSchema
>;

/**
 * PostHog event payload for fulfillment.succeeded.
 */
export const FulfillmentSucceededEventSchema = z.object({
  shop_id: z.string(),
  order_id: z.string(),
  order_line_id: z.string(),
  personalization_id: z.string(),
  printify_order_id: z.string(),
});

export type FulfillmentSucceededEvent = z.infer<
  typeof FulfillmentSucceededEventSchema
>;

/**
 * PostHog event payload for fulfillment.failed.
 */
export const FulfillmentFailedEventSchema = z.object({
  shop_id: z.string(),
  order_id: z.string(),
  order_line_id: z.string(),
  personalization_id: z.string(),
  error_code: PrintifySubmitErrorCodeSchema,
  error_message: z.string(),
});

export type FulfillmentFailedEvent = z.infer<
  typeof FulfillmentFailedEventSchema
>;
