import { Prisma } from "@prisma/client";
import prisma from "../../db.server";
import logger from "../../lib/logger";
import {
  DEFAULT_PER_PRODUCT_LIMIT,
  DEFAULT_PER_SESSION_LIMIT,
  DEFAULT_RESET_WINDOW_MINUTES,
  getShopGenerationLimits,
} from "../shops/generation-limits.server";

export type LimitCheckResult = {
  allowed: boolean;
  reason?: "per_product_limit" | "per_session_limit" | "billing_blocked";
  tries_remaining?: number;
  per_product_tries_remaining?: number;
  per_session_tries_remaining?: number;
  reset_at?: Date;
  reset_in_minutes?: number;
  message?: string;
};

export type GenerationAttemptRecord = {
  id: string;
  shopId: string;
  sessionId: string;
  productId: string;
  attemptCount: number;
  firstAttemptAt: Date;
  lastAttemptAt: Date;
  resetWindowMinutes: number;
  createdAt: Date;
  updatedAt: Date;
};

const mapGenerationAttempt = (record: {
  id: string;
  shop_id: string;
  session_id: string;
  product_id: string;
  attempt_count: number;
  first_attempt_at: Date;
  last_attempt_at: Date;
  reset_window_minutes: number;
  created_at: Date;
  updated_at: Date;
}): GenerationAttemptRecord => ({
  id: record.id,
  shopId: record.shop_id,
  sessionId: record.session_id,
  productId: record.product_id,
  attemptCount: record.attempt_count,
  firstAttemptAt: record.first_attempt_at,
  lastAttemptAt: record.last_attempt_at,
  resetWindowMinutes: record.reset_window_minutes,
  createdAt: record.created_at,
  updatedAt: record.updated_at,
});

/**
 * Get or create a generation attempt record for a session/product combination
 */
export const getOrCreateGenerationAttempt = async ({
  shopId,
  sessionId,
  productId,
}: {
  shopId: string;
  sessionId: string;
  productId: string;
}): Promise<GenerationAttemptRecord> => {
  const settings = await getShopGenerationLimits(shopId);
  const existing = await prisma.generationAttempt.findUnique({
    where: {
      shop_id_session_id_product_id: {
        shop_id: shopId,
        session_id: sessionId,
        product_id: productId,
      },
    },
  });

  if (existing) {
    return mapGenerationAttempt(existing);
  }

  const record = await prisma.generationAttempt.create({
    data: {
      shop_id: shopId,
      session_id: sessionId,
      product_id: productId,
      attempt_count: 0,
      reset_window_minutes: settings.resetWindowMinutes,
    },
  });

  return mapGenerationAttempt(record);
};

/**
 * Check if the reset window has expired and reset the counter if needed
 */
const checkAndApplyReset = (
  attempt: GenerationAttemptRecord,
  resetWindowMinutes: number,
): GenerationAttemptRecord => {
  const now = new Date();
  const resetWindowMs = resetWindowMinutes * 60 * 1000;
  const timeSinceLastAttempt = now.getTime() - attempt.lastAttemptAt.getTime();

  if (timeSinceLastAttempt >= resetWindowMs) {
    // Reset window has passed, counter should be reset
    return {
      ...attempt,
      attemptCount: 0,
      firstAttemptAt: now,
    };
  }

  return attempt;
};

/**
 * Calculate reset time based on last attempt
 */
const calculateResetTime = (
  attempt: GenerationAttemptRecord,
  resetWindowMinutes: number,
): Date => {
  const resetWindowMs = resetWindowMinutes * 60 * 1000;
  return new Date(attempt.lastAttemptAt.getTime() + resetWindowMs);
};

const isSerializationError = (error: unknown): boolean => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2034";
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return (
      error.message.includes("serialization") ||
      error.message.includes("deadlock")
    );
  }
  return false;
};

/**
 * Get total session attempts across all products for a session
 */
const getSessionTotalAttempts = async ({
  shopId,
  sessionId,
  resetWindowMinutes,
}: {
  shopId: string;
  sessionId: string;
  resetWindowMinutes: number;
}): Promise<number> => {
  const attempts = await prisma.generationAttempt.findMany({
    where: {
      shop_id: shopId,
      session_id: sessionId,
    },
  });

  // Apply reset logic to each attempt before counting
  let total = 0;
  for (const attempt of attempts) {
    const mapped = mapGenerationAttempt(attempt);
    const resetWindowMs = resetWindowMinutes * 60 * 1000;
    const timeSinceLastAttempt = Date.now() - mapped.lastAttemptAt.getTime();

    // Only count if within reset window
    if (timeSinceLastAttempt < resetWindowMs) {
      total += mapped.attemptCount;
    }
  }

  return total;
};

/**
 * Check if generation is allowed based on limits
 */
export const checkGenerationLimits = async ({
  shopId,
  sessionId,
  productId,
}: {
  shopId: string;
  sessionId: string;
  productId: string;
}): Promise<LimitCheckResult> => {
  try {
    const settings = await getShopGenerationLimits(shopId);
    // Get or create the attempt record
    let attempt = await getOrCreateGenerationAttempt({
      shopId,
      sessionId,
      productId,
    });

    // Check if reset window has passed and apply if needed
    attempt = checkAndApplyReset(attempt, settings.resetWindowMinutes);

    // Get total session attempts
    const sessionTotalAttempts = await getSessionTotalAttempts({
      shopId,
      sessionId,
      resetWindowMinutes: settings.resetWindowMinutes,
    });

    // Calculate tries remaining
    const perProductTriesRemaining = Math.max(
      0,
      settings.perProductLimit - attempt.attemptCount,
    );
    const perSessionTriesRemaining = Math.max(
      0,
      settings.perSessionLimit - sessionTotalAttempts,
    );
    const triesRemaining = Math.min(
      perProductTriesRemaining,
      perSessionTriesRemaining,
    );

    // Calculate reset time
    const resetAt = calculateResetTime(attempt, settings.resetWindowMinutes);
    const resetInMinutes = Math.max(
      0,
      Math.ceil((resetAt.getTime() - Date.now()) / (60 * 1000)),
    );

    // Check limits
    if (attempt.attemptCount >= settings.perProductLimit) {
      return {
        allowed: false,
        reason: "per_product_limit",
        tries_remaining: 0,
        per_product_tries_remaining: 0,
        per_session_tries_remaining: perSessionTriesRemaining,
        reset_at: resetAt,
        reset_in_minutes: resetInMinutes,
        message: `You've reached the limit of ${settings.perProductLimit} generations for this product. Try again in ${resetInMinutes} minutes.`,
      };
    }

    if (sessionTotalAttempts >= settings.perSessionLimit) {
      return {
        allowed: false,
        reason: "per_session_limit",
        tries_remaining: 0,
        per_product_tries_remaining: perProductTriesRemaining,
        per_session_tries_remaining: 0,
        reset_at: resetAt,
        reset_in_minutes: resetInMinutes,
        message: `You've reached the session limit of ${settings.perSessionLimit} generations. Try again in ${resetInMinutes} minutes.`,
      };
    }

    return {
      allowed: true,
      tries_remaining: triesRemaining,
      per_product_tries_remaining: perProductTriesRemaining,
      per_session_tries_remaining: perSessionTriesRemaining,
      reset_at: resetAt,
      reset_in_minutes: resetInMinutes,
    };
  } catch (error) {
    logger.error(
      { shop_id: shopId, session_id: sessionId, product_id: productId, error },
      "Failed to check generation limits",
    );
    // Fail open - allow generation if we can't check limits
    return {
      allowed: true,
      tries_remaining: DEFAULT_PER_PRODUCT_LIMIT,
      per_product_tries_remaining: DEFAULT_PER_PRODUCT_LIMIT,
      per_session_tries_remaining: DEFAULT_PER_SESSION_LIMIT,
    };
  }
};

export const checkAndIncrementGenerationAttempt = async ({
  shopId,
  sessionId,
  productId,
}: {
  shopId: string;
  sessionId: string;
  productId: string;
}): Promise<LimitCheckResult> => {
  const now = new Date();
  const settings = await getShopGenerationLimits(shopId);

  const runTransaction = async (): Promise<LimitCheckResult> =>
    prisma.$transaction(
      async (tx): Promise<LimitCheckResult> => {
        const existing = await tx.generationAttempt.findUnique({
          where: {
            shop_id_session_id_product_id: {
              shop_id: shopId,
              session_id: sessionId,
              product_id: productId,
            },
          },
        });

        const attempts = await tx.generationAttempt.findMany({
          where: {
            shop_id: shopId,
            session_id: sessionId,
          },
        });

        const mappedAttempts = attempts.map(mapGenerationAttempt);
        const sessionTotalAttempts = mappedAttempts.reduce(
          (total: number, attempt: GenerationAttemptRecord) => {
            const resetWindowMs = settings.resetWindowMinutes * 60 * 1000;
            const timeSinceLastAttempt =
              now.getTime() - attempt.lastAttemptAt.getTime();
            if (timeSinceLastAttempt < resetWindowMs) {
              return total + attempt.attemptCount;
            }
            return total;
          },
          0,
        );

        if (!existing) {
          const perProductTriesRemaining = settings.perProductLimit;
          const perSessionTriesRemaining = Math.max(
            0,
            settings.perSessionLimit - sessionTotalAttempts,
          );
          if (perSessionTriesRemaining <= 0) {
            return {
              allowed: false,
              reason: "per_session_limit" as const,
              tries_remaining: 0,
              per_product_tries_remaining: perProductTriesRemaining,
              per_session_tries_remaining: 0,
              reset_at: now,
              reset_in_minutes: 0,
              message: `You've reached the session limit of ${settings.perSessionLimit} generations. Try again later.`,
            };
          }

          const record = await tx.generationAttempt.create({
            data: {
              shop_id: shopId,
              session_id: sessionId,
              product_id: productId,
              attempt_count: 1,
              first_attempt_at: now,
              last_attempt_at: now,
              reset_window_minutes: settings.resetWindowMinutes,
            },
          });

          const attempt = mapGenerationAttempt(record);
          const resetAt = calculateResetTime(
            attempt,
            settings.resetWindowMinutes,
          );
          const resetInMinutes = Math.max(
            0,
            Math.ceil((resetAt.getTime() - now.getTime()) / (60 * 1000)),
          );

          return {
            allowed: true,
            tries_remaining: Math.min(
              settings.perProductLimit - attempt.attemptCount,
              perSessionTriesRemaining - 1,
            ),
            per_product_tries_remaining:
              settings.perProductLimit - attempt.attemptCount,
            per_session_tries_remaining: perSessionTriesRemaining - 1,
            reset_at: resetAt,
            reset_in_minutes: resetInMinutes,
          };
        }

        let attempt = mapGenerationAttempt(existing);
        const resetWindowMs = settings.resetWindowMinutes * 60 * 1000;
        const timeSinceLastAttempt =
          now.getTime() - attempt.lastAttemptAt.getTime();
        const shouldReset = timeSinceLastAttempt >= resetWindowMs;
        const effectiveAttemptCount = shouldReset ? 0 : attempt.attemptCount;

        const perProductTriesRemaining = Math.max(
          0,
          settings.perProductLimit - effectiveAttemptCount,
        );
        const perSessionTriesRemaining = Math.max(
          0,
          settings.perSessionLimit - sessionTotalAttempts,
        );
        const triesRemaining = Math.min(
          perProductTriesRemaining,
          perSessionTriesRemaining,
        );

        const resetAt = shouldReset
          ? new Date(now.getTime() + resetWindowMs)
          : calculateResetTime(attempt, settings.resetWindowMinutes);
        const resetInMinutes = Math.max(
          0,
          Math.ceil((resetAt.getTime() - now.getTime()) / (60 * 1000)),
        );

        if (effectiveAttemptCount >= settings.perProductLimit) {
          return {
            allowed: false,
            reason: "per_product_limit" as const,
            tries_remaining: 0,
            per_product_tries_remaining: 0,
            per_session_tries_remaining: perSessionTriesRemaining,
            reset_at: resetAt,
            reset_in_minutes: resetInMinutes,
            message: `You've reached the limit of ${settings.perProductLimit} generations for this product. Try again in ${resetInMinutes} minutes.`,
          };
        }

        if (sessionTotalAttempts >= settings.perSessionLimit) {
          return {
            allowed: false,
            reason: "per_session_limit" as const,
            tries_remaining: 0,
            per_product_tries_remaining: perProductTriesRemaining,
            per_session_tries_remaining: 0,
            reset_at: resetAt,
            reset_in_minutes: resetInMinutes,
            message: `You've reached the session limit of ${settings.perSessionLimit} generations. Try again in ${resetInMinutes} minutes.`,
          };
        }

        const updated = await tx.generationAttempt.update({
          where: {
            shop_id_session_id_product_id: {
              shop_id: shopId,
              session_id: sessionId,
              product_id: productId,
            },
          },
          data: {
            attempt_count: shouldReset ? 1 : { increment: 1 },
            first_attempt_at: shouldReset ? now : undefined,
            last_attempt_at: now,
          },
        });

        attempt = mapGenerationAttempt(updated);

        return {
          allowed: true,
          tries_remaining: Math.min(
            settings.perProductLimit - attempt.attemptCount,
            perSessionTriesRemaining - 1,
          ),
          per_product_tries_remaining:
            settings.perProductLimit - attempt.attemptCount,
          per_session_tries_remaining: Math.max(
            0,
            perSessionTriesRemaining - 1,
          ),
          reset_at: calculateResetTime(attempt, settings.resetWindowMinutes),
          reset_in_minutes: Math.max(
            0,
            Math.ceil(
              (calculateResetTime(
                attempt,
                settings.resetWindowMinutes,
              ).getTime() -
                now.getTime()) /
                (60 * 1000),
            ),
          ),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await runTransaction();
    } catch (error) {
      if (attempt === 0 && isSerializationError(error)) {
        continue;
      }
      logger.error(
        {
          shop_id: shopId,
          session_id: sessionId,
          product_id: productId,
          error,
        },
        "Failed to check and increment generation limits",
      );
      return {
        allowed: true,
        tries_remaining: settings.perProductLimit,
        per_product_tries_remaining: settings.perProductLimit,
        per_session_tries_remaining: settings.perSessionLimit,
      };
    }
  }

  return {
    allowed: true,
    tries_remaining: settings.perProductLimit,
    per_product_tries_remaining: settings.perProductLimit,
    per_session_tries_remaining: settings.perSessionLimit,
  };
};

/**
 * Increment the generation attempt counter
 */
export const incrementGenerationAttempt = async ({
  shopId,
  sessionId,
  productId,
}: {
  shopId: string;
  sessionId: string;
  productId: string;
}): Promise<GenerationAttemptRecord> => {
  const now = new Date();
  const settings = await getShopGenerationLimits(shopId);

  const record = await prisma.generationAttempt.upsert({
    where: {
      shop_id_session_id_product_id: {
        shop_id: shopId,
        session_id: sessionId,
        product_id: productId,
      },
    },
    update: {
      attempt_count: {
        increment: 1,
      },
      last_attempt_at: now,
    },
    create: {
      shop_id: shopId,
      session_id: sessionId,
      product_id: productId,
      attempt_count: 1,
      first_attempt_at: now,
      last_attempt_at: now,
      reset_window_minutes: settings.resetWindowMinutes,
    },
  });

  return mapGenerationAttempt(record);
};

/**
 * Get current limit status for a session/product
 */
export const getGenerationLimitStatus = async ({
  shopId,
  sessionId,
  productId,
}: {
  shopId: string;
  sessionId: string;
  productId: string;
}): Promise<{
  per_product_limit: number;
  per_session_limit: number;
  per_product_attempts: number;
  per_session_attempts: number;
  per_product_tries_remaining: number;
  per_session_tries_remaining: number;
  reset_window_minutes: number;
  reset_at: Date;
}> => {
  const settings = await getShopGenerationLimits(shopId);
  const attempt = await getOrCreateGenerationAttempt({
    shopId,
    sessionId,
    productId,
  });

  const sessionTotalAttempts = await getSessionTotalAttempts({
    shopId,
    sessionId,
    resetWindowMinutes: settings.resetWindowMinutes,
  });

  const resetAt = calculateResetTime(attempt, settings.resetWindowMinutes);

  return {
    per_product_limit: settings.perProductLimit,
    per_session_limit: settings.perSessionLimit,
    per_product_attempts: attempt.attemptCount,
    per_session_attempts: sessionTotalAttempts,
    per_product_tries_remaining: Math.max(
      0,
      settings.perProductLimit - attempt.attemptCount,
    ),
    per_session_tries_remaining: Math.max(
      0,
      settings.perSessionLimit - sessionTotalAttempts,
    ),
    reset_window_minutes: settings.resetWindowMinutes,
    reset_at: resetAt,
  };
};
