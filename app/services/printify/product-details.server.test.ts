import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPrintifyProductDetails } from "./product-details.server";
import { getPrintifyIntegrationWithToken } from "./integration.server";
import { decryptPrintifyToken } from "./token-encryption.server";

vi.mock("./integration.server", () => ({
  getPrintifyIntegrationWithToken: vi.fn(),
}));

vi.mock("./token-encryption.server", () => ({
  decryptPrintifyToken: vi.fn(),
}));

const mockIntegration = {
  shopId: "shop-1",
  printifyShopId: "printify-123",
  printifyShopTitle: "Printify Shop",
  printifySalesChannel: "shopify",
  encryptedToken: {
    ciphertext: "cipher",
    iv: "iv",
    authTag: "tag",
  },
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.PRINTIFY_USER_AGENT = "test-agent";
  vi.mocked(getPrintifyIntegrationWithToken).mockResolvedValue(mockIntegration);
  vi.mocked(decryptPrintifyToken).mockReturnValue("token-123");
});

describe("getPrintifyProductDetails", () => {
  it("returns blueprint and variant details", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "product-1",
          blueprint_id: 44,
          print_provider_id: 99,
          variants: [
            { id: 101, price: 2500, is_enabled: true },
            { id: 102, price: 2600, is_enabled: false },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await getPrintifyProductDetails("shop-1", "product-1");

    expect(result).toEqual({
      blueprintId: 44,
      printProviderId: 99,
      variants: [
        { id: 101, price: 2500, isEnabled: true },
        { id: 102, price: 2600, isEnabled: false },
      ],
    });
  });
});
