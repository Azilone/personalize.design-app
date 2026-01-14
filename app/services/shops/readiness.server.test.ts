import { beforeEach, describe, expect, it, vi } from "vitest";
import { getShopReadinessSignals } from "./readiness.server";
import { getSpendSafetySettings } from "./spend-safety.server";
import { getStorefrontPersonalizationSettings } from "./storefront-personalization.server";
import { getPrintifyIntegration } from "../printify/integration.server";

vi.mock("./spend-safety.server", () => ({
  getSpendSafetySettings: vi.fn(),
}));
vi.mock("./storefront-personalization.server", () => ({
  getStorefrontPersonalizationSettings: vi.fn(),
}));
vi.mock("../printify/integration.server", () => ({
  getPrintifyIntegration: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(getSpendSafetySettings).mockResolvedValue({
    monthlyCapCents: null,
    paidUsageConsentAt: null,
  });
  vi.mocked(getStorefrontPersonalizationSettings).mockResolvedValue({
    enabled: null,
  });
  vi.mocked(getPrintifyIntegration).mockResolvedValue(null);
});

describe("getShopReadinessSignals", () => {
  it("marks Printify disconnected when integration is missing", async () => {
    const result = await getShopReadinessSignals("shop-1");

    expect(result.printifyConnected).toBe(false);
  });

  it("marks Printify connected when integration exists", async () => {
    vi.mocked(getPrintifyIntegration).mockResolvedValue({
      shopId: "shop-1",
      printifyShopId: "123",
      printifyShopTitle: "Primary",
      printifySalesChannel: "etsy",
      createdAt: new Date("2026-01-14T00:00:00.000Z"),
      updatedAt: new Date("2026-01-14T00:00:00.000Z"),
    });

    const result = await getShopReadinessSignals("shop-1");

    expect(result.printifyConnected).toBe(true);
  });
});
