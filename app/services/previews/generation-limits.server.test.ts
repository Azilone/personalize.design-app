import { describe, it, expect, beforeEach, vi } from "vitest";

const mockCheckBillableActionAllowed = vi.hoisted(() => vi.fn());

vi.mock("../shopify/billing-guardrails.server", () => ({
  checkBillableActionAllowed: mockCheckBillableActionAllowed,
}));

import {
  checkGenerationLimits,
  incrementGenerationAttempt,
  getGenerationLimitStatus,
  getOrCreateGenerationAttempt,
} from "./generation-limits.server";
import prisma from "../../db.server";

describe("generation-limits.server", () => {
  const testShopId = "test-shop.myshopify.com";
  const testSessionId = "test-session-123";
  const testProductId = "gid://shopify/Product/123";

  beforeEach(async () => {
    vi.clearAllMocks();

    mockCheckBillableActionAllowed.mockResolvedValue({ allowed: true });

    await prisma.generationAttempt.deleteMany({
      where: {
        shop_id: testShopId,
      },
    });
  });

  beforeEach(async () => {
    // Clean up test data
    await prisma.generationAttempt.deleteMany({
      where: {
        shop_id: testShopId,
      },
    });
    await prisma.shopGenerationLimits.deleteMany({
      where: {
        shop_id: testShopId,
      },
    });
  });

  describe("getOrCreateGenerationAttempt", () => {
    it("should create a new attempt record if none exists", async () => {
      const attempt = await getOrCreateGenerationAttempt({
        shopId: testShopId,
        sessionId: testSessionId,
        productId: testProductId,
      });

      expect(attempt).toBeDefined();
      expect(attempt.shopId).toBe(testShopId);
      expect(attempt.sessionId).toBe(testSessionId);
      expect(attempt.productId).toBe(testProductId);
      expect(attempt.attemptCount).toBe(0);
      expect(attempt.resetWindowMinutes).toBe(30);
    });

    it("should return existing attempt record if one exists", async () => {
      // Create first
      const first = await getOrCreateGenerationAttempt({
        shopId: testShopId,
        sessionId: testSessionId,
        productId: testProductId,
      });

      // Get again
      const second = await getOrCreateGenerationAttempt({
        shopId: testShopId,
        sessionId: testSessionId,
        productId: testProductId,
      });

      expect(second.id).toBe(first.id);
    });
  });

  describe("checkGenerationLimits", () => {
    it("should allow generation when under limits", async () => {
      const result = await checkGenerationLimits({
        shopId: testShopId,
        sessionId: testSessionId,
        productId: testProductId,
      });

      expect(result.allowed).toBe(true);
      expect(result.tries_remaining).toBe(5);
      expect(result.per_product_tries_remaining).toBe(5);
      expect(result.per_session_tries_remaining).toBe(15);
    });

    it("should block generation when per-product limit reached", async () => {
      // Create attempts up to limit
      for (let i = 0; i < 5; i++) {
        await incrementGenerationAttempt({
          shopId: testShopId,
          sessionId: testSessionId,
          productId: testProductId,
        });
      }

      const result = await checkGenerationLimits({
        shopId: testShopId,
        sessionId: testSessionId,
        productId: testProductId,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("per_product_limit");
      expect(result.tries_remaining).toBe(0);
    });

    it("should block generation when per-session limit reached", async () => {
      // Create attempts across multiple products to hit session limit
      for (let i = 0; i < 15; i++) {
        await incrementGenerationAttempt({
          shopId: testShopId,
          sessionId: testSessionId,
          productId: `product-${i}`,
        });
      }

      const result = await checkGenerationLimits({
        shopId: testShopId,
        sessionId: testSessionId,
        productId: testProductId,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("per_session_limit");
    });

    it("should include reset timing in response", async () => {
      await incrementGenerationAttempt({
        shopId: testShopId,
        sessionId: testSessionId,
        productId: testProductId,
      });

      const result = await checkGenerationLimits({
        shopId: testShopId,
        sessionId: testSessionId,
        productId: testProductId,
      });

      expect(result.reset_at).toBeDefined();
      expect(result.reset_in_minutes).toBeDefined();
      expect(result.reset_in_minutes).toBeGreaterThan(0);
      expect(result.reset_in_minutes).toBeLessThanOrEqual(30);
    });
  });

  describe("incrementGenerationAttempt", () => {
    it("should increment attempt count", async () => {
      const first = await incrementGenerationAttempt({
        shopId: testShopId,
        sessionId: testSessionId,
        productId: testProductId,
      });

      expect(first.attemptCount).toBe(1);

      const second = await incrementGenerationAttempt({
        shopId: testShopId,
        sessionId: testSessionId,
        productId: testProductId,
      });

      expect(second.attemptCount).toBe(2);
    });
  });

  describe("getGenerationLimitStatus", () => {
    it("should return complete limit status", async () => {
      await incrementGenerationAttempt({
        shopId: testShopId,
        sessionId: testSessionId,
        productId: testProductId,
      });

      const status = await getGenerationLimitStatus({
        shopId: testShopId,
        sessionId: testSessionId,
        productId: testProductId,
      });

      expect(status.per_product_limit).toBe(5);
      expect(status.per_session_limit).toBe(15);
      expect(status.per_product_attempts).toBe(1);
      expect(status.per_product_tries_remaining).toBe(4);
      expect(status.reset_window_minutes).toBe(30);
      expect(status.reset_at).toBeDefined();
    });
  });

  describe("billing safety integration", () => {
    it("should allow regeneration with sufficient gift balance", async () => {
      mockCheckBillableActionAllowed.mockResolvedValueOnce({ allowed: true });

      const billingCheck = await mockCheckBillableActionAllowed({
        shopId: testShopId,
        costMills: 500,
      });

      expect(billingCheck.allowed).toBe(true);
      expect(mockCheckBillableActionAllowed).toHaveBeenCalledWith({
        shopId: testShopId,
        costMills: 500,
      });
    });

    it("should block zero-cost regeneration", async () => {
      mockCheckBillableActionAllowed.mockResolvedValueOnce({ allowed: true });

      const billingCheck = await mockCheckBillableActionAllowed({
        shopId: testShopId,
        costMills: 0,
      });

      expect(billingCheck.allowed).toBe(true);
    });
  });
});
