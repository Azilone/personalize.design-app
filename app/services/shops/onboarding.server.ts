import prisma from "../../db.server";

export const isOnboardingComplete = async (
  shopId: string,
): Promise<boolean> => {
  const record = await prisma.shopOnboarding.findUnique({
    where: { shop_id: shopId },
    select: { completed_at: true },
  });

  return Boolean(record?.completed_at);
};

export const markOnboardingComplete = async (shopId: string) => {
  const completedAt = new Date();

  return prisma.shopOnboarding.upsert({
    where: { shop_id: shopId },
    update: { completed_at: completedAt },
    create: { shop_id: shopId, completed_at: completedAt },
  });
};

export const clearOnboardingComplete = async (shopId: string) => {
  await prisma.shopOnboarding
    .delete({ where: { shop_id: shopId } })
    .catch(() => undefined);
};
