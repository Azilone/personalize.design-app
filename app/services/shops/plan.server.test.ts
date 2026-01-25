import { describe, expect, it, vi, beforeEach } from "vitest";
import { PlanStatus } from "@prisma/client";

// Mock shopify.server to prevent initialization error during import
vi.mock("../../shopify.server", () => ({
  authenticate: {
    admin: vi.fn(),
  },
}));

import { isPlanActive } from "./plan.server";

describe("plan.server", () => {
  beforeEach(() => {
    vi.stubEnv("SHOPIFY_API_KEY", "test_key");
    vi.stubEnv("SHOPIFY_API_SECRET", "test_secret");
    vi.stubEnv("SHOPIFY_APP_URL", "https://test.example.com");
    vi.stubEnv("SCOPES", "write_products");
  });

  describe("isPlanActive", () => {
    it("returns true for standard", () => {
      expect(isPlanActive(PlanStatus.standard)).toBe(true);
    });

    it("returns true for early_access", () => {
      expect(isPlanActive(PlanStatus.early_access)).toBe(true);
    });

    it("returns false for none", () => {
      expect(isPlanActive(PlanStatus.none)).toBe(false);
    });

    it("returns false for standard_pending", () => {
      expect(isPlanActive(PlanStatus.standard_pending)).toBe(false);
    });

    it("returns false for early_access_pending", () => {
      expect(isPlanActive(PlanStatus.early_access_pending)).toBe(false);
    });
  });
});
