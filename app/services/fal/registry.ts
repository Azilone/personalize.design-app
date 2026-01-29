/**
 * Model registry for fal.ai adapters.
 *
 * Maps model IDs to their adapter implementations.
 * Provides type-safe lookup of model adapters.
 */

import type { ModelAdapter, ModelConfig } from "./types";
import { GenerationError } from "./types";
import { seedreamV4EditAdapter } from "./models/seedream-v4-edit";
import { reveFastRemixAdapter } from "./models/reve-fast-remix";

/**
 * Registry of all available model adapters.
 * Key is the model ID, value is the adapter instance.
 */
const modelRegistry: Map<string, ModelAdapter> = new Map([
  [seedreamV4EditAdapter.config.modelId, seedreamV4EditAdapter],
  [reveFastRemixAdapter.config.modelId, reveFastRemixAdapter],
]);

/**
 * Get a model adapter by ID.
 *
 * @param modelId - The model identifier (e.g., "fal-ai/bytedance/seedream/v4/edit")
 * @returns The model adapter
 * @throws GenerationError if model is not found
 */
export function getModelAdapter(modelId: string): ModelAdapter {
  const adapter = modelRegistry.get(modelId);

  if (!adapter) {
    throw new GenerationError(
      "invalid_input",
      `Unknown model: ${modelId}. Please select a valid model.`,
      false,
    );
  }

  return adapter;
}

/**
 * Check if a model ID is registered.
 *
 * @param modelId - The model identifier to check
 * @returns true if the model is available
 */
export function isModelRegistered(modelId: string): boolean {
  return modelRegistry.has(modelId);
}

/**
 * Get all registered model configurations.
 *
 * @returns Array of model configs for UI display
 */
export function getAllModelConfigs(): ModelConfig[] {
  return Array.from(modelRegistry.values()).map((adapter) => adapter.config);
}

/**
 * Get a model configuration by ID.
 */
export function getModelConfig(modelId: string): ModelConfig | null {
  const adapter = modelRegistry.get(modelId);
  return adapter ? adapter.config : null;
}

/**
 * Get count of registered models.
 */
export function getRegisteredModelCount(): number {
  return modelRegistry.size;
}
