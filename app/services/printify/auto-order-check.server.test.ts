import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { PrintifyOrderDetails } from "./order-details.server";

// Mock prisma using vi.hoisted to ensure mocks are defined before vi.mock runs
const mockPrisma = vi.hoisted(() => ({
  shopProduct: {
    findMany: vi.fn(),
  },
  productTemplateAssignment: {
    findFirst: vi.fn(),
  },
}));

vi.mock("../../db.server", () => ({
  default: mockPrisma,
}));

// Import after mocking
import {
  checkAutoImportedOrder,
  isValidPersonalizeExternalId,
} from "./auto-order-check.server";

describe("isValidPersonalizeExternalId", () => {
  it("should return false for null", () => {
    expect(isValidPersonalizeExternalId(null)).toBe(false);
  });

  it("should return false for empty string", () => {
    expect(isValidPersonalizeExternalId("")).toBe(false);
  });

  it("should return false for string without hyphen", () => {
    expect(isValidPersonalizeExternalId("invalid")).toBe(false);
  });

  it("should return false for string with multiple hyphens", () => {
    expect(isValidPersonalizeExternalId("a-b-c")).toBe(false);
  });

  it("should return false for string with empty parts", () => {
    expect(isValidPersonalizeExternalId("-")).toBe(false);
    expect(isValidPersonalizeExternalId("a-")).toBe(false);
    expect(isValidPersonalizeExternalId("-b")).toBe(false);
  });

  it("should return false for very short strings like '1-1'", () => {
    expect(isValidPersonalizeExternalId("1-1")).toBe(false);
    expect(isValidPersonalizeExternalId("12-3")).toBe(false);
  });

  it("should return true for valid Shopify GID format", () => {
    expect(
      isValidPersonalizeExternalId(
        "gid://shopify/Order/1234567890-gid://shopify/LineItem/9876543210",
      ),
    ).toBe(true);
  });

  it("should return true for valid numeric format", () => {
    expect(isValidPersonalizeExternalId("1234567890-9876543210")).toBe(true);
  });

  it("should return true for valid alphanumeric format", () => {
    expect(isValidPersonalizeExternalId("order123-line456")).toBe(true);
  });

  it("should return false for strings with only hyphens or special chars", () => {
    expect(isValidPersonalizeExternalId("---")).toBe(false);
    expect(isValidPersonalizeExternalId("!@#-$%^")).toBe(false);
  });
});

describe("checkAutoImportedOrder", () => {
  const mockShopId = "test-shop-123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return 'skip' when order does not contain personalized products", async () => {
    const orderDetails: PrintifyOrderDetails = {
      externalId: null,
      lineItems: [{ productId: "printify-product-1" }],
      status: null,
    };

    // Mock: No shop products found
    mockPrisma.shopProduct.findMany.mockResolvedValue([]);

    const result = await checkAutoImportedOrder(mockShopId, orderDetails);

    expect(result).toEqual({
      action: "skip",
      reason: "not_personalized",
    });
    expect(mockPrisma.shopProduct.findMany).toHaveBeenCalledWith({
      where: {
        shop_id: mockShopId,
        printify_product_id: { in: ["printify-product-1"] },
      },
      select: { product_id: true },
    });
  });

  it("should return 'cancel' when order has personalized product but invalid external_id", async () => {
    const orderDetails: PrintifyOrderDetails = {
      externalId: "no-hyphen-format", // Invalid format - no hyphen
      lineItems: [{ productId: "printify-product-1" }],
      status: null,
    };

    // Mock: Shop product found
    mockPrisma.shopProduct.findMany.mockResolvedValue([
      { product_id: "shopify-product-1" },
    ]);

    // Mock: Personalized assignment found
    mockPrisma.productTemplateAssignment.findFirst.mockResolvedValue({
      id: "assignment-1",
    });

    const result = await checkAutoImportedOrder(mockShopId, orderDetails);

    expect(result).toEqual({
      action: "cancel",
      reason: "auto_imported_without_external_id",
    });
  });

  it("should return 'cancel' when order has personalized product but no external_id", async () => {
    const orderDetails: PrintifyOrderDetails = {
      externalId: null,
      lineItems: [{ productId: "printify-product-1" }],
      status: null,
    };

    // Mock: Shop product found
    mockPrisma.shopProduct.findMany.mockResolvedValue([
      { product_id: "shopify-product-1" },
    ]);

    // Mock: Personalized assignment found
    mockPrisma.productTemplateAssignment.findFirst.mockResolvedValue({
      id: "assignment-1",
    });

    const result = await checkAutoImportedOrder(mockShopId, orderDetails);

    expect(result).toEqual({
      action: "cancel",
      reason: "auto_imported_without_external_id",
    });
  });

  it("should return 'warn' when order has personalized product and valid external_id", async () => {
    const orderDetails: PrintifyOrderDetails = {
      externalId: "1234567890-9876543210", // Valid format
      lineItems: [{ productId: "printify-product-1" }],
      status: null,
    };

    // Mock: Shop product found
    mockPrisma.shopProduct.findMany.mockResolvedValue([
      { product_id: "shopify-product-1" },
    ]);

    // Mock: Personalized assignment found
    mockPrisma.productTemplateAssignment.findFirst.mockResolvedValue({
      id: "assignment-1",
    });

    const result = await checkAutoImportedOrder(mockShopId, orderDetails);

    expect(result).toEqual({
      action: "warn",
      reason: "valid_external_id_no_record",
    });
  });

  it("should handle multiple line items", async () => {
    const orderDetails: PrintifyOrderDetails = {
      externalId: null,
      lineItems: [
        { productId: "printify-product-1" },
        { productId: "printify-product-2" },
      ],
      status: null,
    };

    // Mock: Multiple shop products found
    mockPrisma.shopProduct.findMany.mockResolvedValue([
      { product_id: "shopify-product-1" },
      { product_id: "shopify-product-2" },
    ]);

    // Mock: No personalized assignment for any product
    mockPrisma.productTemplateAssignment.findFirst.mockResolvedValue(null);

    const result = await checkAutoImportedOrder(mockShopId, orderDetails);

    expect(result).toEqual({
      action: "skip",
      reason: "not_personalized",
    });
    expect(mockPrisma.productTemplateAssignment.findFirst).toHaveBeenCalledWith(
      {
        where: {
          shop_id: mockShopId,
          product_id: { in: ["shopify-product-1", "shopify-product-2"] },
          personalization_enabled: true,
        },
        select: { id: true },
      },
    );
  });

  it("should check all products when no shop products are found", async () => {
    const orderDetails: PrintifyOrderDetails = {
      externalId: null,
      lineItems: [{ productId: "unknown-printify-product" }],
      status: null,
    };

    // Mock: No shop products found (product not linked to this shop)
    mockPrisma.shopProduct.findMany.mockResolvedValue([]);

    const result = await checkAutoImportedOrder(mockShopId, orderDetails);

    expect(result).toEqual({
      action: "skip",
      reason: "not_personalized",
    });
    // Should not query productTemplateAssignment if no shop products
    expect(
      mockPrisma.productTemplateAssignment.findFirst,
    ).not.toHaveBeenCalled();
  });
});
