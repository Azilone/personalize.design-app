/**
 * Shared fal.ai client wrapper.
 *
 * Provides configured fal.ai client instance for server-side use.
 * Must never be exposed to the client/storefront bundle.
 */

import { ApiError, ValidationError, fal } from "@fal-ai/client";
import logger from "../../lib/logger";
import { GenerationError, type GenerationErrorCode } from "./types";

// Configure fal.ai client with API key from environment
const FAL_KEY = process.env.FAL_KEY;
const FAL_KEY_ID = process.env.FAL_KEY_ID;
const FAL_KEY_SECRET = process.env.FAL_KEY_SECRET;

if (FAL_KEY) {
  fal.config({ credentials: FAL_KEY });
} else if (FAL_KEY_ID && FAL_KEY_SECRET) {
  fal.config({ credentials: `${FAL_KEY_ID}:${FAL_KEY_SECRET}` });
} else {
  logger.warn("fal.ai credentials are not configured");
}

/**
 * Configured fal.ai client instance.
 * Uses credentials configured above.
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

  const normalizedMessage = message.toLowerCase();

  const status =
    error instanceof ApiError || error instanceof ValidationError
      ? error.status
      : undefined;

  const requestId =
    error instanceof ApiError || error instanceof ValidationError
      ? error.requestId
      : undefined;

  const detailMessage =
    error instanceof ValidationError && Array.isArray(error.fieldErrors)
      ? error.fieldErrors.map((err) => err.msg).join("; ")
      : undefined;

  if (status) {
    logger.warn(
      {
        error_status: status,
        request_id: requestId,
        error_message: message,
      },
      "fal.ai provider error",
    );
  }

  // Check for timeout
  if (normalizedMessage.includes("timeout")) {
    return new GenerationError(
      "timeout",
      "Generation timed out. Please try again.",
      true,
    );
  }

  // Check for rate limiting
  if (normalizedMessage.includes("rate limit") || status === 429) {
    return new GenerationError(
      "rate_limited",
      "Too many requests. Please try again in a moment.",
      true,
    );
  }

  // Check for network errors
  if (
    normalizedMessage.includes("network") ||
    normalizedMessage.includes("fetch") ||
    normalizedMessage.includes("econnrefused")
  ) {
    return new GenerationError(
      "network_error",
      "Network error. Please check your connection and try again.",
      true,
    );
  }

  // Check for validation errors (non-retryable)
  if (
    normalizedMessage.includes("invalid") ||
    normalizedMessage.includes("validation") ||
    status === 422
  ) {
    return new GenerationError(
      "invalid_input",
      detailMessage ??
        "Invalid input. Please check your settings and try again.",
      false,
    );
  }

  // Check for auth errors
  if (status === 401 || status === 403) {
    return new GenerationError(
      "provider_error",
      "fal.ai credentials are invalid. Please check configuration.",
      false,
    );
  }

  // Default to provider error
  let code: GenerationErrorCode = "provider_error";
  if (normalizedMessage.includes("500") || (status && status >= 500)) {
    code = "provider_error";
  }

  return new GenerationError(
    code,
    "Something went wrong. Please try again.",
    true,
  );
}
