import prisma from "../../db.server";

export type StorefrontPersonalizationSettings = {
  enabled: boolean | null;
};

export const getStorefrontPersonalizationSettings = async (
  shopId: string,
): Promise<StorefrontPersonalizationSettings> => {
  const settings = await prisma.shopStorefrontPersonalization.findUnique({
    where: { shop_id: shopId },
    select: { storefront_personalization_enabled: true },
  });

  return {
    enabled: settings?.storefront_personalization_enabled ?? null,
  };
};

export type UpsertStorefrontPersonalizationSettingsInput = {
  shopId: string;
  enabled: boolean;
};

export const upsertStorefrontPersonalizationSettings = async (
  input: UpsertStorefrontPersonalizationSettingsInput,
) => {
  return prisma.shopStorefrontPersonalization.upsert({
    where: { shop_id: input.shopId },
    update: { storefront_personalization_enabled: input.enabled },
    create: {
      shop_id: input.shopId,
      storefront_personalization_enabled: input.enabled,
    },
  });
};
