import { describe, expect, it } from "vitest";
import { getShopIdFromSession } from "./tenancy";

describe("getShopIdFromSession", () => {
  it("returns the shop domain as shop_id", () => {
    const shopId = getShopIdFromSession({ shop: "test-shop.myshopify.com" });
    expect(shopId).toBe("test-shop.myshopify.com");
  });
});
