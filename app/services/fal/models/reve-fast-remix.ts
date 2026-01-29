/**
 * Reve Fast Remix model adapter.
 *
 * Implements ModelAdapter for fal-ai/reve/fast/remix.
 *
 * API Reference: https://fal.ai/models/fal-ai/reve/fast/remix/llms.txt
 */

import { falClient, mapFalError } from "../client.server";
import {
  GenerationError,
  type GenerationInput,
  type GenerationOutput,
  type ModelAdapter,
  type ModelConfig,
} from "../types";
import {
  MVP_PRICE_USD_PER_GENERATION,
  REVE_FAST_REMIX_DISPLAY_NAME,
  REVE_FAST_REMIX_MODEL_ID,
} from "../../../lib/generation-settings";
import logger from "../../../lib/logger";

/**
 * Model configuration for Reve Fast Remix.
 */
const REVE_FAST_REMIX_CONFIG: ModelConfig = {
  modelId: REVE_FAST_REMIX_MODEL_ID,
  displayName: REVE_FAST_REMIX_DISPLAY_NAME,
  pricePerImage: MVP_PRICE_USD_PER_GENERATION,
  maxImagesPerRequest: 4, // fal.ai limit: 1-4 per request
  supportsImageSize: false,
};

/**
 * fal.ai response shape for Reve Fast Remix.
 */
interface ReveResponse {
  images: Array<{
    url: string;
    width?: number;
    height?: number;
    content_type?: string;
  }>;
  timings?: {
    inference?: number;
  };
  seed?: number; // Not explicitly documented but common in fal models
}

/**
 * Reve Fast Remix model adapter implementation.
 */
export const reveFastRemixAdapter: ModelAdapter = {
  config: REVE_FAST_REMIX_CONFIG,

  async generate(input: GenerationInput): Promise<GenerationOutput> {
    const { imageUrls, prompt, numImages, seed, aspectRatio } = input;

    // Validate input
    if (!imageUrls.length) {
      throw new GenerationError(
        "invalid_input",
        "At least one input image is required.",
        false,
      );
    }

    if (!prompt.trim()) {
      throw new GenerationError("invalid_input", "Prompt is required.", false);
    }

    if (
      numImages < 1 ||
      numImages > REVE_FAST_REMIX_CONFIG.maxImagesPerRequest
    ) {
      throw new GenerationError(
        "invalid_input",
        `Number of images must be between 1 and ${REVE_FAST_REMIX_CONFIG.maxImagesPerRequest}.`,
        false,
      );
    }

    const startTime = performance.now();

    try {
      logger.info(
        {
          model_id: REVE_FAST_REMIX_CONFIG.modelId,
          num_images: numImages,
          input_image_count: imageUrls.length,
          aspect_ratio: aspectRatio,
        },
        "Starting fal.ai generation",
      );

      // Call fal.ai API
      // Note: This model does NOT support image_size, only aspect_ratio
      const result = (await falClient.subscribe(
        REVE_FAST_REMIX_CONFIG.modelId,
        {
          input: {
            prompt,
            image_urls: imageUrls,
            num_images: numImages,
            // Only pass aspect_ratio if provided (it's optional in schema)
            ...(aspectRatio && { aspect_ratio: aspectRatio }),
            // Pass seed if provided
            ...(seed !== undefined && { seed }),
            output_format: "png",
          },
          logs: false,
        },
      )) as { data: ReveResponse };

      const endTime = performance.now();
      const totalTimeSeconds = (endTime - startTime) / 1000;

      // Map response to GenerationOutput
      const images = result.data.images.map(
        (img: {
          url: string;
          width?: number;
          height?: number;
          content_type?: string;
        }) => ({
          url: img.url,
          // Distribute total time equally if no per-image timing
          generationTimeSeconds: result.data.timings?.inference
            ? result.data.timings.inference / result.data.images.length
            : totalTimeSeconds / result.data.images.length,
          costUsd: REVE_FAST_REMIX_CONFIG.pricePerImage,
          seed: result.data.seed,
        }),
      );

      const output: GenerationOutput = {
        images,
        totalTimeSeconds,
        totalCostUsd: images.length * REVE_FAST_REMIX_CONFIG.pricePerImage,
      };

      logger.info(
        {
          model_id: REVE_FAST_REMIX_CONFIG.modelId,
          generated_count: images.length,
          total_time_seconds: totalTimeSeconds.toFixed(2),
          total_cost_usd: output.totalCostUsd.toFixed(2),
        },
        "fal.ai generation completed",
      );

      return output;
    } catch (error) {
      logger.error(
        {
          model_id: REVE_FAST_REMIX_CONFIG.modelId,
          err: error instanceof Error ? error.message : "Unknown error",
        },
        "fal.ai generation failed",
      );

      throw mapFalError(error);
    }
  },
};
