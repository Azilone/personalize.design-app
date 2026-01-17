/**
 * Tests for unified image generation entry point.
 *
 * Tests verify that generateImages correctly:
 * - Validates inputs
 * - Looks up and delegates to model adapters
 * - Handles errors appropriately
 * - Applies background removal post-processing when enabled
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateImages } from "./generate.server";
import { GenerationError } from "./types";

// Mock registry and adapter
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

vi.mock("./models/birefnet-v2", () => ({
  removeBackground: vi.fn(),
  BIREFNET_V2_MODEL_ID: "fal-ai/birefnet/v2",
}));

import { getModelAdapter } from "./registry";
import type { ModelAdapter } from "./types";
import { removeBackground } from "./models/birefnet-v2";

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

  it("should apply background removal post-processing when enabled", async () => {
    const mockOutput = {
      images: [
        {
          url: "https://example.com/generated.jpg",
          generationTimeSeconds: 4.5,
          costUsd: 0.05,
        },
      ],
      totalTimeSeconds: 4.5,
      totalCostUsd: 0.05,
    };

    vi.mocked(mockAdapter.generate).mockResolvedValue(mockOutput);
    vi.mocked(removeBackground).mockResolvedValue({
      imageUrl: "https://example.com/removed-bg.jpg",
      timeSeconds: 2.5,
      costUsd: 0.025,
    });

    const result = await generateImages({
      modelId: "test-model",
      imageUrls: ["https://example.com/input.jpg"],
      prompt: "A beautiful landscape",
      numImages: 1,
      shopId: "shop-123",
      removeBackgroundEnabled: true,
    });

    // Verify removeBackground was called with generated image URL
    expect(removeBackground).toHaveBeenCalledWith(
      "https://example.com/generated.jpg",
      "shop-123",
      undefined,
    );

    // Verify adapter used original input images
    expect(mockAdapter.generate).toHaveBeenCalledWith({
      imageUrls: ["https://example.com/input.jpg"],
      prompt: "A beautiful landscape",
      numImages: 1,
      seed: undefined,
    });

    // Verify total cost includes remove-bg cost
    expect(result.totalCostUsd).toBeCloseTo(0.075, 0.001);
    expect(result.totalTimeSeconds).toBeGreaterThan(4.5);

    // Verify per-image cost breakdown
    expect(result.images[0].costUsd).toBeCloseTo(0.075, 0.001);
    expect(result.images[0].generationCostUsd).toBe(0.05);
    expect(result.images[0].removeBgCostUsd).toBeCloseTo(0.025, 0.001);

    // Verify background-removed image is returned
    expect(result.images[0].url).toBe("https://example.com/removed-bg.jpg");
  });

  it("should distribute remove-bg cost across multiple images", async () => {
    const mockOutput = {
      images: [
        {
          url: "https://example.com/generated1.jpg",
          generationTimeSeconds: 3.2,
          costUsd: 0.05,
        },
        {
          url: "https://example.com/generated2.jpg",
          generationTimeSeconds: 3.1,
          costUsd: 0.05,
        },
        {
          url: "https://example.com/generated3.jpg",
          generationTimeSeconds: 3.3,
          costUsd: 0.05,
        },
      ],
      totalTimeSeconds: 9.6,
      totalCostUsd: 0.15,
    };

    vi.mocked(mockAdapter.generate).mockResolvedValue(mockOutput);
    vi.mocked(removeBackground).mockImplementation((url) =>
      Promise.resolve({
        imageUrl: `${url}?bg=removed`,
        timeSeconds: 2.0,
        costUsd: 0.025,
      }),
    );

    const result = await generateImages({
      modelId: "test-model",
      imageUrls: [
        "https://example.com/input1.jpg",
        "https://example.com/input2.jpg",
        "https://example.com/input3.jpg",
      ],
      prompt: "Beautiful landscapes",
      numImages: 3,
      shopId: "shop-123",
      removeBackgroundEnabled: true,
    });

    // Verify total remove-bg cost is 3 x $0.025
    expect(result.totalCostUsd).toBeCloseTo(0.225, 0.001);

    // Verify each image has $0.05 generation + $0.025 remove-bg
    result.images.forEach((img) => {
      expect(img.costUsd).toBeCloseTo(0.075, 0.001);
      expect(img.generationCostUsd).toBe(0.05);
      expect(img.removeBgCostUsd).toBeCloseTo(0.025, 0.001);
    });

    // Verify all three removeBackground calls were made
    expect(removeBackground).toHaveBeenCalledTimes(3);

    // Verify output URLs are replaced by remove-bg results
    expect(result.images[0].url).toBe(
      "https://example.com/generated1.jpg?bg=removed",
    );
    expect(result.images[1].url).toBe(
      "https://example.com/generated2.jpg?bg=removed",
    );
    expect(result.images[2].url).toBe(
      "https://example.com/generated3.jpg?bg=removed",
    );
  });

  it("should not add remove-bg cost when disabled", async () => {
    const mockOutput = {
      images: [
        {
          url: "https://example.com/generated.jpg",
          generationTimeSeconds: 4.5,
          costUsd: 0.05,
        },
      ],
      totalTimeSeconds: 4.5,
      totalCostUsd: 0.05,
    };

    vi.mocked(mockAdapter.generate).mockResolvedValue(mockOutput);

    const result = await generateImages({
      modelId: "test-model",
      imageUrls: ["https://example.com/input.jpg"],
      prompt: "A beautiful landscape",
      numImages: 1,
      shopId: "shop-123",
      removeBackgroundEnabled: false,
    });

    // Verify removeBackground was NOT called
    expect(removeBackground).not.toHaveBeenCalled();

    // Verify original input images were passed to adapter
    expect(mockAdapter.generate).toHaveBeenCalledWith({
      imageUrls: ["https://example.com/input.jpg"],
      prompt: "A beautiful landscape",
      numImages: 1,
      seed: undefined,
    });

    // Verify cost breakdown is not present
    expect(result.images[0].costUsd).toBe(0.05);
    expect(result.images[0].generationCostUsd).toBeUndefined();
    expect(result.images[0].removeBgCostUsd).toBeUndefined();
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
