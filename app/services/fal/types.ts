/**
 * Shared types for fal.ai image generation service.
 *
 * Defines interfaces for model adapters, generation inputs/outputs,
 * and error handling. Used across all model-specific implementations.
 */

// --- Generation Input/Output Types ---

/**
 * Input for image generation.
 * Maps to the common fields across fal.ai models.
 */
export interface GenerationInput {
  /** URL(s) of input image(s) for editing/generation */
  imageUrls: string[];
  /** The prompt to use for generation */
  prompt: string;
  /** Number of images to generate (1-4 for MVP) */
  numImages: number;
  /** Optional seed for reproducibility */
  seed?: number;
  /** Optional target image size for generation */
  imageSize?: { width: number; height: number };
  /** Optional aspect ratio for generation (used by Reve model) */
  aspectRatio?: "16:9" | "9:16" | "3:2" | "2:3" | "4:3" | "3:4" | "1:1";
}

/**
 * A single generated image result.
 */
export interface GeneratedImage {
  /** URL of generated image */
  url: string;
  /** Generation time in seconds (if available) */
  generationTimeSeconds: number | null;
  /** Cost in USD for this image (total: generation + remove-bg if applicable) */
  costUsd: number;
  /** Cost in USD for generation only (optional, used when remove-bg enabled) */
  generationCostUsd?: number;
  /** Cost in USD for remove-bg only (optional, used when remove-bg enabled) */
  removeBgCostUsd?: number;
  /** Seed used for this generation */
  seed?: number;
}

/**
 * Output from a generation request.
 */
export interface GenerationOutput {
  /** Array of generated images */
  images: GeneratedImage[];
  /** Total generation time in seconds */
  totalTimeSeconds: number;
  /** Total cost in USD */
  totalCostUsd: number;
}

// --- Error Types ---

/**
 * Generation error codes.
 */
export type GenerationErrorCode =
  | "timeout"
  | "provider_error"
  | "network_error"
  | "invalid_input"
  | "rate_limited"
  | "remove_bg_failed"
  | "unknown";

/**
 * Error thrown during generation.
 */
export class GenerationError extends Error {
  readonly code: GenerationErrorCode;
  readonly retryable: boolean;

  constructor(code: GenerationErrorCode, message: string, retryable = true) {
    super(message);
    this.name = "GenerationError";
    this.code = code;
    this.retryable = retryable;
  }
}

// --- Model Adapter Interface ---

/**
 * Configuration for a model adapter.
 */
export interface ModelConfig {
  /** Unique model identifier (e.g., "fal-ai/bytedance/seedream/v4/edit") */
  modelId: string;
  /** Human-readable display name */
  displayName: string;
  /** Price per generated image in USD */
  pricePerImage: number;
  /** Maximum number of images per request */
  maxImagesPerRequest: number;
  /** True if the model supports custom image_size dimensions */
  supportsImageSize: boolean;
}

/**
 * Interface for model-specific adapters.
 * Each fal.ai model implements this interface.
 */
export interface ModelAdapter {
  /** Model configuration */
  readonly config: ModelConfig;

  /**
   * Generate images using this model.
   *
   * @param input - Generation input parameters
   * @returns Promise resolving to generation output
   * @throws GenerationError on failure
   */
  generate(input: GenerationInput): Promise<GenerationOutput>;
}
