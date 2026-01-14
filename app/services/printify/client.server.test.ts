import { describe, expect, it, beforeEach, vi } from "vitest";
import { PrintifyRequestError, validatePrintifyToken } from "./client.server";

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.PRINTIFY_USER_AGENT = "test-agent";
});

describe("validatePrintifyToken", () => {
  it("validates token and returns the first shop", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify([
            { id: 123, title: "Primary", sales_channel: "etsy" },
          ]),
          { status: 200 },
        ),
      );

    const result = await validatePrintifyToken("token-123");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.printify.com/v1/shops.json",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer token-123",
          "User-Agent": "test-agent",
        }),
      }),
    );
    expect(result).toEqual({
      shopId: "123",
      shopTitle: "Primary",
      salesChannel: "etsy",
    });
  });

  it("throws for invalid tokens", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Unauthorized", { status: 401 }),
    );

    await expect(validatePrintifyToken("bad-token")).rejects.toMatchObject({
      code: "invalid_token",
    });
  });

  it("throws when rate limited", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Too Many", { status: 429 }),
    );

    await expect(validatePrintifyToken("token")).rejects.toMatchObject({
      code: "rate_limited",
    });
  });

  it("throws when no shops are returned", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    await expect(validatePrintifyToken("token")).rejects.toMatchObject({
      code: "no_shops",
    });
  });

  it("throws for unexpected responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Server error", { status: 500 }),
    );

    await expect(validatePrintifyToken("token")).rejects.toMatchObject({
      code: "unexpected_response",
    });
  });

  it("exposes a typed error instance", () => {
    expect(new PrintifyRequestError("invalid_token", "message")).toBeInstanceOf(
      Error,
    );
  });
});
