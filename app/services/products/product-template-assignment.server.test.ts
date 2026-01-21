import { describe, expect, it } from "vitest";
import type { ProductTemplateAssignment } from "@prisma/client";
import { mapProductTemplateAssignmentRecord } from "./product-template-assignment.server";

describe("mapProductTemplateAssignmentRecord", () => {
  it("maps prisma assignment records into DTOs", () => {
    const createdAt = new Date("2026-01-21T10:00:00Z");
    const updatedAt = new Date("2026-01-21T11:00:00Z");
    const record: ProductTemplateAssignment = {
      id: "assignment-1",
      shop_id: "shop-1",
      product_id: "gid://shopify/Product/123",
      template_id: "template-9",
      personalization_enabled: true,
      created_at: createdAt,
      updated_at: updatedAt,
    };

    expect(mapProductTemplateAssignmentRecord(record)).toEqual({
      id: "assignment-1",
      shopId: "shop-1",
      productId: "gid://shopify/Product/123",
      templateId: "template-9",
      personalizationEnabled: true,
      createdAt,
      updatedAt,
    });
  });

  it("maps prisma assignment with personalization disabled", () => {
    const record: ProductTemplateAssignment = {
      id: "assignment-2",
      shop_id: "shop-2",
      product_id: "gid://shopify/Product/456",
      template_id: "template-5",
      personalization_enabled: false,
      created_at: new Date("2026-01-21T12:00:00Z"),
      updated_at: new Date("2026-01-21T12:30:00Z"),
    };

    expect(mapProductTemplateAssignmentRecord(record)).toEqual({
      id: "assignment-2",
      shopId: "shop-2",
      productId: "gid://shopify/Product/456",
      templateId: "template-5",
      personalizationEnabled: false,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    });
  });

  it("maps prisma assignment with null timestamps", () => {
    const record: ProductTemplateAssignment = {
      id: "assignment-3",
      shop_id: "shop-3",
      product_id: "gid://shopify/Product/789",
      template_id: "template-2",
      personalization_enabled: true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const result = mapProductTemplateAssignmentRecord(record);

    expect(result.id).toBe("assignment-3");
    expect(result.shopId).toBe("shop-3");
    expect(result.productId).toBe("gid://shopify/Product/789");
    expect(result.templateId).toBe("template-2");
    expect(result.personalizationEnabled).toBe(true);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it("preserves all required fields in correct format", () => {
    const record: ProductTemplateAssignment = {
      id: "test-assignment",
      shop_id: "test-shop",
      product_id: "test-product",
      template_id: "test-template",
      personalization_enabled: false,
      created_at: new Date("2026-01-21T08:00:00Z"),
      updated_at: new Date("2026-01-21T09:00:00Z"),
    };

    const result = mapProductTemplateAssignmentRecord(record);

    expect(result).toMatchSnapshot();
  });
});
