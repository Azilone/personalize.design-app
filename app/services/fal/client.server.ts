/**
 * Shared fal.ai client wrapper.
 *
 * Provides configured fal.ai client instance for server-side use.
 * Must never be exposed to the client/storefront bundle.
 */

import { fal } from "@fal-ai/client";
import logger from "../../lib/logger";
import { GenerationError, type GenerationErrorCode } from "./types";

// Configure fal.ai client with API key from environment
const FAL_KEY = process.env.FAL_KEY;

if (!FAL_KEY) {
  logger.warn("FAL_KEY environment variable is not set");
}

/**
 * Configured fal.ai client instance.
 * The client automatically uses FAL_KEY from environment.
 */
export const falClient = fal;

/**
 * Timeout for generation requests in milliseconds.
 * fal.ai models can take 10-30+ seconds; use 60s as safe upper bound.
 */
export const GENERATION_TIMEOUT_MS = 60000;

/**
 * Maps fal.ai errors to GenerationError codes.
 */
export function mapFalError(error: unknown): GenerationError {
  const message =
    error instanceof Error ? error.message : "Unknown generation error";

  // Check for timeout
  if (message.toLowerCase().includes("timeout")) {
    return new GenerationError(
      "timeout",
      "Generation timed out. Please try again.",
      true,
    );
  }

  // Check for rate limiting
  if (
    message.toLowerCase().includes("rate limit") ||
    message.toLowerCase().includes("429")
  ) {
    return new GenerationError(
      "rate_limited",
      "Too many requests. Please try again in a moment.",
      true,
    );
  }

  // Check for network errors
  if (
    message.toLowerCase().includes("network") ||
    message.toLowerCase().includes("fetch") ||
    message.toLowerCase().includes("econnrefused")
  ) {
    return new GenerationError(
      "network_error",
      "Network error. Please check your connection and try again.",
      true,
    );
  }

  // Check for validation errors (non-retryable)
  if (
    message.toLowerCase().includes("invalid") ||
    message.toLowerCase().includes("validation")
  ) {
    return new GenerationError(
      "invalid_input",
      "Invalid input. Please check your settings and try again.",
      false,
    );
  }

  // Default to provider error
  let code: GenerationErrorCode = "provider_error";
  if (message.toLowerCase().includes("500")) {
    code = "provider_error";
  }

  return new GenerationError(
    code,
    "Something went wrong. Please try again.",
    true,
  );
}
