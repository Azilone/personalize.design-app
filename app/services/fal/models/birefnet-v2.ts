/**
 * BiRefNet v2 background removal module.
 *
 * Implements background removal using fal-ai/birefnet/v2.
 * Used as a post-processing step after image generation when enabled.
 *
 * API Reference: https://fal.ai/models/fal-ai/birefnet/v2/llms.txt
 */

import { falClient, mapFalError } from "../client.server";
import { GenerationError } from "../types";
import { REMOVE_BG_PRICE_USD } from "../../../lib/generation-settings";
import logger from "../../../lib/logger";

/**
 * Model ID for BiRefNet v2.
 */
export const BIREFNET_V2_MODEL_ID = "fal-ai/birefnet/v2";

/**
 * Available model variants for BiRefNet v2.
 */
export type BiRefNetModel =
  | "General Use (Light)"
  | "General Use (Light 2K)"
  | "General Use (Heavy)"
  | "Matting"
  | "Portrait"
  | "General Use (Dynamic)";

/**
 * Available operating resolutions.
 */
export type OperatingResolution = "1024x1024" | "2048x2048" | "2304x2304";

/**
 * Available output formats.
 */
export type OutputFormat = "png" | "webp" | "gif";

/**
 * Optional configuration for background removal.
 */
export interface RemoveBackgroundOptions {
  /** Model variant (default: "General Use (Light)") */
  model?: BiRefNetModel;
  /** Operating resolution (default: "1024x1024") */
  operatingResolution?: OperatingResolution;
  /** Output format (default: "png") */
  outputFormat?: OutputFormat;
  /** Refine foreground (default: true) */
  refineForeground?: boolean;
  /** Output mask (default: false) */
  outputMask?: boolean;
  /** Sync mode for data URI response (default: false) */
  syncMode?: boolean;
}

/**
 * fal.ai response shape for BiRefNet v2.
 */
interface BiRefNetResponse {
  image: {
    url: string;
    width?: number;
    height?: number;
    content_type?: string;
  };
  mask_image?: {
    url: string;
    width?: number;
    height?: number;
    content_type?: string;
  };
}

/**
 * Result of background removal operation.
 */
export interface RemoveBackgroundResult {
  /** URL of the image with background removed */
  imageUrl: string;
  /** Processing time in seconds */
  timeSeconds: number;
  /** Cost in USD */
  costUsd: number;
  /** URL of the mask (if outputMask was enabled) */
  maskUrl?: string;
}

/**
 * Input shape for fal.ai BiRefNet v2 API.
 */
interface BiRefNetInput {
  image_url: string;
  model?: BiRefNetModel;
  operating_resolution?: OperatingResolution;
  output_format?: OutputFormat;
  refine_foreground?: boolean;
  output_mask?: boolean;
  sync_mode?: boolean;
}

/**
 * Remove background from an image using BiRefNet v2.
 *
 * @param imageUrl - URL of the image to process
 * @param shopId - Shop ID for logging
 * @param options - Optional configuration for background removal
 * @returns Promise resolving to the background-removed image result
 * @throws GenerationError on failure
 *
 * @example
 * ```typescript
 * // Basic usage (defaults)
 * const result = await removeBackground(
 *   'https://example.com/photo.jpg',
 *   'shop-123'
 * );
 * console.log(result.imageUrl); // URL with transparent background
 *
 * // Portrait with high resolution and WebP output
 * const result = await removeBackground(
 *   'https://example.com/photo.jpg',
 *   'shop-123',
 *   {
 *     model: 'Portrait',
 *     operatingResolution: '2048x2048',
 *     outputFormat: 'webp'
 *   }
 * );
 * ```
 */
export async function removeBackground(
  imageUrl: string,
  shopId?: string,
  options?: RemoveBackgroundOptions,
): Promise<RemoveBackgroundResult> {
  if (!imageUrl.trim()) {
    throw new GenerationError(
      "invalid_input",
      "Image URL is required for background removal.",
      false,
    );
  }

  const startTime = performance.now();

  try {
    logger.info(
      {
        shop_id: shopId,
        model_id: BIREFNET_V2_MODEL_ID,
        model_variant: options?.model,
        resolution: options?.operatingResolution,
        format: options?.outputFormat,
      },
      "Starting background removal",
    );

    const input: BiRefNetInput = {
      image_url: imageUrl,
      ...(options?.model && { model: options.model }),
      ...(options?.operatingResolution && {
        operating_resolution: options.operatingResolution,
      }),
      ...(options?.outputFormat && { output_format: options.outputFormat }),
      ...(options?.refineForeground !== undefined && {
        refine_foreground: options.refineForeground,
      }),
      ...(options?.outputMask !== undefined && {
        output_mask: options.outputMask,
      }),
      ...(options?.syncMode !== undefined && {
        sync_mode: options.syncMode,
      }),
    };

    const result = (await falClient.subscribe(BIREFNET_V2_MODEL_ID, {
      input,
      logs: false,
    })) as { data: BiRefNetResponse };

    const endTime = performance.now();
    const timeSeconds = (endTime - startTime) / 1000;

    const output: RemoveBackgroundResult = {
      imageUrl: result.data.image.url,
      timeSeconds,
      maskUrl: result.data.mask_image?.url,
      // Note: Cost is hard-coded to our contract price, not validated from API response.
      // This ensures billing predictability. If fal.ai pricing changes, this constant
      // must be updated and redeployed with appropriate version change.
      costUsd: REMOVE_BG_PRICE_USD,
    };

    logger.info(
      {
        shop_id: shopId,
        model_id: BIREFNET_V2_MODEL_ID,
        time_seconds: timeSeconds.toFixed(2),
        cost_usd: output.costUsd.toFixed(3),
      },
      "Background removal completed",
    );

    return output;
  } catch (error) {
    logger.error(
      {
        shop_id: shopId,
        model_id: BIREFNET_V2_MODEL_ID,
        err: error instanceof Error ? error.message : "Unknown error",
      },
      "Background removal failed",
    );

    throw mapFalError(error);
  }
}
