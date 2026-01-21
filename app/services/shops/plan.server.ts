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

type PendingPlanStatus = "standard_pending" | "early_access_pending";

type PlanReservationResult = {
  acquired: boolean;
  planStatus: PlanStatus;
};

const reservePlanPending = async (
  shopId: string,
  pendingStatus: PendingPlanStatus,
): Promise<PlanReservationResult> => {
  const existing = await prisma.shopPlan.findUnique({
    where: { shop_id: shopId },
    select: { plan_status: true },
  });

  if (!existing) {
    try {
      await prisma.shopPlan.create({
        data: {
          shop_id: shopId,
          plan_status: pendingStatus,
        },
      });

      return { acquired: true, planStatus: pendingStatus };
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        const latest = await prisma.shopPlan.findUnique({
          where: { shop_id: shopId },
          select: { plan_status: true },
        });
        return {
          acquired: false,
          planStatus: latest?.plan_status ?? PlanStatus.none,
        };
      }

      throw error;
    }
  }

  if (existing.plan_status !== PlanStatus.none) {
    return { acquired: false, planStatus: existing.plan_status };
  }

  const updateResult = await prisma.shopPlan.updateMany({
    where: { shop_id: shopId, plan_status: PlanStatus.none },
    data: { plan_status: pendingStatus },
  });

  if (updateResult.count === 1) {
    return { acquired: true, planStatus: pendingStatus };
  }

  const latest = await prisma.shopPlan.findUnique({
    where: { shop_id: shopId },
    select: { plan_status: true },
  });

  return { acquired: false, planStatus: latest?.plan_status ?? PlanStatus.none };
};

export const reserveStandardPlanPending = async (
  shopId: string,
): Promise<PlanReservationResult> => {
  return reservePlanPending(shopId, "standard_pending");
};

export const reserveEarlyAccessPlanPending = async (
  shopId: string,
): Promise<PlanReservationResult> => {
  return reservePlanPending(shopId, "early_access_pending");
};

export const clearPendingPlan = async (input: {
  shopId: string;
  pendingStatus: PendingPlanStatus;
}) => {
  return prisma.shopPlan.updateMany({
    where: {
      shop_id: input.shopId,
      plan_status: input.pendingStatus,
      shopify_subscription_id: null,
    },
    data: { plan_status: PlanStatus.none },
  });
};

export const clearPlanToNone = async (shopId: string) => {
  return prisma.shopPlan.updateMany({
    where: { shop_id: shopId },
    data: {
      plan_status: PlanStatus.none,
      shopify_subscription_id: null,
      shopify_subscription_status: null,
      shopify_confirmation_url: null,
      free_usage_gift_cents: 0,
      free_usage_gift_remaining_cents: 0,
    },
  });
};

export const resetPlanForDev = async (shopId: string) => {
  return prisma.shopPlan.deleteMany({
    where: { shop_id: shopId },
  });
};

export const activateDevBypassPlan = async (shopId: string) => {
  const existing = await prisma.shopPlan.findUnique({
    where: { shop_id: shopId },
    select: {
      free_usage_gift_cents: true,
      free_usage_gift_remaining_cents: true,
    },
  });

  const giftCents = existing?.free_usage_gift_cents ?? 0;
  const giftRemaining = existing?.free_usage_gift_remaining_cents ?? 0;

  return prisma.shopPlan.upsert({
    where: { shop_id: shopId },
    update: {
      plan_status: PlanStatus.early_access,
      shopify_subscription_id: null,
      shopify_subscription_status: null,
      shopify_confirmation_url: null,
      free_usage_gift_cents: giftCents || FREE_GIFT_CENTS,
      free_usage_gift_remaining_cents: giftRemaining || FREE_GIFT_CENTS,
    },
    create: {
      shop_id: shopId,
      plan_status: PlanStatus.early_access,
      shopify_subscription_id: null,
      shopify_subscription_status: null,
      shopify_confirmation_url: null,
      free_usage_gift_cents: FREE_GIFT_CENTS,
      free_usage_gift_remaining_cents: FREE_GIFT_CENTS,
    },
  });
};

type PendingStandardPlanInput = {
  shopId: string;
  subscriptionId: string;
  subscriptionStatus: string;
  confirmationUrl: string;
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
      shopify_confirmation_url: input.confirmationUrl,
    },
    create: {
      shop_id: input.shopId,
      plan_status: PlanStatus.standard_pending,
      shopify_subscription_id: input.subscriptionId,
      shopify_subscription_status: input.subscriptionStatus,
      shopify_confirmation_url: input.confirmationUrl,
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
  confirmationUrl: string;
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
      shopify_confirmation_url: input.confirmationUrl,
    },
    create: {
      shop_id: input.shopId,
      plan_status: PlanStatus.early_access_pending,
      shopify_subscription_id: input.subscriptionId,
      shopify_subscription_status: input.subscriptionStatus,
      shopify_confirmation_url: input.confirmationUrl,
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
      shopify_confirmation_url: null,
      free_usage_gift_cents: giftCents || FREE_GIFT_CENTS,
      free_usage_gift_remaining_cents: giftRemaining || FREE_GIFT_CENTS,
    },
    create: {
      shop_id: input.shopId,
      plan_status: input.planStatus,
      shopify_subscription_id: input.subscriptionId,
      shopify_subscription_status: input.subscriptionStatus,
      shopify_confirmation_url: null,
      free_usage_gift_cents: FREE_GIFT_CENTS,
      free_usage_gift_remaining_cents: FREE_GIFT_CENTS,
    },
  });
};
