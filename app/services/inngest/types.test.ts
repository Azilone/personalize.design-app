import { describe, expect, it } from "vitest";
import { buyerPreviewGeneratePayloadSchema } from "./types";

describe("buyerPreviewGeneratePayloadSchema", () => {
  it("accepts a valid payload", () => {
    const parsed = buyerPreviewGeneratePayloadSchema.safeParse({
      shop_id: "shop-123",
      product_id: "product-456",
      template_id: "template-789",
      buyer_session_id: "session-abc",
      image_url: "https://storage.example.com/image.png",
      text_input: "Hello world",
      variable_values: { name: "Nova" },
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects payloads missing required fields", () => {
    const parsed = buyerPreviewGeneratePayloadSchema.safeParse({
      shop_id: "shop-123",
      product_id: "product-456",
    });

    expect(parsed.success).toBe(false);
  });
});
