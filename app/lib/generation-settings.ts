/**
 * Generation settings constants for MVP.
 *
 * Centralizes model identifiers and pricing to avoid magic strings/numbers.
 */

/**
 * The only allowed model identifier for MVP.
 * fal.ai model: Seedream v4 Edit
 */
export const MVP_GENERATION_MODEL_ID = "fal-ai/bytedance/seedream/v4/edit";

/**
 * Display name for the MVP model.
 */
export const MVP_GENERATION_MODEL_DISPLAY_NAME = "Seedream v4 Edit (fal.ai)";

/**
 * Price per generated image in USD.
 * Applies to: generate, regenerate, remove background.
 * NOT billed: Printify mockups.
 * Note: Optional for backward compatibility with existing templates.
 */
export const MVP_PRICE_USD_PER_GENERATION = 0.05;

/**
 * Allowed model identifiers for validation (MVP: single model).
 */
export const ALLOWED_GENERATION_MODEL_IDS = [MVP_GENERATION_MODEL_ID] as const;

/**
 * Type for allowed generation model identifiers.
 */
export type GenerationModelId = (typeof ALLOWED_GENERATION_MODEL_IDS)[number];

/**
 * Validates that a model identifier is in the allowed list.
 */
export function isValidGenerationModelId(
  modelId: string,
): modelId is GenerationModelId {
  return ALLOWED_GENERATION_MODEL_IDS.includes(modelId as GenerationModelId);
}

/**
 * Maximum number of test generations allowed per template per month.
 */
export const TEMPLATE_TEST_LIMIT_PER_MONTH = 50;

/**
 * Price per background removal in USD.
 * BiRefNet v2 on fal.ai
 */
export const REMOVE_BG_PRICE_USD = 0.025;

