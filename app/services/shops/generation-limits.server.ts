import prisma from "../../db.server";

export const DEFAULT_PER_PRODUCT_LIMIT = 5;
export const DEFAULT_PER_SESSION_LIMIT = 15;
export const DEFAULT_RESET_WINDOW_MINUTES = 30;

export type GenerationLimitSettings = {
  perProductLimit: number;
  perSessionLimit: number;
  resetWindowMinutes: number;
};

export const getShopGenerationLimits = async (
  shopId: string,
): Promise<GenerationLimitSettings> => {
  const settings = await prisma.shopGenerationLimits.findUnique({
    where: { shop_id: shopId },
    select: {
      per_product_limit: true,
      per_session_limit: true,
      reset_window_minutes: true,
    },
  });

  return {
    perProductLimit: settings?.per_product_limit ?? DEFAULT_PER_PRODUCT_LIMIT,
    perSessionLimit: settings?.per_session_limit ?? DEFAULT_PER_SESSION_LIMIT,
    resetWindowMinutes:
      settings?.reset_window_minutes ?? DEFAULT_RESET_WINDOW_MINUTES,
  };
};

export type UpsertGenerationLimitsInput = GenerationLimitSettings & {
  shopId: string;
};

export const upsertShopGenerationLimits = async (
  input: UpsertGenerationLimitsInput,
) =>
  prisma.shopGenerationLimits.upsert({
    where: { shop_id: input.shopId },
    update: {
      per_product_limit: input.perProductLimit,
      per_session_limit: input.perSessionLimit,
      reset_window_minutes: input.resetWindowMinutes,
    },
    create: {
      shop_id: input.shopId,
      per_product_limit: input.perProductLimit,
      per_session_limit: input.perSessionLimit,
      reset_window_minutes: input.resetWindowMinutes,
    },
  });
