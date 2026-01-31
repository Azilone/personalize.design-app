import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";

import { authenticate } from "../../../../../../shopify.server";
import { getShopIdFromSession } from "../../../../../../lib/tenancy";
import prisma from "../../../../../../db.server";
import { PRINTIFY_RECOVERY_GUIDANCE } from "../../../../../../schemas/fulfillment";
import type { PrintifySubmitErrorCode } from "../../../../../../schemas/fulfillment";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);
  const orderLineId = params.orderLineId
    ? decodeURIComponent(params.orderLineId)
    : null;

  if (!orderLineId) {
    return data(
      {
        error: {
          code: "invalid_request",
          message: "orderLineId is required",
        },
      },
      { status: 400 },
    );
  }

  if (!shopId) {
    return data(
      {
        error: {
          code: "unauthorized",
          message: "Authentication required",
        },
      },
      { status: 401 },
    );
  }

  try {
    const orderLine = await prisma.orderLineProcessing.findFirst({
      where: {
        shop_id: shopId,
        order_line_id: orderLineId,
      },
      select: {
        id: true,
        shop_id: true,
        order_id: true,
        order_line_id: true,
        status: true,
        personalization_id: true,
        final_asset_storage_key: true,
        final_asset_bucket: true,
        final_asset_checksum: true,
        final_asset_persisted_at: true,
        final_asset_error_code: true,
        final_asset_error_message: true,
        // Story 7.3: Printify fulfillment tracking fields
        printify_order_id: true,
        printify_order_number: true,
        printify_submit_status: true,
        printify_submitted_at: true,
        printify_error_code: true,
        printify_error_message: true,
        printify_order_status: true,
        printify_order_status_updated_at: true,
        printify_last_event: true,
        printify_last_event_at: true,
        printify_tracking_number: true,
        printify_tracking_url: true,
        printify_tracking_carrier: true,
        printify_shipped_at: true,
        printify_delivered_at: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!orderLine) {
      return data(
        {
          error: {
            code: "not_found",
            message: "Order line processing record not found",
          },
        },
        { status: 404 },
      );
    }

    // Build recovery guidance if there's a Printify error (AC: 4)
    const recoveryGuidance =
      orderLine.printify_error_code &&
      PRINTIFY_RECOVERY_GUIDANCE[
        orderLine.printify_error_code as PrintifySubmitErrorCode
      ]
        ? PRINTIFY_RECOVERY_GUIDANCE[
            orderLine.printify_error_code as PrintifySubmitErrorCode
          ]
        : null;

    return data({
      success: true,
      order_line: {
        id: orderLine.id,
        shop_id: orderLine.shop_id,
        order_id: orderLine.order_id,
        order_line_id: orderLine.order_line_id,
        status: orderLine.status,
        personalization_id: orderLine.personalization_id,
        asset: orderLine.final_asset_storage_key
          ? {
              storage_key: orderLine.final_asset_storage_key,
              bucket: orderLine.final_asset_bucket,
              checksum: orderLine.final_asset_checksum,
              persisted_at: orderLine.final_asset_persisted_at?.toISOString(),
            }
          : null,
        error: orderLine.final_asset_error_code
          ? {
              code: orderLine.final_asset_error_code,
              message: orderLine.final_asset_error_message,
            }
          : null,
        // Story 7.3: Printify fulfillment status (AC: 4)
        printify: {
          submit_status: orderLine.printify_submit_status,
          order_id: orderLine.printify_order_id,
          order_number: orderLine.printify_order_number,
          submitted_at: orderLine.printify_submitted_at?.toISOString() ?? null,
          order_status: orderLine.printify_order_status,
          order_status_updated_at:
            orderLine.printify_order_status_updated_at?.toISOString() ?? null,
          last_event: orderLine.printify_last_event ?? null,
          last_event_at:
            orderLine.printify_last_event_at?.toISOString() ?? null,
          tracking: orderLine.printify_tracking_number
            ? {
                number: orderLine.printify_tracking_number,
                url: orderLine.printify_tracking_url,
                carrier: orderLine.printify_tracking_carrier,
              }
            : null,
          shipped_at: orderLine.printify_shipped_at?.toISOString() ?? null,
          delivered_at: orderLine.printify_delivered_at?.toISOString() ?? null,
          error: orderLine.printify_error_code
            ? {
                code: orderLine.printify_error_code,
                message: orderLine.printify_error_message,
              }
            : null,
          recovery_guidance: recoveryGuidance,
        },
        created_at: orderLine.created_at.toISOString(),
        updated_at: orderLine.updated_at.toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return data(
      {
        error: {
          code: "internal_error",
          message: "An unexpected error occurred",
          details: message,
        },
      },
      { status: 500 },
    );
  }
};

export const headers: HeadersFunction = () => ({
  "Cache-Control": "no-store",
});
