/**
 * Tests for fal.ai client error mapping.
 *
 * Tests verify that fal.ai errors are correctly mapped
 * to GenerationError codes with appropriate retry flags.
 */

import { describe, it, expect, vi } from "vitest";
import { mapFalError, GENERATION_TIMEOUT_MS } from "./client.server";
import { GenerationError } from "./types";

describe("fal.ai client", () => {
  describe("mapFalError", () => {
    it("should map timeout error with retryable flag", () => {
      const error = new Error("Request timeout after 30 seconds");
      const result = mapFalError(error);

      expect(result).toBeInstanceOf(GenerationError);
      expect(result.code).toBe("timeout");
      expect(result.message).toContain("timed out");
      expect(result.retryable).toBe(true);
    });

    it("should map rate limit error with retryable flag", () => {
      const error = new Error("Rate limit exceeded (429)");
      const result = mapFalError(error);

      expect(result).toBeInstanceOf(GenerationError);
      expect(result.code).toBe("rate_limited");
      expect(result.message).toContain("Too many requests");
      expect(result.retryable).toBe(true);
    });

    it("should map network error with retryable flag", () => {
      const error = new Error("Network error: ECONNREFUSED");
      const result = mapFalError(error);

      expect(result).toBeInstanceOf(GenerationError);
      expect(result.code).toBe("network_error");
      expect(result.message).toContain("Network error");
      expect(result.retryable).toBe(true);
    });

    it("should map validation error with non-retryable flag", () => {
      const error = new Error("Invalid input: missing required field");
      const result = mapFalError(error);

      expect(result).toBeInstanceOf(GenerationError);
      expect(result.code).toBe("invalid_input");
      expect(result.message).toContain("Invalid input");
      expect(result.retryable).toBe(false);
    });

    it("should map 500 error as provider error", () => {
      const error = new Error("500 Internal Server Error");
      const result = mapFalError(error);

      expect(result).toBeInstanceOf(GenerationError);
      expect(result.code).toBe("provider_error");
      expect(result.retryable).toBe(true);
    });

    it("should map unknown error as provider error", () => {
      const error = new Error("Something unexpected happened");
      const result = mapFalError(error);

      expect(result).toBeInstanceOf(GenerationError);
      expect(result.code).toBe("provider_error");
      expect(result.message).toContain("Something went wrong");
      expect(result.retryable).toBe(true);
    });

    it("should handle non-Error objects", () => {
      const error = "string error";
      const result = mapFalError(error);

      expect(result).toBeInstanceOf(GenerationError);
      expect(result.code).toBe("provider_error");
      expect(result.message).toContain("Something went wrong");
    });
  });

  describe("GENERATION_TIMEOUT_MS", () => {
    it("should be set to 60 seconds (60000 ms)", () => {
      expect(GENERATION_TIMEOUT_MS).toBe(60000);
    });
  });
});
