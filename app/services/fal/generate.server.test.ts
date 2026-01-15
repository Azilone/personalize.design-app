/**
 * Tests for unified image generation entry point.
 *
 * Tests verify that generateImages correctly:
 * - Validates inputs
 * - Looks up and delegates to model adapters
 * - Handles errors appropriately
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateImages } from "./generate.server";
import { GenerationError } from "./types";

// Mock the registry and adapter
vi.mock("./registry", () => ({
  getModelAdapter: vi.fn(),
}));

vi.mock("../../lib/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getModelAdapter } from "./registry";
import type { ModelAdapter } from "./types";

const mockAdapter: ModelAdapter = {
  config: {
    modelId: "test-model",
    displayName: "Test Model",
    pricePerImage: 0.05,
    maxImagesPerRequest: 4,
  },
  generate: vi.fn(),
};

describe("generateImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getModelAdapter).mockReturnValue(mockAdapter);
  });

  it("should generate images successfully", async () => {
    const mockOutput = {
      images: [
        {
          url: "https://example.com/image1.jpg",
          generationTimeSeconds: 3.2,
          costUsd: 0.05,
        },
        {
          url: "https://example.com/image2.jpg",
          generationTimeSeconds: 3.1,
          costUsd: 0.05,
        },
      ],
      totalTimeSeconds: 6.3,
      totalCostUsd: 0.1,
    };

    vi.mocked(mockAdapter.generate).mockResolvedValue(mockOutput);

    const result = await generateImages({
      modelId: "test-model",
      imageUrls: ["https://example.com/input.jpg"],
      prompt: "A beautiful landscape",
      numImages: 2,
      shopId: "shop-123",
    });

    expect(result).toEqual(mockOutput);
    expect(mockAdapter.generate).toHaveBeenCalledWith({
      imageUrls: ["https://example.com/input.jpg"],
      prompt: "A beautiful landscape",
      numImages: 2,
      seed: undefined,
    });
  });

  it("should throw GenerationError if modelId is missing", async () => {
    await expect(
      generateImages({
        modelId: "",
        imageUrls: ["https://example.com/input.jpg"],
        prompt: "Test",
        numImages: 1,
        shopId: "shop-123",
      }),
    ).rejects.toThrow(GenerationError);

    await expect(
      generateImages({
        modelId: "",
        imageUrls: ["https://example.com/input.jpg"],
        prompt: "Test",
        numImages: 1,
      }),
    ).rejects.toThrow("Model ID is required.");
  });

  it("should throw GenerationError if numImages is below 1", async () => {
    await expect(
      generateImages({
        modelId: "test-model",
        imageUrls: ["https://example.com/input.jpg"],
        prompt: "Test",
        numImages: 0,
        shopId: "shop-123",
      }),
    ).rejects.toThrow(GenerationError);

    await expect(
      generateImages({
        modelId: "test-model",
        imageUrls: ["https://example.com/input.jpg"],
        prompt: "Test",
        numImages: 0,
      }),
    ).rejects.toThrow("Number of images must be between 1 and 4.");
  });

  it("should throw GenerationError if numImages is above 4", async () => {
    await expect(
      generateImages({
        modelId: "test-model",
        imageUrls: ["https://example.com/input.jpg"],
        prompt: "Test",
        numImages: 5,
        shopId: "shop-123",
      }),
    ).rejects.toThrow(GenerationError);

    await expect(
      generateImages({
        modelId: "test-model",
        imageUrls: ["https://example.com/input.jpg"],
        prompt: "Test",
        numImages: 5,
      }),
    ).rejects.toThrow("Number of images must be between 1 and 4.");
  });

  it("should re-throw GenerationError from adapter", async () => {
    const mockError = new GenerationError(
      "provider_error",
      "Model failed",
      true,
    );

    vi.mocked(mockAdapter.generate).mockRejectedValue(mockError);

    await expect(
      generateImages({
        modelId: "test-model",
        imageUrls: ["https://example.com/input.jpg"],
        prompt: "Test",
        numImages: 1,
        shopId: "shop-123",
      }),
    ).rejects.toThrow(GenerationError);

    await expect(
      generateImages({
        modelId: "test-model",
        imageUrls: ["https://example.com/input.jpg"],
        prompt: "Test",
        numImages: 1,
      }),
    ).rejects.toThrow("Model failed");
  });

  it("should wrap unknown errors as GenerationError", async () => {
    vi.mocked(mockAdapter.generate).mockRejectedValue(
      new Error("Unknown error"),
    );

    await expect(
      generateImages({
        modelId: "test-model",
        imageUrls: ["https://example.com/input.jpg"],
        prompt: "Test",
        numImages: 1,
        shopId: "shop-123",
      }),
    ).rejects.toThrow(GenerationError);

    await expect(
      generateImages({
        modelId: "test-model",
        imageUrls: ["https://example.com/input.jpg"],
        prompt: "Test",
        numImages: 1,
      }),
    ).rejects.toThrow("An unexpected error occurred");
  });

  it("should pass seed to adapter if provided", async () => {
    const mockOutput = {
      images: [
        {
          url: "https://example.com/image.jpg",
          generationTimeSeconds: 3.0,
          costUsd: 0.05,
          seed: 12345,
        },
      ],
      totalTimeSeconds: 3.0,
      totalCostUsd: 0.05,
    };

    vi.mocked(mockAdapter.generate).mockResolvedValue(mockOutput);

    await generateImages({
      modelId: "test-model",
      imageUrls: ["https://example.com/input.jpg"],
      prompt: "Test",
      numImages: 1,
      seed: 12345,
      shopId: "shop-123",
    });

    expect(mockAdapter.generate).toHaveBeenCalledWith({
      imageUrls: ["https://example.com/input.jpg"],
      prompt: "Test",
      numImages: 1,
      seed: 12345,
    });
  });
});
