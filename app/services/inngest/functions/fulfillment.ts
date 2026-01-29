import { NonRetriableError } from "inngest";
import { z } from "zod";
import prisma from "../../../db.server";
import { inngest } from "../client.server";
import logger from "../../../lib/logger";
import { captureEvent } from "../../../lib/posthog.server";
import {
  trackBillableEventCreated,
  trackBillableEventConfirmed,
  trackBillableEventWaived,
} from "../../posthog/events";
import { getOfflineShopifyAdmin } from "../../shopify/admin.server";

const ORDER_FEE_MILLS = 250; // $0.25 in mills

const processOrderLinePayloadSchema = z.object({
  shop_id: z.string().min(1),
  order_id: z.string().min(1),
  order_line_id: z.string().min(1),
  personalization_id: z.string().min(1),
  idempotency_key: z.string().min(1),
  billable_event_idempotency_key: z.string().min(1),
  plan_status: z.string(),
  should_charge_order_fee: z.boolean(),
});

/**
 * Create Shopify Usage Charge for order fee
 */
const createShopifyOrderFeeCharge = async (input: {
  shopId: string;
  orderLineId: string;
  idempotencyKey: string;
}): Promise<{ success: boolean; error?: string }> => {
  try {
    const admin = await getOfflineShopifyAdmin(input.shopId);

    // Get subscription line item ID
    const plan = await prisma.shopPlan.findUnique({
      where: { shop_id: input.shopId },
      select: { shopify_subscription_id: true },
    });

    if (!plan?.shopify_subscription_id) {
      return {
        success: false,
        error: "Missing Shopify subscription ID for usage charge",
      };
    }

    // Query subscription to get usage line item ID
    const response = await admin.graphql(
      `#graphql
        query subscriptionLineItem($id: ID!) {
          node(id: $id) {
            ... on AppSubscription {
              id
              lineItems {
                id
                plan {
                  pricingDetails {
                    __typename
                    ... on AppUsagePricing {
                      cappedAmount {
                        amount
                        currencyCode
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `,
      { variables: { id: plan.shopify_subscription_id } },
    );

    const responseJson = await response.json();
    const subscription = responseJson?.data?.node;
    const lineItems = subscription?.lineItems ?? [];
    const usageLineItem = lineItems.find(
      (item: { plan?: { pricingDetails?: { __typename?: string } } }) =>
        item.plan?.pricingDetails?.__typename === "AppUsagePricing",
    );

    if (!usageLineItem?.id) {
      return {
        success: false,
        error: "Usage line item not found for subscription",
      };
    }

    // Create usage record
    const usageResponse = await admin.graphql(
      `#graphql
        mutation createUsageRecord(
          $subscriptionLineItemId: ID!
          $price: MoneyInput!
          $description: String!
          $idempotencyKey: String!
        ) {
          appUsageRecordCreate(
            subscriptionLineItemId: $subscriptionLineItemId
            price: $price
            description: $description
            idempotencyKey: $idempotencyKey
          ) {
            userErrors {
              field
              message
            }
            appUsageRecord {
              id
            }
          }
        }
      `,
      {
        variables: {
          subscriptionLineItemId: usageLineItem.id,
          price: {
            amount: 0.25,
            currencyCode: "USD",
          },
          description: `Order fee for line ${input.orderLineId}`,
          idempotencyKey: input.idempotencyKey,
        },
      },
    );

    const usageJson = await usageResponse.json();
    const payload = usageJson?.data?.appUsageRecordCreate;
    const userErrors = payload?.userErrors ?? [];

    if (userErrors.length > 0) {
      const message = userErrors[0]?.message ?? "Unable to create usage charge";
      return { success: false, error: message };
    }

    const usageRecordId = payload?.appUsageRecord?.id;

    if (!usageRecordId) {
      return { success: false, error: "Usage charge response was incomplete" };
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
};

/**
 * Process order line fulfillment workflow
 * Handles billing for order fees and prepares for print-ready asset generation
 */
export const processOrderLine = inngest.createFunction(
  {
    id: "fulfillment_process_order_line",
    idempotency: "event.data.idempotency_key",
    concurrency: {
      key: "event.data.shop_id",
      limit: 5,
    },
    retries: 3,
  },
  { event: "fulfillment/process.order.line" },
  async ({ event, step }) => {
    const parsed = processOrderLinePayloadSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.warn(
        { errors: parsed.error.flatten().fieldErrors },
        "Invalid fulfillment process order line payload",
      );
      throw new NonRetriableError("Invalid fulfillment payload");
    }

    const payload = parsed.data;

    logger.info(
      {
        shop_id: payload.shop_id,
        order_id: payload.order_id,
        order_line_id: payload.order_line_id,
        personalization_id: payload.personalization_id,
        plan_status: payload.plan_status,
        should_charge_order_fee: payload.should_charge_order_fee,
      },
      "Starting order line fulfillment workflow",
    );

    // Track event
    captureEvent("fulfillment.order_line.started", {
      shop_id: payload.shop_id,
      order_id: payload.order_id,
      order_line_id: payload.order_line_id,
      personalization_id: payload.personalization_id,
      plan_status: payload.plan_status,
    });

    try {
      // Update processing record status to processing
      await step.run("mark-processing", async () => {
        await prisma.orderLineProcessing.updateMany({
          where: {
            shop_id: payload.shop_id,
            order_line_id: payload.order_line_id,
          },
          data: {
            status: "processing",
          },
        });
      });

      // Handle billing based on plan status
      if (payload.should_charge_order_fee) {
        // Standard plan: Charge $0.25 order fee
        await step.run("charge-order-fee", async () => {
          // Check if billable event already exists
          const existingEvent = await prisma.billableEvent.findUnique({
            where: {
              shop_id_idempotency_key: {
                shop_id: payload.shop_id,
                idempotency_key: payload.billable_event_idempotency_key,
              },
            },
          });

          if (!existingEvent) {
            // Create billable event
            const event = await prisma.billableEvent.create({
              data: {
                shop_id: payload.shop_id,
                event_type: "order_fee",
                status: "pending",
                amount_mills: ORDER_FEE_MILLS,
                currency_code: "USD",
                idempotency_key: payload.billable_event_idempotency_key,
                description: `Order fee for line ${payload.order_line_id}`,
                source_id: payload.order_line_id,
              },
            });

            trackBillableEventCreated({
              shopId: payload.shop_id,
              billableEventId: event.id,
              idempotencyKey: payload.billable_event_idempotency_key,
              eventType: "order_fee",
              amountMills: ORDER_FEE_MILLS,
              sourceId: payload.order_line_id,
            });
          }

          // Create Shopify Usage Charge
          const chargeResult = await createShopifyOrderFeeCharge({
            shopId: payload.shop_id,
            orderLineId: payload.order_line_id,
            idempotencyKey: payload.billable_event_idempotency_key,
          });

          if (chargeResult.success) {
            // Update billable event to confirmed
            await prisma.billableEvent.updateMany({
              where: {
                shop_id: payload.shop_id,
                idempotency_key: payload.billable_event_idempotency_key,
              },
              data: {
                status: "confirmed",
              },
            });

            trackBillableEventConfirmed({
              shopId: payload.shop_id,
              billableEventId: existingEvent?.id ?? "",
              idempotencyKey: payload.billable_event_idempotency_key,
              eventType: "order_fee",
              amountMills: ORDER_FEE_MILLS,
            });

            logger.info(
              {
                shop_id: payload.shop_id,
                order_line_id: payload.order_line_id,
              },
              "Order fee charged successfully",
            );
          } else {
            // Update billable event to failed
            await prisma.billableEvent.updateMany({
              where: {
                shop_id: payload.shop_id,
                idempotency_key: payload.billable_event_idempotency_key,
              },
              data: {
                status: "failed",
                error_message: chargeResult.error,
              },
            });

            logger.error(
              {
                shop_id: payload.shop_id,
                order_line_id: payload.order_line_id,
                error: chargeResult.error,
              },
              "Order fee charge failed",
            );

            // Throw to trigger retry
            throw new Error(chargeResult.error ?? "Order fee charge failed");
          }
        });
      } else {
        // Early Access or other plans: Fee is waived
        await step.run("waive-order-fee", async () => {
          // Check if billable event already exists
          const existingEvent = await prisma.billableEvent.findUnique({
            where: {
              shop_id_idempotency_key: {
                shop_id: payload.shop_id,
                idempotency_key: payload.billable_event_idempotency_key,
              },
            },
          });

          if (!existingEvent) {
            // Create waived billable event for audit trail
            const event = await prisma.billableEvent.create({
              data: {
                shop_id: payload.shop_id,
                event_type: "order_fee",
                status: "waived",
                amount_mills: ORDER_FEE_MILLS,
                currency_code: "USD",
                idempotency_key: payload.billable_event_idempotency_key,
                description: `Order fee waived for line ${payload.order_line_id} (plan: ${payload.plan_status})`,
                source_id: payload.order_line_id,
              },
            });

            trackBillableEventWaived({
              shopId: payload.shop_id,
              billableEventId: event.id,
              idempotencyKey: payload.billable_event_idempotency_key,
              errorMessage: `Waived due to plan status: ${payload.plan_status}`,
            });

            logger.info(
              {
                shop_id: payload.shop_id,
                order_line_id: payload.order_line_id,
                plan_status: payload.plan_status,
              },
              "Order fee waived",
            );
          }
        });
      }

      // Update processing record to succeeded
      await step.run("mark-succeeded", async () => {
        await prisma.orderLineProcessing.updateMany({
          where: {
            shop_id: payload.shop_id,
            order_line_id: payload.order_line_id,
          },
          data: {
            status: "succeeded",
          },
        });
      });

      captureEvent("fulfillment.order_line.completed", {
        shop_id: payload.shop_id,
        order_id: payload.order_id,
        order_line_id: payload.order_line_id,
        personalization_id: payload.personalization_id,
        plan_status: payload.plan_status,
        charged: payload.should_charge_order_fee,
      });

      logger.info(
        {
          shop_id: payload.shop_id,
          order_id: payload.order_id,
          order_line_id: payload.order_line_id,
          personalization_id: payload.personalization_id,
        },
        "Order line fulfillment workflow completed",
      );

      return {
        success: true,
        shop_id: payload.shop_id,
        order_id: payload.order_id,
        order_line_id: payload.order_line_id,
        personalization_id: payload.personalization_id,
        charged: payload.should_charge_order_fee,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Update processing record to failed
      await step.run("mark-failed", async () => {
        await prisma.orderLineProcessing.updateMany({
          where: {
            shop_id: payload.shop_id,
            order_line_id: payload.order_line_id,
          },
          data: {
            status: "failed",
          },
        });
      });

      captureEvent("fulfillment.order_line.failed", {
        shop_id: payload.shop_id,
        order_id: payload.order_id,
        order_line_id: payload.order_line_id,
        personalization_id: payload.personalization_id,
        error: message,
      });

      logger.error(
        {
          shop_id: payload.shop_id,
          order_id: payload.order_id,
          order_line_id: payload.order_line_id,
          error: message,
        },
        "Order line fulfillment workflow failed",
      );

      throw error;
    }
  },
);

export const fulfillmentFunctions = [processOrderLine];
