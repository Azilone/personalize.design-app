export const buildSubscriptionIdempotencyKey = (input: {
  shopId: string;
  plan: "standard" | "early_access";
}): string => {
  return `subscription:${input.shopId}:${input.plan}`;
};

export const buildGiftGrantIdempotencyKey = (input: {
  shopId: string;
  plan: "standard" | "early_access";
}): string => {
  return `gift_grant:${input.shopId}:${input.plan}`;
};
