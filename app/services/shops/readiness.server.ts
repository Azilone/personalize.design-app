import {
  getSpendSafetySettings,
  type SpendSafetySettings,
} from "./spend-safety.server";
import { getStorefrontPersonalizationSettings } from "./storefront-personalization.server";
import { getPrintifyIntegration } from "../printify/integration.server";
import { getOrSetCachedValue } from "../../lib/ttl-cache.server";

export type ShopReadinessSignals = {
  printifyConnected: boolean;
  storefrontPersonalizationEnabled: boolean;
  storefrontPersonalizationConfirmed: boolean;
  spendSafetyConfigured: boolean;
};

const READINESS_CACHE_TTL_MS = 30_000;

const isSpendSafetyConfigured = (settings: SpendSafetySettings): boolean => {
  const monthlyCapCents = settings.monthlyCapCents ?? 0;

  return monthlyCapCents > 0 && Boolean(settings.paidUsageConsentAt);
};

export const getShopReadinessSignals = async (
  shopId: string,
): Promise<ShopReadinessSignals> => {
  return getOrSetCachedValue(
    `readiness:${shopId}`,
    READINESS_CACHE_TTL_MS,
    async () => {
      const [spendSafetySettings, storefrontSettings, printifyIntegration] =
        await Promise.all([
          getSpendSafetySettings(shopId),
          getStorefrontPersonalizationSettings(shopId),
          getPrintifyIntegration(shopId),
        ]);
      const storefrontEnabled = storefrontSettings.enabled ?? false;
      const storefrontConfirmed = storefrontSettings.enabled !== null;

      return {
        printifyConnected: Boolean(printifyIntegration),
        storefrontPersonalizationEnabled: storefrontEnabled,
        storefrontPersonalizationConfirmed: storefrontConfirmed,
        spendSafetyConfigured: isSpendSafetyConfigured(spendSafetySettings),
      };
    },
  );
};
