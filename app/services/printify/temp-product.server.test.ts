import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTempProduct, deleteProduct } from "./temp-product.server";
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

describe("createTempProduct", () => {
  it("uploads, creates, and fetches mockups", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "upload-1" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "product-1" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "product-1",
            images: [{ src: "https://cdn.test/mockup.png", type: "mockup" }],
          }),
          { status: 200 },
        ),
      );

    const result = await createTempProduct(
      "shop-1",
      100,
      200,
      [{ id: 1, price: 2500 }],
      { url: "https://cdn.test/art.png", position: "front" },
    );

    expect(result).toEqual({
      productId: "product-1",
      mockupUrls: ["https://cdn.test/mockup.png"],
      uploadId: "upload-1",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.printify.com/v1/uploads/images.json",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.printify.com/v1/shops/printify-123/products.json",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.printify.com/v1/shops/printify-123/products/product-1.json",
      expect.objectContaining({ method: "GET" }),
    );
  });
});

describe("deleteProduct", () => {
  it("deletes the product", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    await deleteProduct("shop-1", "product-9");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.printify.com/v1/shops/printify-123/products/product-9.json",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
