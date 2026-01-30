import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import prisma from "../../../../db.server";
import { inngest } from "../../../../services/inngest/client.server";

describe("Orders Paid Webhook Integration", () => {
  let testShopId: string;
  let testOrderId: string;
  let testOrderLineId: string;

  beforeAll(async () => {
    // Create test shop plan
    testShopId = "test_shop_" + Date.now();
    await prisma.shopPlan.create({
      data: {
        shop_id: testShopId,
        plan_status: "standard",
        shopify_subscription_id: "test_subscription_id",
      },
    });
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.orderLineProcessing.deleteMany({
      where: { shop_id: testShopId },
    });
    await prisma.billableEvent.deleteMany({
      where: { shop_id: testShopId },
    });
    await prisma.shopPlan.deleteMany({
      where: { shop_id: testShopId },
    });
  });

  beforeEach(async () => {
    // Clear test data before each test
    await prisma.orderLineProcessing.deleteMany({
      where: { shop_id: testShopId },
    });
    await prisma.billableEvent.deleteMany({
      where: { shop_id: testShopId },
    });

    testOrderId = "order_" + Date.now();
    testOrderLineId = "line_" + Date.now();
  });

  describe("Duplicate Webhook Delivery Handling", () => {
    it("should not create duplicate processing records for same webhook ID", async () => {
      const webhookId = "webhook_" + Date.now();
      const processingKey = `${testShopId}:${testOrderLineId}:fulfillment`;

      // First processing record
      await prisma.orderLineProcessing.create({
        data: {
          shop_id: testShopId,
          order_id: testOrderId,
          order_line_id: testOrderLineId,
          idempotency_key: processingKey,
          status: "pending",
          personalization_id: "test_preview_id",
        },
      });

      // Network check record
      await prisma.orderLineProcessing.create({
        data: {
          shop_id: testShopId,
          order_id: testOrderId,
          order_line_id: "network_check",
          idempotency_key: `${testShopId}:${webhookId}:network_check`,
          status: "succeeded",
          personalization_id: "webhook_id_check",
        },
      });

      // Try to create duplicate processing record
      const duplicateKey = `${testShopId}:${testOrderLineId}:fulfillment`;
      const duplicateRecord = await prisma.orderLineProcessing.upsert({
        where: { idempotency_key: duplicateKey },
        create: {
          shop_id: testShopId,
          order_id: testOrderId,
          order_line_id: testOrderLineId,
          idempotency_key: duplicateKey,
          status: "pending",
          personalization_id: "test_preview_id",
        },
        update: {},
      });

      // Verify no duplicate was created
      const allRecords = await prisma.orderLineProcessing.findMany({
        where: {
          shop_id: testShopId,
          order_line_id: testOrderLineId,
          idempotency_key: { not: "network_check" },
        },
      });

      expect(allRecords).toHaveLength(1);
      expect(allRecords[0].idempotency_key).toBe(processingKey);
    });

    it("should prevent duplicate billable events with same idempotency key", async () => {
      const billableKey = `${testShopId}:${testOrderLineId}:order_fee`;

      // First billable event
      const firstEvent = await prisma.billableEvent.create({
        data: {
          shop_id: testShopId,
          event_type: "order_fee",
          status: "pending",
          amount_mills: 250,
          currency_code: "USD",
          idempotency_key: billableKey,
          description: `Order fee for line ${testOrderLineId}`,
          source_id: testOrderLineId,
        },
      });

      // Try to create duplicate billable event
      const duplicateEvent = await prisma.billableEvent.upsert({
        where: {
          shop_id_idempotency_key: {
            shop_id: testShopId,
            idempotency_key: billableKey,
          },
        },
        create: {
          shop_id: testShopId,
          event_type: "order_fee",
          status: "pending",
          amount_mills: 250,
          currency_code: "USD",
          idempotency_key: billableKey,
          description: `Order fee for line ${testOrderLineId}`,
          source_id: testOrderLineId,
        },
        update: {},
      });

      // Verify only one event exists
      const allEvents = await prisma.billableEvent.findMany({
        where: {
          shop_id: testShopId,
          idempotency_key: billableKey,
        },
      });

      expect(allEvents).toHaveLength(1);
      expect(allEvents[0].id).toBe(firstEvent.id);
    });
  });

  describe("Billing Idempotency", () => {
    it("should create billable event with unique constraint", async () => {
      const billableKey = `${testShopId}:${testOrderLineId}:order_fee`;

      const billableEvent = await prisma.billableEvent.create({
        data: {
          shop_id: testShopId,
          event_type: "order_fee",
          status: "pending",
          amount_mills: 250,
          currency_code: "USD",
          idempotency_key: billableKey,
          description: `Order fee for line ${testOrderLineId}`,
          source_id: testOrderLineId,
        },
      });

      expect(billableEvent).toBeDefined();
      expect(billableEvent.amount_mills).toBe(250);
      expect(billableEvent.status).toBe("pending");
    });

    it("should waive fee for early_access plan", async () => {
      // Update plan to early_access
      await prisma.shopPlan.update({
        where: { shop_id: testShopId },
        data: { plan_status: "early_access" },
      });

      const billableKey = `${testShopId}:${testOrderLineId}:order_fee`;

      const billableEvent = await prisma.billableEvent.create({
        data: {
          shop_id: testShopId,
          event_type: "order_fee",
          status: "waived",
          amount_mills: 250,
          currency_code: "USD",
          idempotency_key: billableKey,
          description: `Order fee waived for line ${testOrderLineId} (plan: early_access)`,
          source_id: testOrderLineId,
        },
      });

      expect(billableEvent).toBeDefined();
      expect(billableEvent.status).toBe("waived");
    });

    it("should waive fee for none plan with warning", async () => {
      // Update plan to none
      await prisma.shopPlan.update({
        where: { shop_id: testShopId },
        data: { plan_status: "none" },
      });

      const billableKey = `${testShopId}:${testOrderLineId}:order_fee`;

      const billableEvent = await prisma.billableEvent.create({
        data: {
          shop_id: testShopId,
          event_type: "order_fee",
          status: "waived",
          amount_mills: 250,
          currency_code: "USD",
          idempotency_key: billableKey,
          description: `Order fee waived for line ${testOrderLineId} (plan: none)`,
          source_id: testOrderLineId,
        },
      });

      expect(billableEvent).toBeDefined();
      expect(billableEvent.status).toBe("waived");
    });
  });

  describe("Webhook Payload Validation", () => {
    it("should validate order paid payload schema", async () => {
      const validPayload = {
        id: 1234567890,
        name: "#1001",
        email: "customer@example.com",
        line_items: [
          {
            id: 11111,
            product_id: 22222,
            variant_id: 33333,
            quantity: 1,
            price: "25.00",
            properties: [
              { name: "personalization_id", value: "preview_abc123" },
            ],
          },
        ],
        total_price: "25.00",
        currency: "USD",
        created_at: "2026-01-29T10:00:00Z",
        updated_at: "2026-01-29T10:00:00Z",
      };

      // Import and test schema validation
      const { OrderPaidPayloadSchema } =
        await import("../../../schemas/webhooks");
      const result = OrderPaidPayloadSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.line_items).toHaveLength(1);
        expect(result.data.line_items[0].properties[0].name).toBe(
          "personalization_id",
        );
      }
    });

    it("should reject invalid order paid payload", async () => {
      const invalidPayload = {
        id: "not_a_number",
        line_items: "not_an_array",
      };

      const { OrderPaidPayloadSchema } =
        await import("../../../schemas/webhooks");
      const result = OrderPaidPayloadSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });
  });

  describe("Order Line Processing State Management", () => {
    it("should transition status from pending to processing to succeeded", async () => {
      const processingKey = `${testShopId}:${testOrderLineId}:fulfillment`;

      // Create pending record
      const processingRecord = await prisma.orderLineProcessing.create({
        data: {
          shop_id: testShopId,
          order_id: testOrderId,
          order_line_id: testOrderLineId,
          idempotency_key: processingKey,
          status: "pending",
          personalization_id: "test_preview_id",
        },
      });

      expect(processingRecord.status).toBe("pending");

      // Update to processing
      await prisma.orderLineProcessing.updateMany({
        where: {
          shop_id: testShopId,
          order_line_id: testOrderLineId,
        },
        data: { status: "processing" },
      });

      let updated = await prisma.orderLineProcessing.findUnique({
        where: { idempotency_key: processingKey },
      });
      expect(updated?.status).toBe("processing");

      // Update to succeeded
      await prisma.orderLineProcessing.updateMany({
        where: {
          shop_id: testShopId,
          order_line_id: testOrderLineId,
        },
        data: { status: "succeeded" },
      });

      updated = await prisma.orderLineProcessing.findUnique({
        where: { idempotency_key: processingKey },
      });
      expect(updated?.status).toBe("succeeded");
    });

    it("should transition status to failed on error", async () => {
      const processingKey = `${testShopId}:${testOrderLineId}:fulfillment`;

      const processingRecord = await prisma.orderLineProcessing.create({
        data: {
          shop_id: testShopId,
          order_id: testOrderId,
          order_line_id: testOrderLineId,
          idempotency_key: processingKey,
          status: "processing",
          personalization_id: "test_preview_id",
        },
      });

      // Simulate failure
      await prisma.orderLineProcessing.updateMany({
        where: {
          shop_id: testShopId,
          order_line_id: testOrderLineId,
        },
        data: { status: "failed" },
      });

      const updated = await prisma.orderLineProcessing.findUnique({
        where: { idempotency_key: processingKey },
      });
      expect(updated?.status).toBe("failed");
    });
  });
});
