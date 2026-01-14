import {
  getSpendSafetySettings,
  type SpendSafetySettings,
} from "./spend-safety.server";
import { getStorefrontPersonalizationSettings } from "./storefront-personalization.server";

export type ShopReadinessSignals = {
  printifyConnected: boolean;
  storefrontPersonalizationEnabled: boolean;
  storefrontPersonalizationConfirmed: boolean;
  spendSafetyConfigured: boolean;
};

const isSpendSafetyConfigured = (settings: SpendSafetySettings): boolean => {
  const monthlyCapCents = settings.monthlyCapCents ?? 0;

  return monthlyCapCents > 0 && Boolean(settings.paidUsageConsentAt);
};

export const getShopReadinessSignals = async (
  shopId: string,
): Promise<ShopReadinessSignals> => {
  const [spendSafetySettings, storefrontSettings] = await Promise.all([
    getSpendSafetySettings(shopId),
    getStorefrontPersonalizationSettings(shopId),
  ]);
  const storefrontEnabled = storefrontSettings.enabled ?? false;
  const storefrontConfirmed = storefrontSettings.enabled !== null;

  return {
    printifyConnected: false,
    storefrontPersonalizationEnabled: storefrontEnabled,
    storefrontPersonalizationConfirmed: storefrontConfirmed,
    spendSafetyConfigured: isSpendSafetyConfigured(spendSafetySettings),
  };
};
