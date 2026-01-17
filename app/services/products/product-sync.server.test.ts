import { describe, expect, it } from "vitest";
import { type ShopifyProduct } from "../shopify/products.server";
import { mapShopifyProductToRecord } from "./product-sync.server";

describe("mapShopifyProductToRecord", () => {
  it("maps Shopify product fields into a shop product record", () => {
    const product: ShopifyProduct = {
      id: "gid://shopify/Product/123",
      title: "Custom Mug",
      handle: "custom-mug",
      imageUrl: "https://cdn.shopify.com/mug.png",
      imageAlt: "Mug",
      printifyProductId: "printify-1",
      printifyShopId: "printify-shop-9",
    };
    const syncedAt = new Date("2026-01-17T10:00:00Z");

    const record = mapShopifyProductToRecord(product, syncedAt);

    expect(record).toEqual({
      productId: "gid://shopify/Product/123",
      title: "Custom Mug",
      handle: "custom-mug",
      imageUrl: "https://cdn.shopify.com/mug.png",
      imageAlt: "Mug",
      printifyProductId: "printify-1",
      printifyShopId: "printify-shop-9",
      syncedAt,
    });
  });

  it("handles missing optional product metadata", () => {
    const product: ShopifyProduct = {
      id: "gid://shopify/Product/456",
      title: "Minimal Tee",
      handle: "minimal-tee",
      imageUrl: null,
      imageAlt: null,
      printifyProductId: null,
      printifyShopId: null,
    };
    const syncedAt = new Date("2026-01-17T12:30:00Z");

    const record = mapShopifyProductToRecord(product, syncedAt);

    expect(record).toEqual({
      productId: "gid://shopify/Product/456",
      title: "Minimal Tee",
      handle: "minimal-tee",
      imageUrl: null,
      imageAlt: null,
      printifyProductId: null,
      printifyShopId: null,
      syncedAt,
    });
  });
});
