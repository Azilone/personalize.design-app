import { describe, expect, it } from "vitest";
import type { PrintifyShopChoice } from "./client.server";
import { selectPrintifyShop } from "./shop-selection.server";

describe("selectPrintifyShop", () => {
  const shopA: PrintifyShopChoice = {
    shopId: "111",
    shopTitle: "Shop A",
    salesChannel: "shopify",
  };
  const shopB: PrintifyShopChoice = {
    shopId: "222",
    shopTitle: "Shop B",
    salesChannel: "etsy",
  };

  it("returns null when no shops available", () => {
    expect(selectPrintifyShop([], undefined, undefined)).toBeNull();
  });

  it("returns the single shop when only one available", () => {
    expect(selectPrintifyShop([shopA], undefined, undefined)).toEqual(shopA);
  });

  it("uses explicitly selected shop ID when provided", () => {
    expect(selectPrintifyShop([shopA, shopB], "222", undefined)).toEqual(shopB);
  });

  it("returns null when explicit shop ID does not match any shop", () => {
    expect(selectPrintifyShop([shopA, shopB], "999", undefined)).toBeNull();
  });

  it("auto-selects previously saved shop when it still exists", () => {
    expect(selectPrintifyShop([shopA, shopB], undefined, "111")).toEqual(shopA);
  });

  it("returns null when previous shop no longer exists", () => {
    expect(selectPrintifyShop([shopA, shopB], undefined, "999")).toBeNull();
  });

  it("returns null when multiple shops and no selection or previous", () => {
    expect(selectPrintifyShop([shopA, shopB], undefined, undefined)).toBeNull();
  });

  it("prefers explicit selection over previously saved shop", () => {
    expect(selectPrintifyShop([shopA, shopB], "222", "111")).toEqual(shopB);
  });
});
