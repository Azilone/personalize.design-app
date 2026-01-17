/**
 * Tests for BiRefNet v2 background removal module.
 *
 * Tests verify that removeBackground correctly:
 * - Validates inputs
 * - Maps options to fal.ai request
 * - Handles errors appropriately
 * - Returns correct response shape
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { removeBackground, BIREFNET_V2_MODEL_ID } from "./birefnet-v2";
import { GenerationError } from "../types";
import type { RemoveBackgroundOptions } from "./birefnet-v2";

// Mock fal client and logger
vi.mock("../client.server", () => ({
  falClient: {
    subscribe: vi.fn(),
  },
  mapFalError: vi.fn((error) => error),
}));

vi.mock("../../../lib/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../../lib/generation-settings", () => ({
  REMOVE_BG_PRICE_USD: 0.025,
}));

import { falClient, mapFalError } from "../client.server";

describe("removeBackground", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(falClient.subscribe).mockResolvedValue({
      data: {
        image: {
          url: "https://storage.googleapis.com/example/output.png",
          width: 1024,
          height: 1024,
          content_type: "image/png",
        },
      },
      requestId: "test-request-id",
    });
  });

  it("should remove background successfully with defaults", async () => {
    const result = await removeBackground(
      "https://example.com/input.jpg",
      "shop-123",
    );

    expect(result).toEqual({
      imageUrl: "https://storage.googleapis.com/example/output.png",
      timeSeconds: expect.any(Number),
      costUsd: 0.025,
    });
    expect(result.timeSeconds).toBeGreaterThanOrEqual(0);

    // Verify fal.ai was called with correct input
    expect(falClient.subscribe).toHaveBeenCalledWith(
      BIREFNET_V2_MODEL_ID,
      expect.objectContaining({
        input: {
          image_url: "https://example.com/input.jpg",
        },
        logs: false,
      }),
    );
  });

  it("should pass model variant option to fal.ai", async () => {
    await removeBackground("https://example.com/input.jpg", "shop-123", {
      model: "Portrait",
    });

    expect(falClient.subscribe).toHaveBeenCalledWith(
      BIREFNET_V2_MODEL_ID,
      expect.objectContaining({
        input: expect.objectContaining({
          image_url: "https://example.com/input.jpg",
          model: "Portrait",
        }),
      }),
    );
  });

  it("should pass operating resolution option to fal.ai", async () => {
    await removeBackground("https://example.com/input.jpg", "shop-123", {
      operatingResolution: "2048x2048",
    });

    expect(falClient.subscribe).toHaveBeenCalledWith(
      BIREFNET_V2_MODEL_ID,
      expect.objectContaining({
        input: expect.objectContaining({
          image_url: "https://example.com/input.jpg",
          operating_resolution: "2048x2048",
        }),
      }),
    );
  });

  it("should pass output format option to fal.ai", async () => {
    await removeBackground("https://example.com/input.jpg", "shop-123", {
      outputFormat: "webp",
    });

    expect(falClient.subscribe).toHaveBeenCalledWith(
      BIREFNET_V2_MODEL_ID,
      expect.objectContaining({
        input: expect.objectContaining({
          image_url: "https://example.com/input.jpg",
          output_format: "webp",
        }),
      }),
    );
  });

  it("should pass refine foreground option to fal.ai", async () => {
    await removeBackground("https://example.com/input.jpg", "shop-123", {
      refineForeground: false,
    });

    expect(falClient.subscribe).toHaveBeenCalledWith(
      BIREFNET_V2_MODEL_ID,
      expect.objectContaining({
        input: expect.objectContaining({
          image_url: "https://example.com/input.jpg",
          refine_foreground: false,
        }),
      }),
    );
  });

  it("should pass output mask option to fal.ai", async () => {
    vi.mocked(falClient.subscribe).mockResolvedValue({
      data: {
        image: {
          url: "https://storage.googleapis.com/example/output.png",
          width: 1024,
          height: 1024,
          content_type: "image/png",
        },
        mask_image: {
          url: "https://storage.googleapis.com/example/mask.png",
          width: 1024,
          height: 1024,
          content_type: "image/png",
        },
      },
      requestId: "test-request-id",
    });

    const result = await removeBackground(
      "https://example.com/input.jpg",
      "shop-123",
      {
        outputMask: true,
      },
    );

    expect(result).toEqual({
      imageUrl: "https://storage.googleapis.com/example/output.png",
      timeSeconds: expect.any(Number),
      costUsd: 0.025,
      maskUrl: "https://storage.googleapis.com/example/mask.png",
    });

    expect(falClient.subscribe).toHaveBeenCalledWith(
      BIREFNET_V2_MODEL_ID,
      expect.objectContaining({
        input: expect.objectContaining({
          image_url: "https://example.com/input.jpg",
          output_mask: true,
        }),
      }),
    );
  });

  it("should pass sync mode option to fal.ai", async () => {
    await removeBackground("https://example.com/input.jpg", "shop-123", {
      syncMode: true,
    });

    expect(falClient.subscribe).toHaveBeenCalledWith(
      BIREFNET_V2_MODEL_ID,
      expect.objectContaining({
        input: expect.objectContaining({
          image_url: "https://example.com/input.jpg",
          sync_mode: true,
        }),
      }),
    );
  });

  it("should pass multiple options to fal.ai", async () => {
    const options: RemoveBackgroundOptions = {
      model: "General Use (Heavy)",
      operatingResolution: "2048x2048",
      outputFormat: "webp",
      refineForeground: false,
      outputMask: true,
      syncMode: false,
    };

    await removeBackground(
      "https://example.com/input.jpg",
      "shop-123",
      options,
    );

    expect(falClient.subscribe).toHaveBeenCalledWith(
      BIREFNET_V2_MODEL_ID,
      expect.objectContaining({
        input: expect.objectContaining({
          image_url: "https://example.com/input.jpg",
          model: "General Use (Heavy)",
          operating_resolution: "2048x2048",
          output_format: "webp",
          refine_foreground: false,
          output_mask: true,
          sync_mode: false,
        }),
      }),
    );
  });

  it("should throw GenerationError if image URL is empty", async () => {
    await expect(removeBackground("", "shop-123")).rejects.toThrow(
      GenerationError,
    );

    await expect(removeBackground("   ", "shop-123")).rejects.toThrow(
      "Image URL is required for background removal.",
    );

    expect(falClient.subscribe).not.toHaveBeenCalled();
  });

  it("should map fal.ai errors using mapFalError", async () => {
    const mockError = new Error("fal.ai error");
    vi.mocked(falClient.subscribe).mockRejectedValue(mockError);
    vi.mocked(mapFalError).mockReturnValue(
      new GenerationError("provider_error", "Mapped error", true),
    );

    await expect(
      removeBackground("https://example.com/input.jpg", "shop-123"),
    ).rejects.toThrow("Mapped error");

    expect(mapFalError).toHaveBeenCalledWith(mockError);
  });

  it("should always return cost from constant", async () => {
    const result = await removeBackground(
      "https://example.com/input.jpg",
      "shop-123",
    );

    expect(result.costUsd).toBe(0.025);
  });

  it("should include mask URL in result when mask is returned", async () => {
    vi.mocked(falClient.subscribe).mockResolvedValue({
      data: {
        image: {
          url: "https://storage.googleapis.com/example/output.png",
        },
        mask_image: {
          url: "https://storage.googleapis.com/example/mask.png",
        },
      },
      requestId: "test-request-id",
    });

    const result = await removeBackground(
      "https://example.com/input.jpg",
      "shop-123",
    );

    expect(result.maskUrl).toBe(
      "https://storage.googleapis.com/example/mask.png",
    );
  });

  it("should not include mask URL when mask is not returned", async () => {
    vi.mocked(falClient.subscribe).mockResolvedValue({
      data: {
        image: {
          url: "https://storage.googleapis.com/example/output.png",
        },
      },
      requestId: "test-request-id",
    });

    const result = await removeBackground(
      "https://example.com/input.jpg",
      "shop-123",
    );

    expect(result.maskUrl).toBeUndefined();
  });

  it("should work without shopId", async () => {
    const result = await removeBackground(
      "https://example.com/input.jpg",
      undefined,
    );

    expect(result).toEqual({
      imageUrl: "https://storage.googleapis.com/example/output.png",
      timeSeconds: expect.any(Number),
      costUsd: 0.025,
    });
  });

  it("should measure performance time accurately", async () => {
    vi.mocked(falClient.subscribe).mockImplementation(
      async () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              data: {
                image: {
                  url: "https://storage.googleapis.com/example/output.png",
                },
              },
              requestId: "test-request-id",
            });
          }, 100);
        }),
    );

    const result = await removeBackground(
      "https://example.com/input.jpg",
      "shop-123",
    );

    expect(result.timeSeconds).toBeGreaterThan(0.08);
    expect(result.timeSeconds).toBeLessThan(0.3);
  });
});
