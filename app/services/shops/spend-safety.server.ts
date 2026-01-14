import prisma from "../../db.server";

export type SpendSafetySettings = {
  monthlyCapCents: number | null;
  paidUsageConsentAt: Date | null;
};

export const getSpendSafetySettings = async (
  shopId: string,
): Promise<SpendSafetySettings> => {
  const settings = await prisma.shopSpendSafety.findUnique({
    where: { shop_id: shopId },
    select: {
      monthly_cap_cents: true,
      paid_usage_consent_at: true,
    },
  });

  return {
    monthlyCapCents: settings?.monthly_cap_cents ?? null,
    paidUsageConsentAt: settings?.paid_usage_consent_at ?? null,
  };
};

export type UpsertSpendSafetySettingsInput = {
  shopId: string;
  monthlyCapCents: number;
  paidUsageConsentAt: Date | null;
};

export const upsertSpendSafetySettings = async (
  input: UpsertSpendSafetySettingsInput,
) => {
  return prisma.shopSpendSafety.upsert({
    where: { shop_id: input.shopId },
    update: {
      monthly_cap_cents: input.monthlyCapCents,
      paid_usage_consent_at: input.paidUsageConsentAt,
    },
    create: {
      shop_id: input.shopId,
      monthly_cap_cents: input.monthlyCapCents,
      paid_usage_consent_at: input.paidUsageConsentAt,
    },
  });
};
