/**
 * Unified image generation entry point.
 *
 * Provides a single function for generating images that:
 * 1. Looks up the appropriate model adapter from registry
 * 2. Delegates generation to the model-specific adapter
 * 3. Optionally applies background removal post-processing
 * 4. Returns standardized GenerationOutput with total costs
 *
 * This is the main API for the rest of the application.
 */

import { getModelAdapter } from "./registry";
import {
  GenerationError,
  type GenerationInput,
  type GenerationOutput,
} from "./types";
import {
  removeBackground,
  type RemoveBackgroundOptions,
} from "./models/birefnet-v2";
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
  /** Apply background removal after generation */
  removeBackgroundEnabled?: boolean;
  /** Optional background removal configuration */
  removeBackgroundOptions?: RemoveBackgroundOptions;
}

/**
 * Generate images using fal.ai.
 *
 * This is the main entry point for image generation.
 * Handles optional background removal (post-processing), adapter lookup,
 * and delegates to model-specific implementation.
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
 *   removeBackgroundEnabled: true,
 * });
 * ```
 */
export async function generateImages(
  options: GenerateOptions,
): Promise<GenerationOutput> {
  const {
    modelId,
    imageUrls,
    prompt,
    numImages,
    seed,
    shopId,
    removeBackgroundEnabled = false,
    removeBackgroundOptions,
  } = options;

  logger.info(
    {
      shop_id: shopId,
      remove_bg_enabled: removeBackgroundEnabled,
      image_count: imageUrls.length,
    },
    "generateImages called",
  );

  // Validate basic inputs before lookup
  if (!modelId) {
    throw new GenerationError("invalid_input", "Model ID is required.", false);
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

  // Track additional costs and time from post-processing
  let removeBgTotalCost = 0;
  let removeBgTotalTime = 0;

  // Step 1: Prepare input for generation
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
      remove_bg_enabled: removeBackgroundEnabled,
    },
    "Starting image generation",
  );

  try {
    const output = await adapter.generate(input);

    let imagesWithRemoveBg = output.images;
    if (removeBackgroundEnabled && output.images.length > 0) {
      logger.info(
        {
          shop_id: shopId,
          model_id: modelId,
          generated_count: output.images.length,
        },
        "Applying background removal as post-processing step",
      );

      try {
        const removeBgResults = await Promise.all(
          output.images.map((img) =>
            removeBackground(
              img.url,
              shopId,
              removeBackgroundEnabled ? removeBackgroundOptions : undefined,
            ),
          ),
        );

        removeBgTotalCost = removeBgResults.reduce(
          (sum, result) => sum + result.costUsd,
          0,
        );
        removeBgTotalTime = removeBgResults.reduce(
          (sum, result) => sum + result.timeSeconds,
          0,
        );

        imagesWithRemoveBg = output.images.map((img, index) => ({
          ...img,
          url: removeBgResults[index]?.imageUrl ?? img.url,
        }));

        logger.info(
          {
            shop_id: shopId,
            model_id: modelId,
            remove_bg_cost: removeBgTotalCost.toFixed(3),
            remove_bg_time: removeBgTotalTime.toFixed(2),
          },
          "Background removal completed",
        );
      } catch (error) {
        logger.error(
          {
            shop_id: shopId,
            model_id: modelId,
            err: error instanceof Error ? error.message : "Unknown error",
          },
          "Background removal failed during post-processing",
        );

        const errorMessage =
          error instanceof Error && error.message.includes("invalid_input")
            ? "Failed to remove background. The image format may not be supported."
            : "Failed to remove background from image. Please try a different photo.";

        throw new GenerationError("remove_bg_failed", errorMessage, false);
      }
    }

    // Combine costs and times from generation + post-processing
    const totalCostUsd = output.totalCostUsd + removeBgTotalCost;
    const totalTimeSeconds = output.totalTimeSeconds + removeBgTotalTime;

    // Update per-image costs if remove-bg was applied
    // Note: Remove-bg cost is divided by OUTPUT images.
    // Background removal happens once per output image.
    const updatedImages = removeBackgroundEnabled
      ? imagesWithRemoveBg.map((img) => ({
          ...img,
          costUsd: Number(
            (
              img.costUsd +
              removeBgTotalCost / imagesWithRemoveBg.length
            ).toFixed(3),
          ),
          generationCostUsd: img.costUsd,
          removeBgCostUsd: Number(
            (removeBgTotalCost / imagesWithRemoveBg.length).toFixed(3),
          ),
        }))
      : imagesWithRemoveBg;

    const finalOutput: GenerationOutput = {
      images: updatedImages,
      totalTimeSeconds,
      totalCostUsd,
    };

    logger.info(
      {
        shop_id: shopId,
        model_id: modelId,
        generated_count: output.images.length,
        total_cost_usd: totalCostUsd,
        remove_bg_cost: removeBgTotalCost,
      },
      "Image generation completed",
    );

    return finalOutput;
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
