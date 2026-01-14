import {
  getSpendSafetySettings,
  type SpendSafetySettings,
} from "./spend-safety.server";

export type ShopReadinessSignals = {
  printifyConnected: boolean;
  storefrontPersonalizationEnabled: boolean;
  spendSafetyConfigured: boolean;
};

const isSpendSafetyConfigured = (settings: SpendSafetySettings): boolean => {
  const monthlyCapCents = settings.monthlyCapCents ?? 0;

  return monthlyCapCents > 0 && Boolean(settings.paidUsageConsentAt);
};

export const getShopReadinessSignals = async (
  shopId: string,
): Promise<ShopReadinessSignals> => {
  const spendSafetySettings = await getSpendSafetySettings(shopId);

  return {
    printifyConnected: false,
    storefrontPersonalizationEnabled: false,
    spendSafetyConfigured: isSpendSafetyConfigured(spendSafetySettings),
  };
};
