import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPrintifyVariantPrintArea } from "./print-area.server";
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

describe("getPrintifyVariantPrintArea", () => {
  it("returns the first print area when available", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 101,
            placeholders: [
              { position: "front", width: 1200, height: 1600 },
              { position: "back", width: 1100, height: 1500 },
            ],
          },
        ]),
        { status: 200 },
      ),
    );

    const result = await getPrintifyVariantPrintArea({
      shopId: "shop-1",
      blueprintId: 200,
      printProviderId: 300,
      variantId: 101,
    });

    expect(result).toEqual({
      position: "front",
      width: 1200,
      height: 1600,
    });
  });

  it("returns a specific print area when position is provided", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 101,
            placeholders: [
              { position: "front", width: 1200, height: 1600 },
              { position: "back", width: 1100, height: 1500 },
            ],
          },
        ]),
        { status: 200 },
      ),
    );

    const result = await getPrintifyVariantPrintArea({
      shopId: "shop-1",
      blueprintId: 200,
      printProviderId: 300,
      variantId: 101,
      position: "back",
    });

    expect(result).toEqual({
      position: "back",
      width: 1100,
      height: 1500,
    });
  });

  it("handles placeholders returned as an object", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 101,
            placeholders: {
              front: { position: "front", width: 1200, height: 1600 },
            },
          },
        ]),
        { status: 200 },
      ),
    );

    const result = await getPrintifyVariantPrintArea({
      shopId: "shop-1",
      blueprintId: 200,
      printProviderId: 300,
      variantId: 101,
    });

    expect(result).toEqual({
      position: "front",
      width: 1200,
      height: 1600,
    });
  });

  it("handles variants wrapped in a data object", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 101,
              placeholders: [
                { position: "front", width: 1200, height: 1600 },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await getPrintifyVariantPrintArea({
      shopId: "shop-1",
      blueprintId: 200,
      printProviderId: 300,
      variantId: 101,
    });

    expect(result).toEqual({
      position: "front",
      width: 1200,
      height: 1600,
    });
  });
});
