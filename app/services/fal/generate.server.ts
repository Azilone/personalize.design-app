/**
 * Unified image generation entry point.
 *
 * Provides a single function for generating images that:
 * 1. Optionally applies background removal preprocessing
 * 2. Looks up the appropriate model adapter from registry
 * 3. Delegates generation to the model-specific adapter
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
  /** Apply background removal before generation */
  removeBackgroundEnabled?: boolean;
  /** Optional background removal configuration */
  removeBackgroundOptions?: RemoveBackgroundOptions;
}

/**
 * Generate images using fal.ai.
 *
 * This is the main entry point for image generation.
 * Handles optional background removal, adapter lookup, and
 * delegates to model-specific implementation.
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

  // Track additional costs and time from preprocessing
  let preprocessedImageUrls = imageUrls;
  let removeBgTotalCost = 0;
  let removeBgTotalTime = 0;

  // Step 1: Apply background removal if enabled
  if (removeBackgroundEnabled && imageUrls.length > 0) {
    logger.info(
      {
        shop_id: shopId,
        model_id: modelId,
        input_image_count: imageUrls.length,
      },
      "Applying background removal as preprocessing step",
    );

    try {
      // Process each input image through BiRefNet v2
      const removeBgResults = await Promise.all(
        imageUrls.map((url) =>
          removeBackground(
            url,
            shopId,
            removeBackgroundEnabled ? removeBackgroundOptions : undefined,
          ),
        ),
      );

      // Use the background-removed images for generation
      preprocessedImageUrls = removeBgResults.map((r) => r.imageUrl);
      removeBgTotalCost = removeBgResults.reduce(
        (sum, r) => sum + r.costUsd,
        0,
      );
      removeBgTotalTime = removeBgResults.reduce(
        (sum, r) => sum + r.timeSeconds,
        0,
      );

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
      // Log and re-throw - background removal failure should fail whole operation
      logger.error(
        {
          shop_id: shopId,
          model_id: modelId,
          err: error instanceof Error ? error.message : "Unknown error",
        },
        "Background removal failed during preprocessing",
      );

      // Throw with specific error code for UI handling
      const errorMessage =
        error instanceof Error && error.message.includes("invalid_input")
          ? "Failed to remove background. The image format may not be supported."
          : "Failed to remove background from image. Please try a different photo.";

      throw new GenerationError("remove_bg_failed", errorMessage, false);
    }
  }

  // Step 2: Prepare input for generation
  const input: GenerationInput = {
    imageUrls: preprocessedImageUrls,
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

    // Combine costs and times from preprocessing + generation
    const totalCostUsd = output.totalCostUsd + removeBgTotalCost;
    const totalTimeSeconds = output.totalTimeSeconds + removeBgTotalTime;

    // Update per-image costs if remove-bg was applied
    // Note: Remove-bg cost is divided by INPUT images, not output images.
    // This is correct because background removal happens once per input image,
    // regardless of how many outputs are generated from each input.
    // Example: 2 inputs with 4 outputs → remove-bg cost split 50/50 across the 4 outputs
    // (each output inherits half of its input's remove-bg cost)
    const updatedImages = removeBackgroundEnabled
      ? output.images.map((img) => ({
          ...img,
          costUsd: Number(
            (img.costUsd + removeBgTotalCost / imageUrls.length).toFixed(3),
          ),
          generationCostUsd: img.costUsd,
          removeBgCostUsd: Number(
            (removeBgTotalCost / imageUrls.length).toFixed(3),
          ),
        }))
      : output.images;

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
