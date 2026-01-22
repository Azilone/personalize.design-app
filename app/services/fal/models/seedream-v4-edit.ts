/**
 * Seedream v4 Edit model adapter.
 *
 * Implements ModelAdapter for fal-ai/bytedance/seedream/v4/edit.
 * This is the only model available in MVP.
 *
 * API Reference: https://fal.ai/models/fal-ai/bytedance/seedream/v4/edit/llms.txt
 */

import { falClient, mapFalError } from "../client.server";
import {
  GenerationError,
  type GenerationInput,
  type GenerationOutput,
  type ModelAdapter,
  type ModelConfig,
} from "../types";
import { MVP_PRICE_USD_PER_GENERATION } from "../../../lib/generation-settings";
import logger from "../../../lib/logger";

/**
 * Model configuration for Seedream v4 Edit.
 */
const SEEDREAM_V4_EDIT_CONFIG: ModelConfig = {
  modelId: "fal-ai/bytedance/seedream/v4/edit",
  displayName: "Seedream v4 Edit (fal.ai)",
  pricePerImage: MVP_PRICE_USD_PER_GENERATION,
  maxImagesPerRequest: 6, // fal.ai limit: 1-6 per request
};

/**
 * fal.ai response shape for Seedream v4 Edit.
 */
interface SeedreamResponse {
  images: Array<{
    url: string;
    width?: number;
    height?: number;
    content_type?: string;
  }>;
  seed: number;
  timings?: {
    inference?: number;
  };
}

/**
 * Seedream v4 Edit model adapter implementation.
 */
export const seedreamV4EditAdapter: ModelAdapter = {
  config: SEEDREAM_V4_EDIT_CONFIG,

  async generate(input: GenerationInput): Promise<GenerationOutput> {
    const { imageUrls, prompt, numImages, seed, imageSize } = input;

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
      numImages > SEEDREAM_V4_EDIT_CONFIG.maxImagesPerRequest
    ) {
      throw new GenerationError(
        "invalid_input",
        `Number of images must be between 1 and ${SEEDREAM_V4_EDIT_CONFIG.maxImagesPerRequest}.`,
        false,
      );
    }

    const startTime = performance.now();

    try {
      logger.info(
        {
          model_id: SEEDREAM_V4_EDIT_CONFIG.modelId,
          num_images: numImages,
          input_image_count: imageUrls.length,
        },
        "Starting fal.ai generation",
      );

      // Call fal.ai API
      const result = (await falClient.subscribe(
        SEEDREAM_V4_EDIT_CONFIG.modelId,
        {
          input: {
            prompt,
            image_urls: imageUrls,
            num_images: numImages,
            ...(seed !== undefined && { seed }),
            ...(imageSize && { image_size: imageSize }),
          },
          logs: false,
          // Note: @fal-ai/client handles timeout internally
        },
      )) as { data: SeedreamResponse };

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
          costUsd: SEEDREAM_V4_EDIT_CONFIG.pricePerImage,
          seed: result.data.seed,
        }),
      );

      const output: GenerationOutput = {
        images,
        totalTimeSeconds,
        totalCostUsd: images.length * SEEDREAM_V4_EDIT_CONFIG.pricePerImage,
      };

      logger.info(
        {
          model_id: SEEDREAM_V4_EDIT_CONFIG.modelId,
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
          model_id: SEEDREAM_V4_EDIT_CONFIG.modelId,
          err: error instanceof Error ? error.message : "Unknown error",
        },
        "fal.ai generation failed",
      );

      throw mapFalError(error);
    }
  },
};

/**
 * Export config for registry.
 */
export const config = SEEDREAM_V4_EDIT_CONFIG;
