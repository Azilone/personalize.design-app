import { describe, expect, it } from "vitest";
import { generatePreviewRequestSchema } from "./app_proxy";

describe("generatePreviewRequestSchema", () => {
  it("accepts a valid payload", () => {
    const file = new File([new Uint8Array([1])], "photo.jpg", {
      type: "image/jpeg",
    });

    const parsed = generatePreviewRequestSchema.safeParse({
      shop_id: "shop-123",
      product_id: "product-456",
      template_id: "template-789",
      session_id: "session-abc",
      image_file: file,
      text_input: "Custom text",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const parsed = generatePreviewRequestSchema.safeParse({
      shop_id: "shop-123",
      product_id: "product-456",
    });

    expect(parsed.success).toBe(false);
  });
});
