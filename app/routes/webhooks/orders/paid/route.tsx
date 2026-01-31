import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../../../../shopify.server";
import prisma from "../../../../db.server";
import { OrderPaidPayloadSchema } from "../../../../schemas/webhooks";
import { inngest } from "../../../../services/inngest/client.server";
import logger from "../../../../lib/logger";
import {
  trackWebhookReceived,
  trackWebhookProcessed,
  trackWebhookDuplicate,
} from "../../../../services/posthog/events";

const ORDER_FEE_MILLS = 250; // $0.25 in mills

/**
 * Extract personalization_id from line item properties
 */
const extractPersonalizationId = (lineItem: {
  id: string | number;
  properties?: Array<{ name: string; value: string }>;
}): string | null => {
  const properties = lineItem.properties ?? [];
  const personalizationProperty = properties.find(
    (p) => p.name === "personalization_id",
  );
  return personalizationProperty?.value ?? null;
};

/**
 * Build idempotency key for order line processing
 */
const buildProcessingIdempotencyKey = (shopId: string, orderLineId: string) =>
  `${shopId}:${orderLineId}:fulfillment`;

/**
 * Build idempotency key for order fee billing
 */
const buildOrderFeeIdempotencyKey = (shopId: string, orderLineId: string) =>
  `${shopId}:${orderLineId}:order_fee`;

/**
 * Create or update order line processing record
 * Uses upsert for idempotency - handles concurrent webhook deliveries
 */
const createProcessingRecord = async (input: {
  shopId: string;
  orderId: string;
  orderLineId: string;
  personalizationId: string;
  idempotencyKey: string;
}) => {
  try {
    const record = await prisma.orderLineProcessing.upsert({
      where: { idempotency_key: input.idempotencyKey },
      create: {
        shop_id: input.shopId,
        order_id: input.orderId,
        order_line_id: input.orderLineId,
        idempotency_key: input.idempotencyKey,
        status: "pending",
        personalization_id: input.personalizationId,
      },
      update: {}, // No update on conflict - keeps first record
    });
    return { created: true, record };
  } catch (error) {
    // Handle unique constraint violation (P2002) - record already exists
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      const existing = await prisma.orderLineProcessing.findUnique({
        where: { idempotency_key: input.idempotencyKey },
      });
      return { created: false, record: existing };
    }
    throw error;
  }
};

/**
 * Create billable event for order fee
 */
const createOrderFeeBillableEvent = async (input: {
  shopId: string;
  orderLineId: string;
  idempotencyKey: string;
  status: "pending" | "waived";
  description: string;
}) => {
  try {
    const event = await prisma.billableEvent.create({
      data: {
        shop_id: input.shopId,
        event_type: "order_fee",
        status: input.status,
        amount_mills: ORDER_FEE_MILLS,
        currency_code: "USD",
        idempotency_key: input.idempotencyKey,
        description: input.description,
        source_id: input.orderLineId,
      },
    });
    return { created: true, event };
  } catch (error) {
    // Handle unique constraint violation (P2002) - event already exists
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      const existing = await prisma.billableEvent.findUnique({
        where: {
          shop_id_idempotency_key: {
            shop_id: input.shopId,
            idempotency_key: input.idempotencyKey,
          },
        },
      });
      return { created: false, event: existing };
    }
    throw error;
  }
};

/**
 * Get shop plan status
 */
const getShopPlanStatus = async (shopId: string) => {
  const plan = await prisma.shopPlan.findUnique({
    where: { shop_id: shopId },
    select: { plan_status: true },
  });
  return plan?.plan_status ?? "none";
};

/**
 * Determine if order fee should be charged based on plan status
 */
const shouldChargeOrderFee = (planStatus: string): boolean => {
  return planStatus === "standard";
};

/**
 * Determine if order fee should be waived based on plan status
 */
const shouldWaiveOrderFee = (planStatus: string): boolean => {
  return [
    "early_access",
    "standard_pending",
    "early_access_pending",
    "none",
  ].includes(planStatus);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const webhookId = request.headers.get("X-Shopify-Webhook-Id") ?? "unknown";
  const correlationId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  try {
    // authenticate.webhook() automatically verifies HMAC using raw request body
    const { shop, topic, payload } = await authenticate.webhook(request);

    logger.info(
      {
        shop_id: shop,
        topic,
        webhook_id: webhookId,
        correlation_id: correlationId,
      },
      "Webhook received",
    );

    // Track webhook received
    trackWebhookReceived({
      shopId: shop,
      webhookId,
      topic,
      correlationId,
    });

    // Validate payload
    const parseResult = OrderPaidPayloadSchema.safeParse(payload);
    if (!parseResult.success) {
      logger.error(
        {
          shop_id: shop,
          webhook_id: webhookId,
          correlation_id: correlationId,
          error: parseResult.error.message,
        },
        "Invalid webhook payload",
      );
      // Return 200 to prevent Shopify retries for unrecoverable errors
      return new Response(
        JSON.stringify({
          error: {
            code: "WEBHOOK_INVALID_PAYLOAD",
            message: "Invalid webhook payload",
            details: parseResult.error.flatten().fieldErrors,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const order = parseResult.data;
    const orderId = String(order.id);
    const shippingLines = order.shipping_lines ?? [];

    // Check for duplicate webhook by webhook ID (network layer idempotency)
    const existingWebhook = await prisma.orderLineProcessing.findFirst({
      where: {
        idempotency_key: `${shop}:${webhookId}:network_check`,
      },
    });

    if (existingWebhook) {
      logger.info(
        {
          shop_id: shop,
          webhook_id: webhookId,
          correlation_id: correlationId,
        },
        "Duplicate webhook ID detected at network layer",
      );

      trackWebhookDuplicate({
        shopId: shop,
        webhookId,
        orderId,
        orderLineId: "network_check",
        correlationId,
      });

      return new Response(
        JSON.stringify({
          processed: true,
          duplicate: true,
          reason: "Webhook ID already processed",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Find lines with personalization_id
    const eligibleLines: Array<{
      lineItem: {
        id: string | number;
        product_id?: string | number;
        variant_id?: string | number;
        quantity: number;
        properties?: Array<{ name: string; value: string }>;
      };
      personalizationId: string;
    }> = [];

    for (const lineItem of order.line_items) {
      const personalizationId = extractPersonalizationId(lineItem);
      if (personalizationId) {
        eligibleLines.push({ lineItem, personalizationId });
      }
    }

    const hasPersonalization = eligibleLines.length > 0;

    logger.info(
      {
        shop_id: shop,
        order_id: orderId,
        webhook_id: webhookId,
        correlation_id: correlationId,
        total_lines: order.line_items.length,
        eligible_lines: eligibleLines.length,
        has_personalization: hasPersonalization,
      },
      "Order lines analyzed",
    );

    // If no eligible lines, return early
    if (!hasPersonalization) {
      trackWebhookProcessed({
        shopId: shop,
        webhookId,
        orderId,
        correlationId,
        hasPersonalization: false,
        eligibleLinesCount: 0,
        processingStatus: "no_personalization",
      });

      return new Response(
        JSON.stringify({
          processed: true,
          order_id: orderId,
          personalization_found: false,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Get shop plan status for billing decisions
    const planStatus = await getShopPlanStatus(shop);

    // Process each eligible line
    const processingResults: Array<{
      orderLineId: string;
      personalizationId: string;
      processingCreated: boolean;
      billableEventCreated: boolean;
      billableEventStatus: string;
    }> = [];

    for (const { lineItem, personalizationId } of eligibleLines) {
      const orderLineId = String(lineItem.id);
      const processingIdempotencyKey = buildProcessingIdempotencyKey(
        shop,
        orderLineId,
      );
      const orderFeeIdempotencyKey = buildOrderFeeIdempotencyKey(
        shop,
        orderLineId,
      );

      try {
        // Create processing record (idempotent)
        const { created: processingCreated, record: processingRecord } =
          await createProcessingRecord({
            shopId: shop,
            orderId: orderId,
            orderLineId: orderLineId,
            personalizationId: personalizationId,
            idempotencyKey: processingIdempotencyKey,
          });

        // If record already existed, this is a duplicate webhook delivery
        if (!processingCreated) {
          logger.info(
            {
              shop_id: shop,
              order_id: orderId,
              order_line_id: orderLineId,
              webhook_id: webhookId,
              correlation_id: correlationId,
            },
            "Duplicate order line processing detected",
          );

          trackWebhookDuplicate({
            shopId: shop,
            webhookId,
            orderId,
            orderLineId,
            correlationId,
          });

          processingResults.push({
            orderLineId,
            personalizationId,
            processingCreated: false,
            billableEventCreated: false,
            billableEventStatus: "duplicate",
          });

          continue;
        }

        // Determine billing status based on plan
        let billableEventStatus: "pending" | "waived";
        let billableEventDescription: string;

        if (shouldChargeOrderFee(planStatus)) {
          billableEventStatus = "pending";
          billableEventDescription = `Order fee for line ${orderLineId}`;
        } else if (shouldWaiveOrderFee(planStatus)) {
          billableEventStatus = "waived";
          billableEventDescription = `Order fee waived for line ${orderLineId} (plan: ${planStatus})`;

          if (planStatus === "none") {
            logger.warn(
              {
                shop_id: shop,
                order_id: orderId,
                order_line_id: orderLineId,
                correlation_id: correlationId,
              },
              "Order fee waived - shop has no subscription plan",
            );
          }
        } else {
          // Fallback to waived for unknown plan statuses
          billableEventStatus = "waived";
          billableEventDescription = `Order fee waived for line ${orderLineId} (unknown plan: ${planStatus})`;
        }

        // Create billable event (idempotent)
        const { created: billableEventCreated } =
          await createOrderFeeBillableEvent({
            shopId: shop,
            orderLineId: orderLineId,
            idempotencyKey: orderFeeIdempotencyKey,
            status: billableEventStatus,
            description: billableEventDescription,
          });

        // Trigger Inngest workflow for fulfillment
        // Get line item details for Printify submission (Story 7.3)
        const productId = lineItem.product_id
          ? String(lineItem.product_id)
          : undefined;
        const variantId = lineItem.variant_id
          ? Number(lineItem.variant_id)
          : undefined;
        const quantity = lineItem.quantity ?? 1;

        // Build shipping address from order (Story 7.3)
        const shippingAddress = order.shipping_address
          ? {
              first_name: order.shipping_address.first_name ?? null,
              last_name: order.shipping_address.last_name ?? null,
              address1: order.shipping_address.address1 ?? null,
              address2: order.shipping_address.address2 ?? null,
              city: order.shipping_address.city ?? null,
              region:
                order.shipping_address.province_code ??
                order.shipping_address.province ??
                null,
              zip: order.shipping_address.zip ?? null,
              country_code: order.shipping_address.country_code ?? null,
              phone: order.shipping_address.phone ?? null,
              email: order.email ?? order.customer?.email ?? null,
            }
          : undefined;

        await inngest.send({
          name: "fulfillment/process.order.line",
          data: {
            shop_id: shop,
            order_id: orderId,
            order_line_id: orderLineId,
            personalization_id: personalizationId,
            idempotency_key: processingIdempotencyKey,
            billable_event_idempotency_key: orderFeeIdempotencyKey,
            plan_status: planStatus,
            should_charge_order_fee: billableEventStatus === "pending",
            // Story 7.3: Include product/shipping info for Printify
            product_id: productId,
            variant_id: variantId,
            quantity,
            shipping_address: shippingAddress,
            shipping_lines: shippingLines.map((line) => ({
              title: line.title,
              code: line.code ?? null,
              price: line.price ?? null,
            })),
          },
        });

        processingResults.push({
          orderLineId,
          personalizationId,
          processingCreated: true,
          billableEventCreated,
          billableEventStatus,
        });

        logger.info(
          {
            shop_id: shop,
            order_id: orderId,
            order_line_id: orderLineId,
            correlation_id: correlationId,
            processing_created: processingCreated,
            billable_event_status: billableEventStatus,
          },
          "Order line processed successfully",
        );
      } catch (error) {
        logger.error(
          {
            shop_id: shop,
            order_id: orderId,
            order_line_id: orderLineId,
            webhook_id: webhookId,
            correlation_id: correlationId,
            error: error instanceof Error ? error.message : String(error),
          },
          "Error processing order line",
        );

        // Continue processing other lines - don't fail the entire webhook
        processingResults.push({
          orderLineId,
          personalizationId,
          processingCreated: false,
          billableEventCreated: false,
          billableEventStatus: "error",
        });
      }
    }

    // Track webhook processed
    const successCount = processingResults.filter(
      (r) => r.processingCreated,
    ).length;
    const duplicateCount = processingResults.filter(
      (r) => r.billableEventStatus === "duplicate",
    ).length;
    const errorCount = processingResults.filter(
      (r) => r.billableEventStatus === "error",
    ).length;

    trackWebhookProcessed({
      shopId: shop,
      webhookId,
      orderId,
      correlationId,
      hasPersonalization: true,
      eligibleLinesCount: eligibleLines.length,
      processingStatus:
        errorCount > 0
          ? "partial_failure"
          : successCount > 0
            ? "success"
            : "duplicate",
      successCount,
      duplicateCount,
      errorCount,
    });

    return new Response(
      JSON.stringify({
        processed: true,
        order_id: orderId,
        personalization_found: true,
        lines_processed: processingResults.length,
        lines_succeeded: successCount,
        lines_duplicate: duplicateCount,
        lines_failed: errorCount,
        results: processingResults,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    logger.error(
      {
        webhook_id: webhookId,
        correlation_id: correlationId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Unexpected error processing webhook",
    );

    // Return 500 only for unexpected system failures
    // This allows Shopify to retry
    return new Response(
      JSON.stringify({
        error: {
          code: "INTERNAL_ERROR",
          message: "Unexpected error processing webhook",
        },
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
