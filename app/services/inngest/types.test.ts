import { describe, expect, it } from "vitest";
import { previewGeneratePayloadSchema } from "./types";

describe("previewGeneratePayloadSchema", () => {
  it("accepts a valid payload", () => {
    const parsed = previewGeneratePayloadSchema.safeParse({
      job_id: "job-001",
      shop_id: "shop-123",
      product_id: "product-456",
      template_id: "template-789",
      type: "buyer",
      image_url: "https://storage.example.com/image.png",
      text_input: "Hello world",
      variable_values: { name: "Nova" },
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects payloads missing required fields", () => {
    const parsed = previewGeneratePayloadSchema.safeParse({
      shop_id: "shop-123",
      product_id: "product-456",
    });

    expect(parsed.success).toBe(false);
  });
});
