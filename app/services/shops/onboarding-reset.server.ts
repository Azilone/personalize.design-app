import prisma from "../../db.server";

export const resetOnboardingForDev = async (shopId: string) => {
  await Promise.all([
    prisma.shopSpendSafety
      .delete({ where: { shop_id: shopId } })
      .catch(() => undefined),
    prisma.shopStorefrontPersonalization
      .delete({ where: { shop_id: shopId } })
      .catch(() => undefined),
    prisma.shopPrintifyIntegration
      .delete({ where: { shop_id: shopId } })
      .catch(() => undefined),
    prisma.shopOnboarding
      .delete({ where: { shop_id: shopId } })
      .catch(() => undefined),
  ]);
};
