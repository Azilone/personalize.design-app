/**
 * Unit tests for Printify order submission service.
 *
 * Tests:
 * - Status mapping from Printify to internal statuses
 * - Idempotency key generation
 */

import { describe, expect, it } from "vitest";
import {
  buildPrintifySubmitIdempotencyKey,
  mapPrintifyStatusToInternal,
} from "./order-submission.server";

describe("buildPrintifySubmitIdempotencyKey", () => {
  it("should generate correct idempotency key format", () => {
    const shopId = "shop-123";
    const orderLineId = "line-456";

    const key = buildPrintifySubmitIdempotencyKey(shopId, orderLineId);

    expect(key).toBe("shop-123:line-456:printify_submit");
  });

  it("should handle Shopify GID format shop IDs", () => {
    const shopId = "gid://shopify/Shop/12345678";
    const orderLineId = "gid://shopify/LineItem/987654321";

    const key = buildPrintifySubmitIdempotencyKey(shopId, orderLineId);

    expect(key).toBe(
      "gid://shopify/Shop/12345678:gid://shopify/LineItem/987654321:printify_submit",
    );
  });

  it("should generate unique keys for different order lines", () => {
    const shopId = "shop-123";
    const orderLineId1 = "line-1";
    const orderLineId2 = "line-2";

    const key1 = buildPrintifySubmitIdempotencyKey(shopId, orderLineId1);
    const key2 = buildPrintifySubmitIdempotencyKey(shopId, orderLineId2);

    expect(key1).not.toBe(key2);
    expect(key1).toBe("shop-123:line-1:printify_submit");
    expect(key2).toBe("shop-123:line-2:printify_submit");
  });

  it("should generate unique keys for different shops", () => {
    const shopId1 = "shop-a";
    const shopId2 = "shop-b";
    const orderLineId = "line-1";

    const key1 = buildPrintifySubmitIdempotencyKey(shopId1, orderLineId);
    const key2 = buildPrintifySubmitIdempotencyKey(shopId2, orderLineId);

    expect(key1).not.toBe(key2);
    expect(key1).toBe("shop-a:line-1:printify_submit");
    expect(key2).toBe("shop-b:line-1:printify_submit");
  });
});

describe("mapPrintifyStatusToInternal", () => {
  describe("pending statuses", () => {
    it("should map 'pending' to 'pending'", () => {
      expect(mapPrintifyStatusToInternal("pending")).toBe("pending");
    });

    it("should map 'on-hold' to 'pending'", () => {
      expect(mapPrintifyStatusToInternal("on-hold")).toBe("pending");
    });

    it("should map 'sending-to-production' to 'pending'", () => {
      expect(mapPrintifyStatusToInternal("sending-to-production")).toBe(
        "pending",
      );
    });

    it("should map 'in-production' to 'pending'", () => {
      expect(mapPrintifyStatusToInternal("in-production")).toBe("pending");
    });
  });

  describe("succeeded statuses", () => {
    it("should map 'fulfilled' to 'succeeded'", () => {
      expect(mapPrintifyStatusToInternal("fulfilled")).toBe("succeeded");
    });

    it("should map 'partially-fulfilled' to 'succeeded'", () => {
      expect(mapPrintifyStatusToInternal("partially-fulfilled")).toBe(
        "succeeded",
      );
    });
  });

  describe("failed statuses", () => {
    it("should map 'canceled' to 'failed'", () => {
      expect(mapPrintifyStatusToInternal("canceled")).toBe("failed");
    });

    it("should map 'has-issues' to 'failed'", () => {
      expect(mapPrintifyStatusToInternal("has-issues")).toBe("failed");
    });

    it("should map 'unfulfillable' to 'failed'", () => {
      expect(mapPrintifyStatusToInternal("unfulfillable")).toBe("failed");
    });
  });
});
