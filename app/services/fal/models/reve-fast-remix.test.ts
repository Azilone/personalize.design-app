import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { reveFastRemixAdapter } from "./reve-fast-remix";
import { falClient } from "../client.server";
import { GenerationError } from "../types";

// Mock the fal client
vi.mock("../client.server", async () => {
  const actual = await vi.importActual("../client.server");
  return {
    ...actual,
    falClient: {
      subscribe: vi.fn(),
    },
  };
});

describe("reveFastRemixAdapter", () => {
  const mockFalSubscribe = falClient.subscribe as unknown as ReturnType<
    typeof vi.fn
  >;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should have correct config", () => {
    expect(reveFastRemixAdapter.config.modelId).toBe("fal-ai/reve/fast/remix");
    expect(reveFastRemixAdapter.config.maxImagesPerRequest).toBe(4);
  });

  it("should generate images successfully", async () => {
    // Mock successful response
    const mockResponse = {
      data: {
        images: [
          {
            url: "https://example.com/image1.png",
            content_type: "image/png",
          },
        ],
        timings: {
          inference: 1.5,
        },
        seed: 12345,
      },
    };
    mockFalSubscribe.mockResolvedValue(mockResponse);

    const input = {
      imageUrls: ["https://example.com/input.jpg"],
      prompt: "test prompt",
      numImages: 1,
      aspectRatio: "16:9" as const,
    };

    const result = await reveFastRemixAdapter.generate(input);

    // Verify fal.ai call
    expect(mockFalSubscribe).toHaveBeenCalledWith(
      "fal-ai/reve/fast/remix",
      expect.objectContaining({
        input: {
          prompt: "test prompt",
          image_urls: ["https://example.com/input.jpg"],
          num_images: 1,
          aspect_ratio: "16:9", // Verify aspect_ratio is passed
          output_format: "png",
        },
      }),
    );

    // Verify output
    expect(result.images).toHaveLength(1);
    expect(result.images[0].url).toBe("https://example.com/image1.png");
    expect(result.images[0].seed).toBe(12345);
    expect(result.images[0].generationTimeSeconds).toBe(1.5);
    expect(result.totalCostUsd).toBe(0.05); // MVP price
  });

  it("should NOT pass image_size to fal.ai (unsupported)", async () => {
    mockFalSubscribe.mockResolvedValue({
      data: {
        images: [{ url: "https://example.com/image1.png" }],
      },
    });

    const input = {
      imageUrls: ["https://example.com/input.jpg"],
      prompt: "test prompt",
      numImages: 1,
      // Pass imageSize in input (e.g. from existing template logic)
      imageSize: { width: 1024, height: 1024 },
    };

    await reveFastRemixAdapter.generate(input);

    // Verify image_size is NOT in the payload
    expect(mockFalSubscribe).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        input: expect.not.objectContaining({
          image_size: expect.anything(),
        }),
      }),
    );
  });

  it("should throw error for invalid input (no images)", async () => {
    const input = {
      imageUrls: [],
      prompt: "test prompt",
      numImages: 1,
    };

    await expect(reveFastRemixAdapter.generate(input)).rejects.toThrow(
      GenerationError,
    );
  });

  it("should throw error for invalid input (no prompt)", async () => {
    const input = {
      imageUrls: ["https://example.com/input.jpg"],
      prompt: "   ",
      numImages: 1,
    };

    await expect(reveFastRemixAdapter.generate(input)).rejects.toThrow(
      GenerationError,
    );
  });
});
