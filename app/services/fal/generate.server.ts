/**
 * Unified image generation entry point.
 *
 * Provides a single function for generating images that:
 * 1. Looks up the appropriate model adapter from registry
 * 2. Delegates generation to the model-specific adapter
 * 3. Returns standardized GenerationOutput
 *
 * This is the main API for the rest of the application.
 */

import { getModelAdapter } from "./registry";
import {
  GenerationError,
  type GenerationInput,
  type GenerationOutput,
} from "./types";
import logger from "../../lib/logger";

/**
 * Options for image generation.
 */
export interface GenerateOptions {
  /** Model identifier to use for generation */
  modelId: string;
  /** URL(s) of input image(s) */
  imageUrls: string[];
  /** Generation prompt */
  prompt: string;
  /** Number of images to generate (1-4 for MVP) */
  numImages: number;
  /** Optional seed for reproducibility */
  seed?: number;
  /** Shop ID for multi-tenancy logging */
  shopId?: string;
}

/**
 * Generate images using fal.ai.
 *
 * This is the main entry point for image generation.
 * Handles adapter lookup and delegates to model-specific implementation.
 *
 * @param options - Generation options
 * @returns Promise resolving to generation output
 * @throws GenerationError on failure
 *
 * @example
 * ```typescript
 * const result = await generateImages({
 *   modelId: 'fal-ai/bytedance/seedream/v4/edit',
 *   imageUrls: ['https://...'],
 *   prompt: 'A beautiful landscape',
 *   numImages: 2,
 *   shopId: 'shop-123',
 * });
 * ```
 */
export async function generateImages(
  options: GenerateOptions,
): Promise<GenerationOutput> {
  const { modelId, imageUrls, prompt, numImages, seed, shopId } = options;

  // Validate basic inputs before lookup
  if (!modelId) {
    throw new GenerationError(
      "invalid_input",
      "Model ID is required.",
      false,
    );
  }

  if (numImages < 1 || numImages > 4) {
    throw new GenerationError(
      "invalid_input",
      "Number of images must be between 1 and 4.",
      false,
    );
  }

  // Get adapter (throws if not found)
  const adapter = getModelAdapter(modelId);

  // Prepare input
  const input: GenerationInput = {
    imageUrls,
    prompt,
    numImages,
    seed,
  };

  logger.info(
    {
      shop_id: shopId,
      model_id: modelId,
      num_images: numImages,
    },
    "Starting image generation",
  );

  try {
    const output = await adapter.generate(input);

    logger.info(
      {
        shop_id: shopId,
        model_id: modelId,
        generated_count: output.images.length,
        total_cost_usd: output.totalCostUsd,
      },
      "Image generation completed",
    );

    return output;
  } catch (error) {
    // Re-throw GenerationErrors as-is
    if (error instanceof GenerationError) {
      logger.warn(
        {
          shop_id: shopId,
          model_id: modelId,
          error_code: error.code,
          retryable: error.retryable,
        },
        "Image generation failed with known error",
      );
      throw error;
    }

    // Wrap unknown errors
    logger.error(
      {
        shop_id: shopId,
        model_id: modelId,
        err: error instanceof Error ? error.message : "Unknown error",
      },
      "Image generation failed with unknown error",
    );

    throw new GenerationError(
      "unknown",
      "An unexpected error occurred. Please try again.",
      true,
    );
  }
}

// Re-export types for convenience
export {
  GenerationError,
  type GenerationInput,
  type GenerationOutput,
  type GeneratedImage,
} from "./types";
