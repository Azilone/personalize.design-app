import { PlanStatus } from "@prisma/client";
import prisma from "../../db.server";

const FREE_GIFT_CENTS = 100;

export const isPlanActive = (status: PlanStatus): boolean => {
  return status === PlanStatus.standard || status === PlanStatus.early_access;
};

export const getShopPlanStatus = async (
  shopId: string,
): Promise<PlanStatus> => {
  const plan = await prisma.shopPlan.findUnique({
    where: { shop_id: shopId },
    select: { plan_status: true },
  });

  return plan?.plan_status ?? PlanStatus.none;
};

export const getShopPlan = async (shopId: string) => {
  return prisma.shopPlan.findUnique({
    where: { shop_id: shopId },
  });
};

type PendingStandardPlanInput = {
  shopId: string;
  subscriptionId: string;
  subscriptionStatus: string;
};

export const setStandardPlanPending = async (
  input: PendingStandardPlanInput,
) => {
  return prisma.shopPlan.upsert({
    where: { shop_id: input.shopId },
    update: {
      plan_status: PlanStatus.standard_pending,
      shopify_subscription_id: input.subscriptionId,
      shopify_subscription_status: input.subscriptionStatus,
    },
    create: {
      shop_id: input.shopId,
      plan_status: PlanStatus.standard_pending,
      shopify_subscription_id: input.subscriptionId,
      shopify_subscription_status: input.subscriptionStatus,
    },
  });
};

type ActivateStandardPlanInput = {
  shopId: string;
  subscriptionId: string;
  subscriptionStatus: string;
};

export const activateStandardPlan = async (
  input: ActivateStandardPlanInput,
) => {
  return activatePlanWithGift({
    shopId: input.shopId,
    subscriptionId: input.subscriptionId,
    subscriptionStatus: input.subscriptionStatus,
    planStatus: PlanStatus.standard,
  });
};

type PendingEarlyAccessPlanInput = {
  shopId: string;
  subscriptionId: string;
  subscriptionStatus: string;
};

export const setEarlyAccessPlanPending = async (
  input: PendingEarlyAccessPlanInput,
) => {
  return prisma.shopPlan.upsert({
    where: { shop_id: input.shopId },
    update: {
      plan_status: PlanStatus.early_access_pending,
      shopify_subscription_id: input.subscriptionId,
      shopify_subscription_status: input.subscriptionStatus,
    },
    create: {
      shop_id: input.shopId,
      plan_status: PlanStatus.early_access_pending,
      shopify_subscription_id: input.subscriptionId,
      shopify_subscription_status: input.subscriptionStatus,
    },
  });
};

type ActivateEarlyAccessPlanInput = {
  shopId: string;
  subscriptionId: string;
  subscriptionStatus: string;
};

export const activateEarlyAccessPlan = async (
  input: ActivateEarlyAccessPlanInput,
) => {
  return activatePlanWithGift({
    shopId: input.shopId,
    subscriptionId: input.subscriptionId,
    subscriptionStatus: input.subscriptionStatus,
    planStatus: PlanStatus.early_access,
  });
};

type ActivatePlanInput = {
  shopId: string;
  subscriptionId: string;
  subscriptionStatus: string;
  planStatus: PlanStatus;
};

const activatePlanWithGift = async (input: ActivatePlanInput) => {
  const existing = await prisma.shopPlan.findUnique({
    where: { shop_id: input.shopId },
    select: {
      free_usage_gift_cents: true,
      free_usage_gift_remaining_cents: true,
    },
  });

  const giftCents = existing?.free_usage_gift_cents ?? 0;
  const giftRemaining = existing?.free_usage_gift_remaining_cents ?? 0;

  return prisma.shopPlan.upsert({
    where: { shop_id: input.shopId },
    update: {
      plan_status: input.planStatus,
      shopify_subscription_id: input.subscriptionId,
      shopify_subscription_status: input.subscriptionStatus,
      free_usage_gift_cents: giftCents || FREE_GIFT_CENTS,
      free_usage_gift_remaining_cents: giftRemaining || FREE_GIFT_CENTS,
    },
    create: {
      shop_id: input.shopId,
      plan_status: input.planStatus,
      shopify_subscription_id: input.subscriptionId,
      shopify_subscription_status: input.subscriptionStatus,
      free_usage_gift_cents: FREE_GIFT_CENTS,
      free_usage_gift_remaining_cents: FREE_GIFT_CENTS,
    },
  });
};
