import {
  MVP_PRICE_USD_PER_GENERATION,
  REMOVE_BG_PRICE_USD,
} from "./generation-settings";

export const USAGE_GIFT_CENTS = 100;
export const USAGE_GIFT_USD = USAGE_GIFT_CENTS / 100;

export const USAGE_PRICING_ITEMS = [
  {
    key: "generate",
    label: "Generate image",
    priceUsd: MVP_PRICE_USD_PER_GENERATION,
  },
  {
    key: "regenerate",
    label: "Regenerate image",
    priceUsd: MVP_PRICE_USD_PER_GENERATION,
  },
  {
    key: "remove_background",
    label: "Remove background",
    priceUsd: REMOVE_BG_PRICE_USD,
  },
];

export const USAGE_BILLING_NOTES = {
  gift_applies_first: "The free AI usage gift is applied first.",
  printify_mockups_not_billed: "Printify mockups are not billed.",
  standard_trial_note:
    "Standard includes a 7-day trial for the subscription fee only. Usage charges and per-order fees still apply.",
};
