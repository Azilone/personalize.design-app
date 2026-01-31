import type { ActionFunctionArgs } from "react-router";
import { createHmac, timingSafeEqual } from "crypto";

import prisma from "../../../db.server";
import logger from "../../../lib/logger";
import { mapPrintifyStatusToInternal } from "../../../services/printify/order-submission.server";
import {
  cancelPrintifyOrder,
  canCancelPrintifyOrder,
} from "../../../services/printify/order-cancel.server";
import { getPrintifyOrderDetails } from "../../../services/printify/order-details.server";
import { checkAutoImportedOrder } from "../../../services/printify/auto-order-check.server";

type PrintifyWebhookPayload = {
  id?: string | number;
  type?: string | null;
  topic?: string | null;
  created_at?: string | null;
  shop_id?: string | number | null;
  data?: Record<string, unknown> | null;
  order?: Record<string, unknown> | null;
  order_id?: string | number | null;
  external_id?: string | null;
  status?: string | null;
  order_number?: number | string | null;
  shipments?: Array<Record<string, unknown>> | null;
};

const getSignatureHeader = (headers: Headers) => {
  return (
    headers.get("x-pfy-signature") ||
    headers.get("x-printify-signature") ||
    headers.get("x-signature") ||
    ""
  );
};

const verifySignature = (
  rawBody: string,
  signature: string,
  secret: string,
) => {
  const hmac = createHmac("sha256", secret);
  hmac.update(rawBody, "utf8");
  const digestHex = hmac.digest("hex");
  const digestBase64 = Buffer.from(digestHex, "hex").toString("base64");

  const candidates = [digestHex, digestBase64];
  return candidates.some((candidate) => {
    if (candidate.length !== signature.length) return false;
    return timingSafeEqual(Buffer.from(candidate), Buffer.from(signature));
  });
};

const parseExternalOrderLineId = (externalId: string | null | undefined) => {
  if (!externalId) return null;
  const lastDash = externalId.lastIndexOf("-");
  if (lastDash === -1) return null;
  return externalId.slice(lastDash + 1);
};

const shouldBlockAutoOrders =
  process.env.PRINTIFY_BLOCK_AUTO_ORDERS !== "false";

const resolvePayloadOrder = (payload: PrintifyWebhookPayload) => {
  if (payload.data && typeof payload.data === "object") return payload.data;
  if (payload.order && typeof payload.order === "object") return payload.order;
  return payload as Record<string, unknown>;
};

const asString = (value: unknown): string | null => {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
};

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeStatus = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
};

const resolveShipment = (order: Record<string, unknown>) => {
  const shipments = order.shipments;
  if (!Array.isArray(shipments) || shipments.length === 0) return null;
  const shipment = shipments[0] as Record<string, unknown>;
  return {
    trackingNumber: asString(
      shipment.tracking_number ?? shipment.trackingNumber,
    ),
    trackingUrl: asString(shipment.tracking_url ?? shipment.trackingUrl),
    carrier: asString(
      shipment.carrier ?? shipment.carrier_name ?? shipment.service,
    ),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const rawBody = await request.text();
  const signature = getSignatureHeader(request.headers);
  const secret = process.env.PRINTIFY_WEBHOOK_SECRET;

  if (secret) {
    if (!signature || !verifySignature(rawBody, signature, secret)) {
      logger.warn("Invalid Printify webhook signature");
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let payload: PrintifyWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as PrintifyWebhookPayload;
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "Invalid Printify webhook JSON",
    );
    return new Response("Invalid JSON", { status: 400 });
  }

  const eventType = payload.type ?? payload.topic ?? "unknown";
  const eventCreatedAt = payload.created_at
    ? new Date(payload.created_at)
    : new Date();

  const orderData = resolvePayloadOrder(payload);
  const printifyOrderId =
    asString(
      orderData.id ?? orderData.order_id ?? payload.order_id ?? payload.id,
    ) ?? null;
  const externalId =
    asString(orderData.external_id ?? payload.external_id) ?? null;
  const orderNumber =
    asNumber(orderData.order_number ?? payload.order_number) ?? null;
  const status = normalizeStatus(orderData.status ?? payload.status);
  const shipment = resolveShipment(orderData);

  const printifyShopId = asString(
    orderData.shop_id ?? payload.shop_id ?? payload.data?.shop_id,
  );

  let shopId: string | null = null;
  if (printifyShopId) {
    const integration = await prisma.shopPrintifyIntegration.findFirst({
      where: { printify_shop_id: printifyShopId },
      select: { shop_id: true },
    });
    shopId = integration?.shop_id ?? null;
  }

  let orderLineRecord = null;
  if (printifyOrderId) {
    orderLineRecord = await prisma.orderLineProcessing.findFirst({
      where: {
        printify_order_id: printifyOrderId,
      },
    });
  }

  if (!orderLineRecord) {
    const orderLineId = parseExternalOrderLineId(externalId);
    if (orderLineId) {
      orderLineRecord = await prisma.orderLineProcessing.findFirst({
        where: {
          order_line_id: orderLineId,
          ...(shopId ? { shop_id: shopId } : {}),
        },
      });
    }
  }

  if (!orderLineRecord) {
    if (
      eventType === "order:created" &&
      shouldBlockAutoOrders &&
      shopId &&
      printifyOrderId
    ) {
      try {
        const orderDetails = await getPrintifyOrderDetails(
          shopId,
          printifyOrderId,
        );

        const checkResult = await checkAutoImportedOrder(shopId, orderDetails);

        switch (checkResult.action) {
          case "skip": {
            logger.info(
              {
                shop_id: shopId,
                printify_shop_id: printifyShopId,
                printify_order_id: printifyOrderId,
                external_id: orderDetails.externalId,
                event_type: eventType,
                reason: checkResult.reason,
              },
              "Printify order does not include personalized products; skipping cancel",
            );
            break;
          }

          case "cancel": {
            // Check if order can be cancelled based on status
            if (!canCancelPrintifyOrder(orderDetails.status)) {
              logger.warn(
                {
                  shop_id: shopId,
                  printify_shop_id: printifyShopId,
                  printify_order_id: printifyOrderId,
                  external_id: orderDetails.externalId,
                  status: orderDetails.status,
                  event_type: eventType,
                },
                "Cannot cancel auto-imported Printify order - order is already in production",
              );
            } else {
              await cancelPrintifyOrder({
                shopId,
                printifyOrderId,
              });

              logger.warn(
                {
                  shop_id: shopId,
                  printify_shop_id: printifyShopId,
                  printify_order_id: printifyOrderId,
                  external_id: orderDetails.externalId,
                  event_type: eventType,
                },
                "Cancelled auto-imported Printify order for personalized product",
              );
            }
            break;
          }

          case "warn": {
            logger.warn(
              {
                shop_id: shopId,
                printify_shop_id: printifyShopId,
                printify_order_id: printifyOrderId,
                external_id: orderDetails.externalId,
                event_type: eventType,
                reason: checkResult.reason,
              },
              "Printify order matched expected format but no record found",
            );
            break;
          }
        }
      } catch (error) {
        logger.error(
          {
            shop_id: shopId,
            printify_shop_id: printifyShopId,
            printify_order_id: printifyOrderId,
            external_id: externalId,
            event_type: eventType,
            error: error instanceof Error ? error.message : String(error),
          },
          "Failed to inspect or cancel auto-imported Printify order",
        );
      }
    }

    logger.warn(
      {
        printify_order_id: printifyOrderId,
        external_id: externalId,
        event_type: eventType,
      },
      "Printify webhook received for unknown order",
    );
    return new Response("OK", { status: 200 });
  }

  const updateData: Record<string, unknown> = {
    printify_last_event: eventType,
    printify_last_event_at: eventCreatedAt,
  };

  if (printifyOrderId) {
    updateData.printify_order_id = printifyOrderId;
  }

  if (orderNumber !== null) {
    updateData.printify_order_number = orderNumber;
  }

  if (status) {
    updateData.printify_order_status = status;
    updateData.printify_order_status_updated_at = eventCreatedAt;

    const internalStatus = mapPrintifyStatusToInternal(
      status as
        | "pending"
        | "on-hold"
        | "sending-to-production"
        | "in-production"
        | "canceled"
        | "fulfilled"
        | "partially-fulfilled"
        | "has-issues"
        | "unfulfillable",
    );
    if (internalStatus === "failed") {
      updateData.printify_submit_status = "failed";
    }
  }

  if (shipment) {
    if (shipment.trackingNumber) {
      updateData.printify_tracking_number = shipment.trackingNumber;
    }
    if (shipment.trackingUrl) {
      updateData.printify_tracking_url = shipment.trackingUrl;
    }
    if (shipment.carrier) {
      updateData.printify_tracking_carrier = shipment.carrier;
    }

    if (eventType === "order:shipment:created") {
      updateData.printify_shipped_at = eventCreatedAt;
    }
    if (eventType === "order:shipment:delivered") {
      updateData.printify_delivered_at = eventCreatedAt;
    }
  }

  await prisma.orderLineProcessing.update({
    where: { id: orderLineRecord.id },
    data: updateData,
  });

  logger.info(
    {
      order_line_id: orderLineRecord.order_line_id,
      printify_order_id: printifyOrderId,
      event_type: eventType,
      status,
    },
    "Printify webhook processed",
  );

  return new Response("OK", { status: 200 });
};
