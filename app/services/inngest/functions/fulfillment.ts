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
import {
  AssetResolutionError,
  generateAssetSignedUrl,
  type ResolvedAsset,
  RECOVERY_GUIDANCE,
} from "../../fulfillment/asset-resolution.server";
import { ensurePrintReadyAsset } from "../../fulfillment/print-ready-asset.server";
import {
  buildPrintifySubmitIdempotencyKey,
  submitOrderToPrintify,
  type SubmitOrderInput,
} from "../../printify/order-submission.server";
import { getPrintifyIntegrationWithToken } from "../../printify/integration.server";
import { getPrintifyProductDetails } from "../../printify/product-details.server";
import { resolvePrintifyVariantId } from "../../fulfillment/variant-resolution.server";
import {
  selectPrintifyShippingMethod,
  type PrintifyShippingAddress,
} from "../../printify/shipping.server";
import { getPrintifyVariantPrintArea } from "../../printify/print-area.server";
import { buildPrintAreaTransform } from "../../printify/print-area-transform.server";
import { PRINTIFY_RECOVERY_GUIDANCE } from "../../../schemas/fulfillment";
import type { PrintifySubmitErrorCode } from "../../../schemas/fulfillment";
import { calculateFalImageSize } from "../../fal/image-size.server";
import { getTemplate } from "../../templates/templates.server";

const ORDER_FEE_MILLS = 250; // $0.25 in mills

// Shipping address schema for Printify submission (Story 7.3)
const fulfillmentShippingAddressSchema = z.object({
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  address1: z.string().nullable(),
  address2: z.string().nullable(),
  city: z.string().nullable(),
  region: z.string().nullable(),
  zip: z.string().nullable(),
  country_code: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
});

const fulfillmentShippingLineSchema = z.object({
  title: z.string(),
  code: z.string().nullable().optional(),
  price: z.string().nullable().optional(),
});

const processOrderLinePayloadSchema = z.object({
  shop_id: z.string().min(1),
  order_id: z.string().min(1),
  order_line_id: z.string().min(1),
  personalization_id: z.string().min(1),
  idempotency_key: z.string().min(1),
  billable_event_idempotency_key: z.string().min(1),
  plan_status: z.string(),
  should_charge_order_fee: z.boolean(),
  // Story 7.3: Product/shipping info for Printify submission
  product_id: z.string().optional(),
  variant_id: z.number().optional(),
  quantity: z.number().optional(),
  shipping_address: fulfillmentShippingAddressSchema.optional(),
  shipping_lines: z.array(fulfillmentShippingLineSchema).optional(),
});

const normalizeField = (value: string | null | undefined): string =>
  value?.trim() ?? "";

const normalizeOrderGid = (orderId: string): string =>
  orderId.startsWith("gid://") ? orderId : `gid://shopify/Order/${orderId}`;

const buildPrintifyShippingAddress = (
  shippingAddress: z.infer<typeof fulfillmentShippingAddressSchema>,
): PrintifyShippingAddress => {
  const firstName = normalizeField(shippingAddress.first_name) || "Customer";
  const lastName = normalizeField(shippingAddress.last_name) || "Order";
  const address1 = normalizeField(shippingAddress.address1);
  const address2 = normalizeField(shippingAddress.address2) || undefined;
  const city = normalizeField(shippingAddress.city);
  const region = normalizeField(shippingAddress.region);
  const zip = normalizeField(shippingAddress.zip);
  const country = normalizeField(shippingAddress.country_code);
  const email = normalizeField(shippingAddress.email);
  const phone = normalizeField(shippingAddress.phone) || undefined;

  return {
    firstName,
    lastName,
    email,
    phone,
    address1,
    address2,
    city,
    region,
    zip,
    country,
  };
};

const getMissingShippingFields = (
  address: PrintifyShippingAddress,
): string[] => {
  const missing: string[] = [];

  if (!address.email) missing.push("email");
  if (!address.address1) missing.push("address1");
  if (!address.city) missing.push("city");
  if (!address.zip) missing.push("zip");
  if (!address.country) missing.push("country_code");

  const countryCode = address.country ? address.country.toUpperCase() : "";
  if ((countryCode === "US" || countryCode === "CA") && !address.region) {
    missing.push("region");
  }

  return missing;
};

type FetchOrderShippingAddressResult = {
  address: z.infer<typeof fulfillmentShippingAddressSchema> | null;
  protectedDataBlocked: boolean;
};

const isProtectedDataError = (message: string): boolean =>
  message.includes("not approved to use") ||
  message.includes("protected-customer-data") ||
  message.includes("Access denied for customer field");

const fetchOrderShippingAddress = async (input: {
  shopId: string;
  orderId: string;
}): Promise<FetchOrderShippingAddressResult> => {
  try {
    const admin = await getOfflineShopifyAdmin(input.shopId);
    const orderGid = normalizeOrderGid(input.orderId);
    const response = await admin.graphql(
      `#graphql
        query orderForFulfillment($id: ID!) {
          order(id: $id) {
            email
            customer {
              email
              phone
            }
            shippingAddress {
              firstName
              lastName
              address1
              address2
              city
              province
              provinceCode
              zip
              countryCodeV2
              phone
            }
          }
        }
      `,
      {
        variables: {
          id: orderGid,
        },
      },
    );

    if (!response.ok) {
      logger.warn(
        {
          shop_id: input.shopId,
          order_id: input.orderId,
          status: response.status,
        },
        "Failed to fetch order shipping address from Shopify",
      );
      return { address: null, protectedDataBlocked: false };
    }

    const json = (await response.json()) as {
      data?: {
        order?: {
          email?: string | null;
          customer?: { email?: string | null; phone?: string | null } | null;
          shippingAddress?: {
            firstName?: string | null;
            lastName?: string | null;
            address1?: string | null;
            address2?: string | null;
            city?: string | null;
            province?: string | null;
            provinceCode?: string | null;
            zip?: string | null;
            countryCodeV2?: string | null;
            phone?: string | null;
          } | null;
        } | null;
      };
      errors?: Array<{ message?: string }>;
    };

    const errorMessages = json.errors
      ? json.errors.map((error) => error.message ?? "unknown")
      : [];
    const protectedDataBlocked = errorMessages.some(isProtectedDataError);

    if (errorMessages.length) {
      logger.warn(
        {
          shop_id: input.shopId,
          order_id: input.orderId,
          order_gid: orderGid,
          errors: errorMessages,
        },
        "Shopify order query returned errors",
      );
    }

    if (!json.data?.order?.shippingAddress) {
      logger.warn(
        {
          shop_id: input.shopId,
          order_id: input.orderId,
          order_gid: orderGid,
          has_order: Boolean(json.data?.order),
          has_shipping: Boolean(json.data?.order?.shippingAddress),
          has_errors: Boolean(errorMessages.length),
        },
        "Shopify order response missing shipping address",
      );
      return { address: null, protectedDataBlocked };
    }

    const order = json.data.order;
    const shippingAddress = order.shippingAddress!;

    const normalized = {
      first_name: shippingAddress.firstName ?? null,
      last_name: shippingAddress.lastName ?? null,
      address1: shippingAddress.address1 ?? null,
      address2: shippingAddress.address2 ?? null,
      city: shippingAddress.city ?? null,
      region: shippingAddress.provinceCode ?? shippingAddress.province ?? null,
      zip: shippingAddress.zip ?? null,
      country_code: shippingAddress.countryCodeV2 ?? null,
      phone: shippingAddress.phone ?? order.customer?.phone ?? null,
      email: order.email ?? order.customer?.email ?? null,
    };

    logger.info(
      {
        shop_id: input.shopId,
        order_id: input.orderId,
        has_email: Boolean(normalized.email),
        has_address1: Boolean(normalized.address1),
        has_city: Boolean(normalized.city),
        has_zip: Boolean(normalized.zip),
        has_region: Boolean(normalized.region),
        has_country: Boolean(normalized.country_code),
      },
      "Fetched shipping address from Shopify Admin API",
    );

    return { address: normalized, protectedDataBlocked };
  } catch (error) {
    logger.warn(
      {
        shop_id: input.shopId,
        order_id: input.orderId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Error fetching order shipping address from Shopify",
    );
    return { address: null, protectedDataBlocked: false };
  }
};

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

      // ========================================================================
      // STORY 7.3: Submit order to Printify for fulfillment
      // ========================================================================
      let resolvedAsset: ResolvedAsset | null = null;
      let printifySubmissionResult: {
        success: boolean;
        printifyOrderId?: string;
        printifyOrderNumber?: number;
        errorCode?: PrintifySubmitErrorCode;
        errorMessage?: string;
      } | null = null;

      // Submit to Printify for fulfillment
      // Asset resolution happens inside the submission flow
      {
        const fallbackResult = payload.shipping_address
          ? null
          : await fetchOrderShippingAddress({
              shopId: payload.shop_id,
              orderId: payload.order_id,
            });
        const fallbackShippingAddress = fallbackResult?.address ?? null;
        const protectedDataBlocked =
          fallbackResult?.protectedDataBlocked ?? false;
        const shippingAddress =
          payload.shipping_address ?? fallbackShippingAddress;
        const shippingAddressSource = payload.shipping_address
          ? "webhook"
          : fallbackShippingAddress
            ? "admin"
            : "missing";

        if (!shippingAddress) {
          const message = protectedDataBlocked
            ? PRINTIFY_RECOVERY_GUIDANCE.protected_customer_data_not_approved
            : "Shipping address missing from order payload. Printify fulfillment requires a complete shipping address.";

          logger.warn(
            {
              shop_id: payload.shop_id,
              order_id: payload.order_id,
              order_line_id: payload.order_line_id,
            },
            "No shipping address provided - skipping Printify submission",
          );

          const printifyIdempotencyKey = buildPrintifySubmitIdempotencyKey(
            payload.shop_id,
            payload.order_line_id,
          );

          await prisma.orderLineProcessing.updateMany({
            where: {
              shop_id: payload.shop_id,
              order_line_id: payload.order_line_id,
            },
            data: {
              printify_submit_status: "failed",
              printify_submit_idempotency_key: printifyIdempotencyKey,
              printify_error_code: protectedDataBlocked
                ? "protected_customer_data_not_approved"
                : "shipping_address_incomplete",
              printify_error_message: message,
            },
          });

          captureEvent("fulfillment.failed", {
            shop_id: payload.shop_id,
            order_id: payload.order_id,
            order_line_id: payload.order_line_id,
            personalization_id: payload.personalization_id,
            error_code: protectedDataBlocked
              ? "protected_customer_data_not_approved"
              : "shipping_address_incomplete",
            error_message: message,
          });

          printifySubmissionResult = {
            success: false,
            errorCode: protectedDataBlocked
              ? "protected_customer_data_not_approved"
              : "shipping_address_incomplete",
            errorMessage: message,
          };
        } else {
          const printifyIdempotencyKey = buildPrintifySubmitIdempotencyKey(
            payload.shop_id,
            payload.order_line_id,
          );

          // Check if already submitted (idempotency check)
          // We check for any record with this idempotency key, regardless of status,
          // to handle partial failures where DB was updated but Printify call failed
          const existingSubmission = await prisma.orderLineProcessing.findFirst(
            {
              where: {
                shop_id: payload.shop_id,
                order_line_id: payload.order_line_id,
                printify_submit_idempotency_key: printifyIdempotencyKey,
              },
              select: {
                printify_order_id: true,
                printify_order_number: true,
                printify_submit_status: true,
              },
            },
          );

          // Only return early if we have a confirmed successful submission with Printify order ID
          if (
            existingSubmission?.printify_submit_status === "succeeded" &&
            existingSubmission?.printify_order_id
          ) {
            logger.info(
              {
                shop_id: payload.shop_id,
                order_line_id: payload.order_line_id,
                printify_order_id: existingSubmission.printify_order_id,
              },
              "Order already submitted to Printify (idempotent)",
            );

            // Emit succeeded event since we're returning cached success
            captureEvent("fulfillment.succeeded", {
              shop_id: payload.shop_id,
              order_id: payload.order_id,
              order_line_id: payload.order_line_id,
              personalization_id: payload.personalization_id,
              printify_order_id: existingSubmission.printify_order_id,
            });

            return {
              success: true,
              printifyOrderId: existingSubmission.printify_order_id,
              printifyOrderNumber:
                existingSubmission.printify_order_number ?? undefined,
            };
          }

          // If we have a pending or failed record with this key, we should retry
          // (don't return early - let the submission proceed)
          if (existingSubmission) {
            logger.info(
              {
                shop_id: payload.shop_id,
                order_line_id: payload.order_line_id,
                previous_status: existingSubmission.printify_submit_status,
              },
              "Retrying Printify submission with existing idempotency key",
            );
          }

          // Get Printify integration to check configuration
          const integration = await getPrintifyIntegrationWithToken(
            payload.shop_id,
          );
          if (!integration) {
            logger.warn(
              { shop_id: payload.shop_id },
              "Printify integration not configured - skipping submission",
            );

            // Mark as failed with guidance
            await prisma.orderLineProcessing.updateMany({
              where: {
                shop_id: payload.shop_id,
                order_line_id: payload.order_line_id,
              },
              data: {
                printify_submit_status: "failed",
                printify_submit_idempotency_key: printifyIdempotencyKey,
                printify_error_code: "printify_not_configured",
                printify_error_message:
                  PRINTIFY_RECOVERY_GUIDANCE.printify_not_configured,
              },
            });

            captureEvent("fulfillment.failed", {
              shop_id: payload.shop_id,
              order_id: payload.order_id,
              order_line_id: payload.order_line_id,
              personalization_id: payload.personalization_id,
              error_code: "printify_not_configured",
              error_message: "Printify integration not configured",
            });

            return {
              success: false,
              errorCode: "printify_not_configured" as PrintifySubmitErrorCode,
              errorMessage: "Printify integration not configured",
            };
          }

          // Mark as pending before submission
          await prisma.orderLineProcessing.updateMany({
            where: {
              shop_id: payload.shop_id,
              order_line_id: payload.order_line_id,
            },
            data: {
              printify_submit_status: "pending",
              printify_submit_idempotency_key: printifyIdempotencyKey,
            },
          });

          // Get Printify product ID from shop_products table
          // Normalize product_id to GID format (webhook sends numeric ID, DB stores GID)
          const normalizedProductId = payload.product_id
            ? payload.product_id.startsWith("gid://")
              ? payload.product_id
              : `gid://shopify/Product/${payload.product_id}`
            : null;

          const shopProduct = normalizedProductId
            ? await prisma.shopProduct.findFirst({
                where: {
                  shop_id: payload.shop_id,
                  product_id: normalizedProductId,
                },
                select: {
                  printify_product_id: true,
                },
              })
            : null;

          const printifyProductId = shopProduct?.printify_product_id ?? null;

          if (!printifyProductId) {
            logger.error(
              {
                shop_id: payload.shop_id,
                product_id: payload.product_id,
                normalized_product_id: normalizedProductId,
              },
              "Printify product ID not found for Shopify product",
            );

            await prisma.orderLineProcessing.updateMany({
              where: {
                shop_id: payload.shop_id,
                order_line_id: payload.order_line_id,
              },
              data: {
                printify_submit_status: "failed",
                printify_error_code: "printify_order_rejected",
                printify_error_message:
                  "Product not configured for Printify fulfillment",
              },
            });

            captureEvent("fulfillment.failed", {
              shop_id: payload.shop_id,
              order_id: payload.order_id,
              order_line_id: payload.order_line_id,
              personalization_id: payload.personalization_id,
              error_code: "printify_order_rejected",
              error_message: "Product not configured for Printify fulfillment",
            });

            return {
              success: false,
              errorCode: "printify_order_rejected" as PrintifySubmitErrorCode,
              errorMessage: "Product not configured for Printify fulfillment",
            };
          }

          const printifyProduct = await getPrintifyProductDetails(
            payload.shop_id,
            printifyProductId,
          );

          // Resolve Printify variant ID from Shopify variant ID
          let printifyVariantId: number;
          if (payload.variant_id && normalizedProductId) {
            const variantMapping = await resolvePrintifyVariantId(
              payload.shop_id,
              normalizedProductId,
              String(payload.variant_id),
            );
            if (variantMapping) {
              printifyVariantId = Number(variantMapping.printifyVariantId);
            } else {
              // Fallback: use first enabled variant from Printify product
              const firstEnabledVariant = printifyProduct.variants.find(
                (v) => v.isEnabled,
              );
              if (!firstEnabledVariant) {
                throw new Error(
                  "No enabled variants found for Printify product",
                );
              }
              printifyVariantId = firstEnabledVariant.id;
            }
          } else {
            // No variant_id provided - use first enabled variant
            const firstEnabledVariant = printifyProduct.variants.find(
              (v) => v.isEnabled,
            );
            if (!firstEnabledVariant) {
              throw new Error("No enabled variants found for Printify product");
            }
            printifyVariantId = firstEnabledVariant.id;
          }

          const printAreaFront = await getPrintifyVariantPrintArea({
            shopId: payload.shop_id,
            blueprintId: printifyProduct.blueprintId,
            printProviderId: printifyProduct.printProviderId,
            variantId: printifyVariantId,
            position: "front",
          });

          const printAreaFallback =
            printAreaFront ??
            (await getPrintifyVariantPrintArea({
              shopId: payload.shop_id,
              blueprintId: printifyProduct.blueprintId,
              printProviderId: printifyProduct.printProviderId,
              variantId: printifyVariantId,
            }));

          const printAreaPosition =
            printAreaFront?.position ?? printAreaFallback?.position ?? "front";

          const printAreaDimensions = printAreaFront ?? printAreaFallback;

          // Resolve and persist final print-ready asset
          resolvedAsset = await step.run("persist-final-asset", async () => {
            try {
              const asset = await ensurePrintReadyAsset({
                shopId: payload.shop_id,
                orderLineId: payload.order_line_id,
                personalizationId: payload.personalization_id,
                printAreaDimensions,
              });

              await prisma.orderLineProcessing.updateMany({
                where: {
                  shop_id: payload.shop_id,
                  order_line_id: payload.order_line_id,
                },
                data: {
                  final_asset_storage_key: asset.storageKey,
                  final_asset_bucket: asset.bucket,
                  final_asset_persisted_at: new Date(),
                },
              });

              captureEvent("fulfillment.asset.persisted", {
                shop_id: payload.shop_id,
                order_id: payload.order_id,
                order_line_id: payload.order_line_id,
                personalization_id: payload.personalization_id,
                job_id: asset.jobId,
                storage_key: asset.storageKey,
                bucket: asset.bucket,
                template_id: asset.templateId,
                product_id: asset.productId,
              });

              logger.info(
                {
                  shop_id: payload.shop_id,
                  order_line_id: payload.order_line_id,
                  personalization_id: payload.personalization_id,
                  storage_key: asset.storageKey,
                  bucket: asset.bucket,
                },
                "Final asset persisted successfully",
              );

              return asset;
            } catch (error) {
              if (error instanceof AssetResolutionError) {
                logger.error(
                  {
                    shop_id: payload.shop_id,
                    order_line_id: payload.order_line_id,
                    personalization_id: payload.personalization_id,
                    error_code: error.code,
                    error_message: error.message,
                    retryable: error.retryable,
                  },
                  "Asset resolution failed",
                );

                await prisma.orderLineProcessing.updateMany({
                  where: {
                    shop_id: payload.shop_id,
                    order_line_id: payload.order_line_id,
                  },
                  data: {
                    final_asset_error_code: error.code,
                    final_asset_error_message: error.message,
                  },
                });

                captureEvent("fulfillment.asset.failed", {
                  shop_id: payload.shop_id,
                  order_id: payload.order_id,
                  order_line_id: payload.order_line_id,
                  personalization_id: payload.personalization_id,
                  error_code: error.code,
                  error_message: error.message,
                });

                if (error.retryable) {
                  throw error;
                }

                logger.warn(
                  {
                    shop_id: payload.shop_id,
                    order_line_id: payload.order_line_id,
                    personalization_id: payload.personalization_id,
                    error_code: error.code,
                  },
                  "Asset resolution failed with non-retryable error - marking as failed",
                );

                return null;
              }

              throw error;
            }
          });

          if (!resolvedAsset) {
            return {
              success: false,
              errorCode: "order_line_not_found" as PrintifySubmitErrorCode,
              errorMessage: RECOVERY_GUIDANCE.asset_not_found,
            };
          }

          const finalAsset = resolvedAsset;
          let printAreaTransform = {
            x: 0.5,
            y: 0.5,
            scale: 1,
            angle: 0,
          };

          const template = await getTemplate(
            finalAsset.templateId,
            payload.shop_id,
          );
          if (!template) {
            logger.warn(
              {
                shop_id: payload.shop_id,
                template_id: finalAsset.templateId,
                order_line_id: payload.order_line_id,
              },
              "Template not found for fulfillment; using default print area scale",
            );
          }

          const coverPrintArea = template?.coverPrintArea ?? false;
          const imageSize = calculateFalImageSize({
            coverPrintArea,
            templateAspectRatio: template?.aspectRatio ?? null,
            printAreaDimensions,
          });
          const computedTransform = buildPrintAreaTransform({
            coverPrintArea,
            imageSize,
            printAreaDimensions,
          });
          printAreaTransform = {
            x: finalAsset.printAreaX ?? computedTransform.x,
            y: finalAsset.printAreaY ?? computedTransform.y,
            scale: finalAsset.printAreaScale ?? computedTransform.scale,
            angle: finalAsset.printAreaAngle ?? computedTransform.angle,
          };

          printifySubmissionResult = await step.run(
            "submit-to-printify",
            async () => {
              let shippingMethodId: number | undefined;
              let shippingAddressForPrintify = shippingAddress;
              let shippingAddressPayload = buildPrintifyShippingAddress(
                shippingAddressForPrintify,
              );
              let missingFields = getMissingShippingFields(
                shippingAddressPayload,
              );
              let protectedDataBlockedByApi = false;

              if (missingFields.length > 0) {
                const fallbackResult = await fetchOrderShippingAddress({
                  shopId: payload.shop_id,
                  orderId: payload.order_id,
                });
                const fallbackAddress = fallbackResult.address;
                const fallbackBlocked = fallbackResult.protectedDataBlocked;
                protectedDataBlockedByApi = fallbackBlocked;

                if (fallbackAddress) {
                  shippingAddressForPrintify = fallbackAddress;
                  shippingAddressPayload = buildPrintifyShippingAddress(
                    shippingAddressForPrintify,
                  );
                  missingFields = getMissingShippingFields(
                    shippingAddressPayload,
                  );

                  if (!missingFields.length) {
                    logger.info(
                      {
                        shop_id: payload.shop_id,
                        order_id: payload.order_id,
                        order_line_id: payload.order_line_id,
                      },
                      "Filled shipping address from Shopify Admin API",
                    );
                  }
                } else if (fallbackBlocked) {
                  const message =
                    PRINTIFY_RECOVERY_GUIDANCE.protected_customer_data_not_approved;

                  logger.warn(
                    {
                      shop_id: payload.shop_id,
                      order_id: payload.order_id,
                      order_line_id: payload.order_line_id,
                    },
                    "Protected customer data access not approved",
                  );

                  await prisma.orderLineProcessing.updateMany({
                    where: {
                      shop_id: payload.shop_id,
                      order_line_id: payload.order_line_id,
                    },
                    data: {
                      printify_submit_status: "failed",
                      printify_submit_idempotency_key: printifyIdempotencyKey,
                      printify_error_code:
                        "protected_customer_data_not_approved",
                      printify_error_message: message,
                    },
                  });

                  captureEvent("fulfillment.failed", {
                    shop_id: payload.shop_id,
                    order_id: payload.order_id,
                    order_line_id: payload.order_line_id,
                    personalization_id: payload.personalization_id,
                    error_code: "protected_customer_data_not_approved",
                    error_message: message,
                  });

                  return {
                    success: false,
                    errorCode:
                      "protected_customer_data_not_approved" as PrintifySubmitErrorCode,
                    errorMessage: message,
                  };
                } else {
                  logger.warn(
                    {
                      shop_id: payload.shop_id,
                      order_id: payload.order_id,
                      order_line_id: payload.order_line_id,
                    },
                    "Unable to fetch shipping address from Shopify Admin API",
                  );
                }
              }

              // Generate signed URL for the asset
              const assetWithUrl = await generateAssetSignedUrl(finalAsset);

              if (missingFields.length > 0) {
                const message = protectedDataBlockedByApi
                  ? PRINTIFY_RECOVERY_GUIDANCE.protected_customer_data_not_approved
                  : `Missing required shipping fields: ${missingFields.join(", ")}`;

                logger.warn(
                  {
                    shop_id: payload.shop_id,
                    order_id: payload.order_id,
                    order_line_id: payload.order_line_id,
                    missing_fields: missingFields,
                  },
                  "Shipping address incomplete - skipping Printify submission",
                );

                await prisma.orderLineProcessing.updateMany({
                  where: {
                    shop_id: payload.shop_id,
                    order_line_id: payload.order_line_id,
                  },
                  data: {
                    printify_submit_status: "failed",
                    printify_submit_idempotency_key: printifyIdempotencyKey,
                    printify_error_code: protectedDataBlockedByApi
                      ? "protected_customer_data_not_approved"
                      : "shipping_address_incomplete",
                    printify_error_message: message,
                  },
                });

                captureEvent("fulfillment.failed", {
                  shop_id: payload.shop_id,
                  order_id: payload.order_id,
                  order_line_id: payload.order_line_id,
                  personalization_id: payload.personalization_id,
                  error_code: protectedDataBlockedByApi
                    ? "protected_customer_data_not_approved"
                    : "shipping_address_incomplete",
                  error_message: message,
                });

                return {
                  success: false,
                  errorCode: protectedDataBlockedByApi
                    ? ("protected_customer_data_not_approved" as PrintifySubmitErrorCode)
                    : ("shipping_address_incomplete" as PrintifySubmitErrorCode),
                  errorMessage: message,
                };
              }

              const preferredShippingLine = payload.shipping_lines?.[0];
              const preferredPrice = preferredShippingLine?.price
                ? Number.parseFloat(preferredShippingLine.price)
                : null;
              const preferredShipping = {
                name: preferredShippingLine?.title ?? null,
                price:
                  preferredPrice !== null && Number.isFinite(preferredPrice)
                    ? preferredPrice
                    : null,
              };

              try {
                const method = await selectPrintifyShippingMethod({
                  shopId: payload.shop_id,
                  address: shippingAddressPayload,
                  lineItems: [
                    {
                      productId: printifyProductId,
                      variantId: printifyVariantId,
                      quantity: payload.quantity ?? 1,
                    },
                  ],
                  preferred: preferredShipping,
                });
                if (method?.id) {
                  shippingMethodId = method.id;
                }
              } catch (error) {
                logger.warn(
                  {
                    shop_id: payload.shop_id,
                    order_line_id: payload.order_line_id,
                    error:
                      error instanceof Error ? error.message : String(error),
                  },
                  "Failed to calculate Printify shipping method; using default",
                );
              }

              // Build submission input
              const submissionInput: SubmitOrderInput = {
                shopId: payload.shop_id,
                orderId: payload.order_id,
                orderLineId: payload.order_line_id,
                assetUrl: assetWithUrl.signedUrl,
                printifyUploadId: finalAsset.printifyUploadId ?? null,
                idempotencyKey: printifyIdempotencyKey,
                printAreaPosition,
                printAreaX: printAreaTransform.x,
                printAreaY: printAreaTransform.y,
                printAreaScale: printAreaTransform.scale,
                printAreaAngle: printAreaTransform.angle,
                shippingMethodId,
                customer: {
                  firstName: shippingAddressPayload.firstName,
                  lastName: shippingAddressPayload.lastName,
                  email: shippingAddressPayload.email,
                  phone: shippingAddressPayload.phone,
                  address: {
                    address1: shippingAddressPayload.address1,
                    address2: shippingAddressPayload.address2,
                    city: shippingAddressPayload.city,
                    region: shippingAddressPayload.region,
                    zip: shippingAddressPayload.zip,
                    country: shippingAddressPayload.country,
                  },
                },
                printifyProductId,
                printifyBlueprintId: printifyProduct.blueprintId,
                printifyPrintProviderId: printifyProduct.printProviderId,
                variantId: printifyVariantId,
                quantity: payload.quantity ?? 1,
              };

              // Submit to Printify
              const result = await submitOrderToPrintify(submissionInput);

              // Update DB based on result
              if (result.success) {
                await prisma.orderLineProcessing.updateMany({
                  where: {
                    shop_id: payload.shop_id,
                    order_line_id: payload.order_line_id,
                  },
                  data: {
                    printify_submit_status: "succeeded",
                    printify_order_id: result.printifyOrderId,
                    printify_order_number: result.printifyOrderNumber,
                    printify_submitted_at: new Date(),
                    printify_error_code: null,
                    printify_error_message: null,
                  },
                });

                captureEvent("fulfillment.submitted", {
                  shop_id: payload.shop_id,
                  order_id: payload.order_id,
                  order_line_id: payload.order_line_id,
                  personalization_id: payload.personalization_id,
                  printify_order_id: result.printifyOrderId ?? "",
                  printify_order_number: result.printifyOrderNumber,
                  idempotency_key: printifyIdempotencyKey,
                });

                // Emit fulfillment.succeeded event per AC requirements
                captureEvent("fulfillment.succeeded", {
                  shop_id: payload.shop_id,
                  order_id: payload.order_id,
                  order_line_id: payload.order_line_id,
                  personalization_id: payload.personalization_id,
                  printify_order_id: result.printifyOrderId ?? "",
                });

                logger.info(
                  {
                    shop_id: payload.shop_id,
                    order_id: payload.order_id,
                    order_line_id: payload.order_line_id,
                    printify_order_id: result.printifyOrderId,
                    printify_order_number: result.printifyOrderNumber,
                  },
                  "Order submitted to Printify successfully",
                );
              } else {
                await prisma.orderLineProcessing.updateMany({
                  where: {
                    shop_id: payload.shop_id,
                    order_line_id: payload.order_line_id,
                  },
                  data: {
                    printify_submit_status: "failed",
                    printify_error_code: result.errorCode,
                    printify_error_message: result.errorMessage,
                  },
                });

                captureEvent("fulfillment.failed", {
                  shop_id: payload.shop_id,
                  order_id: payload.order_id,
                  order_line_id: payload.order_line_id,
                  personalization_id: payload.personalization_id,
                  error_code: result.errorCode ?? "unknown_error",
                  error_message: result.errorMessage ?? "Unknown error",
                });

                logger.error(
                  {
                    shop_id: payload.shop_id,
                    order_id: payload.order_id,
                    order_line_id: payload.order_line_id,
                    error_code: result.errorCode,
                    error_message: result.errorMessage,
                  },
                  "Printify order submission failed",
                );

                // If retryable, throw to trigger retry
                if (result.retryable) {
                  throw new Error(
                    result.errorMessage ?? "Printify submission failed",
                  );
                }
              }

              return result;
            },
          );
        }
      }

      // Update processing record to succeeded (if Printify submission also succeeded)
      await step.run("mark-succeeded", async () => {
        // Only mark as fully succeeded if Printify submission was successful or not attempted
        const printifySuccess =
          !printifySubmissionResult || printifySubmissionResult.success;

        await prisma.orderLineProcessing.updateMany({
          where: {
            shop_id: payload.shop_id,
            order_line_id: payload.order_line_id,
          },
          data: {
            status: printifySuccess ? "succeeded" : "failed",
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
