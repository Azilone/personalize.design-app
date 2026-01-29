import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrderPaidPayloadSchema, LineItemSchema } from "./webhooks";

describe("Webhook Schemas", () => {
  describe("LineItemSchema", () => {
    it("should validate a valid line item with properties", () => {
      const lineItem = {
        id: 12345,
        product_id: 67890,
        variant_id: 11111,
        quantity: 2,
        price: "25.00",
        properties: [
          { name: "personalization_id", value: "preview_abc123" },
          { name: "custom_text", value: "Hello World" },
        ],
      };

      const result = LineItemSchema.safeParse(lineItem);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(12345);
        expect(result.data.properties).toHaveLength(2);
        expect(result.data.properties[0].name).toBe("personalization_id");
        expect(result.data.properties[0].value).toBe("preview_abc123");
      }
    });

    it("should validate a line item without properties", () => {
      const lineItem = {
        id: "line_123",
        quantity: 1,
        price: "10.00",
      };

      const result = LineItemSchema.safeParse(lineItem);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.properties).toEqual([]);
      }
    });

    it("should validate a line item with string ID", () => {
      const lineItem = {
        id: "gid://shopify/LineItem/12345",
        quantity: 1,
        price: "15.00",
        properties: [],
      };

      const result = LineItemSchema.safeParse(lineItem);
      expect(result.success).toBe(true);
    });
  });

  describe("OrderPaidPayloadSchema", () => {
    it("should validate a valid order paid payload", () => {
      const payload = {
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
          {
            id: 11112,
            product_id: 22223,
            quantity: 2,
            price: "15.00",
            properties: [],
          },
        ],
        total_price: "55.00",
        currency: "USD",
        created_at: "2026-01-29T10:00:00Z",
        updated_at: "2026-01-29T10:05:00Z",
      };

      const result = OrderPaidPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.line_items).toHaveLength(2);
        expect(result.data.line_items[0].properties[0].name).toBe(
          "personalization_id",
        );
      }
    });

    it("should reject invalid payload", () => {
      const payload = {
        id: "not_a_number_or_string",
        line_items: "not_an_array",
      };

      const result = OrderPaidPayloadSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should handle missing optional fields", () => {
      const payload = {
        id: 123,
        name: "#1001",
        line_items: [],
        total_price: "0.00",
        currency: "USD",
        created_at: "2026-01-29T10:00:00Z",
        updated_at: "2026-01-29T10:00:00Z",
      };

      const result = OrderPaidPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });
});
