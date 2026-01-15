/**
 * Tests for fal.ai model registry.
 *
 * Tests verify that model adapters are correctly registered,
 * looked up, and retrieved.
 */

import { describe, it, expect } from "vitest";
import {
  getModelAdapter,
  isModelRegistered,
  getAllModelConfigs,
  getRegisteredModelCount,
} from "./registry";
import { seedreamV4EditAdapter } from "./models/seedream-v4-edit";
import { GenerationError } from "./types";

describe("fal.ai registry", () => {
  const MODEL_ID = "fal-ai/bytedance/seedream/v4/edit";

  describe("getModelAdapter", () => {
    it("should return adapter for registered model ID", () => {
      const adapter = getModelAdapter(MODEL_ID);

      expect(adapter).toBe(seedreamV4EditAdapter);
      expect(adapter.config.modelId).toBe(MODEL_ID);
    });

    it("should throw GenerationError for unknown model ID", () => {
      expect(() => getModelAdapter("unknown-model")).toThrow(GenerationError);
      expect(() => getModelAdapter("unknown-model")).toThrow(
        "Unknown model: unknown-model",
      );
    });
  });

  describe("isModelRegistered", () => {
    it("should return true for registered model", () => {
      expect(isModelRegistered(MODEL_ID)).toBe(true);
    });

    it("should return false for unknown model", () => {
      expect(isModelRegistered("unknown-model")).toBe(false);
    });
  });

  describe("getAllModelConfigs", () => {
    it("should return array of all registered model configs", () => {
      const configs = getAllModelConfigs();

      expect(configs).toHaveLength(1);
      expect(configs[0].modelId).toBe(MODEL_ID);
      expect(configs[0].displayName).toContain("Seedream");
      expect(configs[0].pricePerImage).toBeGreaterThan(0);
      expect(configs[0].maxImagesPerRequest).toBeGreaterThan(0);
    });
  });

  describe("getRegisteredModelCount", () => {
    it("should return count of registered models", () => {
      const count = getRegisteredModelCount();

      expect(count).toBe(1);
    });
  });
});
