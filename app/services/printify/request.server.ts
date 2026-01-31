import logger from "../../lib/logger";
import { PrintifyRequestError } from "./client.server";

export const PRINTIFY_BASE_URL = "https://api.printify.com/v1";

export const getPrintifyUserAgent = (): string => {
  return process.env.PRINTIFY_USER_AGENT ?? "personalize-design-app";
};

export const fetchPrintify = async (
  url: string,
  token: string,
  init: RequestInit,
): Promise<Response> => {
  const delaysMs = [0, 400, 1200];
  let lastError: unknown;

  for (const delay of delaysMs) {
    if (delay) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": getPrintifyUserAgent(),
          Accept: "application/json",
          ...(init.headers ?? {}),
        },
      });

      if (response.status === 429 || response.status >= 500) {
        lastError = new PrintifyRequestError(
          response.status === 429 ? "rate_limited" : "unexpected_response",
          "Temporary Printify error.",
          response.status,
        );
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof PrintifyRequestError) {
    throw lastError;
  }

  throw new PrintifyRequestError(
    "unexpected_response",
    "Unable to reach Printify API.",
  );
};

export const assertPrintifyOk = async (
  response: Response,
  fallbackMessage: string,
): Promise<void> => {
  if (response.status === 401 || response.status === 403) {
    throw new PrintifyRequestError(
      "invalid_token",
      "Printify token is invalid or expired.",
      response.status,
    );
  }

  if (response.status === 429) {
    throw new PrintifyRequestError(
      "rate_limited",
      "Printify is rate limiting requests. Please retry in a moment.",
      response.status,
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logger.warn(
      { status: response.status, body },
      "Unexpected Printify response",
    );
    throw new PrintifyRequestError(
      "unexpected_response",
      fallbackMessage,
      response.status,
    );
  }
};
