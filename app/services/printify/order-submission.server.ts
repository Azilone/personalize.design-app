/**
 * Printify Order Submission Service (Story 7.3)
 *
 * Handles:
 * - Submitting orders to Printify for fulfillment
 * - Mapping Printify statuses to internal statuses
 * - Building idempotency keys for retry safety
 */

import { z } from "zod";
import logger from "../../lib/logger";
import {
  PRINTIFY_BASE_URL,
  fetchPrintify,
  assertPrintifyOk,
} from "./request.server";
import { getPrintifyIntegrationWithToken } from "./integration.server";
import { decryptPrintifyToken } from "./token-encryption.server";
import { PrintifyRequestError, type PrintifyErrorCode } from "./client.server";
import type {
  PrintifyOrderStatus,
  PrintifySubmitErrorCode,
  PrintifyOrderSubmissionResult,
} from "../../schemas/fulfillment";

// ============================================================================
// Types
// ============================================================================

export interface SubmitOrderInput {
  shopId: string;
  orderId: string;
  orderLineId: string;
  assetUrl: string;
  printifyUploadId?: string | null;
  idempotencyKey: string;
  printAreaPosition?: string;
  printAreaX?: number;
  printAreaY?: number;
  printAreaScale?: number;
  printAreaAngle?: number;
  shippingMethodId?: number;
  // Customer details for Printify order
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    address: {
      address1: string;
      address2?: string;
      city: string;
      region: string;
      zip: string;
      country: string;
    };
  };
  // Product/variant info for Printify
  printifyProductId: string;
  printifyBlueprintId: number;
  printifyPrintProviderId: number;
  variantId: number;
  quantity: number;
}

export interface SubmitOrderResult {
  success: boolean;
  printifyOrderId?: string;
  printifyOrderNumber?: number;
  errorCode?: PrintifySubmitErrorCode;
  errorMessage?: string;
  retryable?: boolean;
}


// ============================================================================
// Printify API Response Schemas
// ============================================================================

/**
 * Printify order creation response schema.
 */
const printifyOrderResponseSchema = z.object({
  id: z.string(),
  order_number: z.number().optional(),
  status: z.string().optional(),
});

const printifyUploadDetailsSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  url: z.string().optional(),
  file_url: z.string().optional(),
  preview_url: z.string().optional(),
});

const printifyUploadResponseSchema = z.object({
  id: z.union([z.string(), z.number()]),
});

const resolveUploadFileName = (imageUrl: string): string => {
  try {
    const url = new URL(imageUrl);
    const pathname = url.pathname.split("/").pop();
    if (pathname && pathname.includes(".")) {
      return pathname;
    }
  } catch {
    // Ignore URL parsing failures.
  }

  return `order-${Date.now()}.png`;
};

const uploadPrintifyImageFromUrl = async (
  token: string,
  imageUrl: string,
): Promise<string> => {
  const response = await fetchPrintify(
    `${PRINTIFY_BASE_URL}/uploads/images.json`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_name: resolveUploadFileName(imageUrl),
        url: imageUrl,
      }),
    },
  );

  await assertPrintifyOk(response, "Unable to upload image to Printify.");

  const payload = (await response.json()) as unknown;
  const parsed = printifyUploadResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new PrintifyRequestError(
      "unexpected_response",
      "Printify upload response was invalid.",
    );
  }

  return String(parsed.data.id);
};

const getPrintifyUploadUrl = async (
  token: string,
  uploadId: string,
): Promise<string | null> => {
  try {
    const response = await fetchPrintify(
      `${PRINTIFY_BASE_URL}/uploads/${uploadId}.json`,
      token,
      { method: "GET" },
    );

    if (!response.ok) {
      logger.warn(
        { status: response.status, upload_id: uploadId },
        "Unable to fetch Printify upload details",
      );
      return null;
    }

    const payload = (await response.json()) as unknown;
    const parsed = printifyUploadDetailsSchema.safeParse(payload);
    if (!parsed.success) {
      logger.warn(
        { upload_id: uploadId },
        "Printify upload details response was invalid",
      );
      return null;
    }

    const url =
      parsed.data.file_url ??
      parsed.data.url ??
      parsed.data.preview_url ??
      null;

    if (!url) {
      logger.warn(
        { upload_id: uploadId },
        "Printify upload details missing URL",
      );
    }

    return url;
  } catch (error) {
    logger.warn(
      {
        upload_id: uploadId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to fetch Printify upload URL",
    );
    return null;
  }
};


// ============================================================================
// Idempotency Key Builders
// ============================================================================

/**
 * Build idempotency key for Printify submission.
 * Pattern: {shop_id}:{order_line_id}:printify_submit
 */
export const buildPrintifySubmitIdempotencyKey = (
  shopId: string,
  orderLineId: string,
): string => `${shopId}:${orderLineId}:printify_submit`;

// ============================================================================
// Status Mapping
// ============================================================================

/**
 * Map Printify order status to internal fulfillment status.
 *
 * Per story requirements:
 * - pending, on-hold, sending-to-production, in-production => "pending"
 * - fulfilled, partially-fulfilled => "succeeded"
 * - canceled, has-issues, unfulfillable => "failed"
 */
export const mapPrintifyStatusToInternal = (
  printifyStatus: PrintifyOrderStatus,
): "pending" | "succeeded" | "failed" => {
  switch (printifyStatus) {
    case "pending":
    case "on-hold":
    case "sending-to-production":
    case "in-production":
      return "pending";

    case "fulfilled":
    case "partially-fulfilled":
      return "succeeded";

    case "canceled":
    case "has-issues":
    case "unfulfillable":
      return "failed";

    default: {
      // Exhaustive check - should never reach here
      const _exhaustive: never = printifyStatus;
      logger.warn(
        { status: _exhaustive },
        "Unknown Printify status, treating as pending",
      );
      return "pending";
    }
  }
};

/**
 * Map PrintifyRequestError code to PrintifySubmitErrorCode.
 */
const mapPrintifyErrorCode = (
  code: PrintifyErrorCode,
): PrintifySubmitErrorCode => {
  switch (code) {
    case "invalid_token":
      return "printify_invalid_token";
    case "rate_limited":
      return "printify_rate_limited";
    case "printify_not_configured":
      return "printify_not_configured";
    default:
      return "printify_api_error";
  }
};

/**
 * Determine if an error is retryable.
 */
const isRetryableError = (code: PrintifySubmitErrorCode): boolean => {
  switch (code) {
    case "printify_rate_limited":
    case "printify_api_error":
    case "asset_url_unavailable":
      return true;
    case "printify_not_configured":
    case "printify_invalid_token":
    case "printify_order_rejected":
    case "protected_customer_data_not_approved":
    case "shipping_address_incomplete":
    case "order_line_not_found":
    case "unknown_error":
      return false;
    default:
      return false;
  }
};

// ============================================================================
// Order Submission
// ============================================================================

/**
 * Submit an order to Printify for fulfillment.
 *
 * This function:
 * 1. Retrieves Printify integration credentials
 * 2. Builds the order payload with customer and product info
 * 3. Submits to Printify Orders API
 * 4. Returns order ID and number on success, error details on failure
 */
export async function submitOrderToPrintify(
  input: SubmitOrderInput,
): Promise<SubmitOrderResult> {
  const { shopId, orderId, orderLineId, assetUrl, idempotencyKey } = input;

  logger.info(
    {
      shop_id: shopId,
      order_id: orderId,
      order_line_id: orderLineId,
      idempotency_key: idempotencyKey,
    },
    "Submitting order to Printify",
  );

  try {
    // Get Printify integration
    const integration = await getPrintifyIntegrationWithToken(shopId);
    if (!integration) {
      logger.warn({ shop_id: shopId }, "Printify integration not configured");
      return {
        success: false,
        errorCode: "printify_not_configured",
        errorMessage: "Printify integration is not configured for this shop",
        retryable: false,
      };
    }

    const token = decryptPrintifyToken(integration.encryptedToken);

    // Build Printify order payload
    // Note: Using "external" mode to reference existing product with custom artwork
    const printAreaKey = input.printAreaPosition ?? "front";
    let resolvedAssetUrl = assetUrl;

    let orderUploadId: string | null = null;

    try {
      orderUploadId = await uploadPrintifyImageFromUrl(token, assetUrl);
    } catch (error) {
      logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to upload order artwork to Printify; falling back",
      );
    }

    if (orderUploadId) {
      const uploadUrl = await getPrintifyUploadUrl(token, orderUploadId);
      if (uploadUrl) {
        resolvedAssetUrl = uploadUrl;
        logger.info(
          { printify_upload_id: orderUploadId },
          "Using Printify upload URL for order artwork",
        );
      }
    } else if (input.printifyUploadId) {
      const uploadUrl = await getPrintifyUploadUrl(
        token,
        input.printifyUploadId,
      );
      if (uploadUrl) {
        resolvedAssetUrl = uploadUrl;
        logger.info(
          { printify_upload_id: input.printifyUploadId },
          "Using preview Printify upload URL for order artwork",
        );
      }
    }

    const printAreaImage = {
      src: resolvedAssetUrl,
      x: input.printAreaX ?? 0.5,
      y: input.printAreaY ?? 0.5,
      scale: input.printAreaScale ?? 1,
      angle: input.printAreaAngle ?? 0,
    };
    const orderPayload = {
      external_id: `${orderId}-${orderLineId}`,
      label: `Order ${orderId} - Line ${orderLineId}`,
      line_items: [
        {
          print_provider_id: input.printifyPrintProviderId,
          blueprint_id: input.printifyBlueprintId,
          variant_id: input.variantId,
          quantity: input.quantity,
            print_areas: {
              [printAreaKey]: [printAreaImage],
            },
        },
      ],
      shipping_method: input.shippingMethodId ?? 1,
      is_printify_express: false,
      send_shipping_notification: false, // We handle notifications
      address_to: {
        first_name: input.customer.firstName,
        last_name: input.customer.lastName,
        email: input.customer.email,
        phone: input.customer.phone ?? "",
        address1: input.customer.address.address1,
        address2: input.customer.address.address2 ?? "",
        city: input.customer.address.city,
        region: input.customer.address.region,
        zip: input.customer.address.zip,
        country: input.customer.address.country,
      },
    };

    // Debug logging
    logger.debug(
      {
        shop_id: shopId,
        printify_shop_id: integration.printifyShopId,
        printify_product_id: input.printifyProductId,
        variant_id: input.variantId,
        print_area_position: printAreaKey,
        shipping_method: input.shippingMethodId ?? 1,
        order_payload: orderPayload,
      },
      "Printify order submission payload",
    );

    // Submit to Printify
    const response = await fetchPrintify(
      `${PRINTIFY_BASE_URL}/shops/${integration.printifyShopId}/orders.json`,
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload),
      },
    );

    await assertPrintifyOk(response, "Failed to submit order to Printify");

    const responseData = await response.json();
    const parsed = printifyOrderResponseSchema.safeParse(responseData);

    if (!parsed.success) {
      logger.error(
        {
          shop_id: shopId,
          order_id: orderId,
          order_line_id: orderLineId,
          response: responseData,
          errors: parsed.error.flatten(),
        },
        "Invalid response from Printify order creation",
      );
      return {
        success: false,
        errorCode: "printify_api_error",
        errorMessage: "Invalid response format from Printify",
        retryable: true,
      };
    }

    const printifyOrder = parsed.data;

    logger.info(
      {
        shop_id: shopId,
        order_id: orderId,
        order_line_id: orderLineId,
        printify_order_id: printifyOrder.id,
        printify_order_number: printifyOrder.order_number,
      },
      "Order submitted to Printify successfully",
    );

    return {
      success: true,
      printifyOrderId: printifyOrder.id,
      printifyOrderNumber: printifyOrder.order_number,
    };
  } catch (error) {
    if (error instanceof PrintifyRequestError) {
      const errorCode = mapPrintifyErrorCode(error.code);
      const retryable = isRetryableError(errorCode);

      logger.error(
        {
          shop_id: shopId,
          order_id: orderId,
          order_line_id: orderLineId,
          error_code: errorCode,
          error_message: error.message,
          retryable,
        },
        "Printify order submission failed",
      );

      return {
        success: false,
        errorCode,
        errorMessage: error.message,
        retryable,
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      {
        shop_id: shopId,
        order_id: orderId,
        order_line_id: orderLineId,
        error: message,
      },
      "Unexpected error submitting order to Printify",
    );

    return {
      success: false,
      errorCode: "unknown_error",
      errorMessage: message,
      retryable: true,
    };
  }
}
