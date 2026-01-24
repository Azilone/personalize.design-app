import { BillableEventStatus, BillableEventType } from "@prisma/client";
import prisma from "../../db.server";
import { millsToUsd, usdToMills } from "./billing-guardrails";
import {
  trackBillableEventCreated,
  trackBillableEventConfirmed,
  trackChargeSucceeded,
  trackChargeFailed,
  trackBillableEventWaived,
} from "../posthog/events";
import logger from "../../lib/logger";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type BillableEventInput = {
  shopId: string;
  eventType: BillableEventType;
  amountMills: number;
  idempotencyKey: string;
  description?: string;
  sourceId?: string;
};

export type BillableEventResult = {
  created: boolean;
  eventId: string;
  status: BillableEventStatus;
};

export type BillableEventConfirmInput = {
  shopId: string;
  idempotencyKey: string;
};

export type BillableEventFailInput = {
  shopId: string;
  idempotencyKey: string;
  errorMessage?: string;
  waived?: boolean;
};

export type BillableEventSummary = {
  id: string;
  eventType: BillableEventType;
  status: BillableEventStatus;
  amountMills: number;
  amountUsd: number;
  idempotencyKey: string;
  description: string | null;
  createdAt: Date;
};

export type ListBillableEventsInput = {
  shopId: string;
  limit?: number;
  offset?: number;
};

// --------------------------------------------------------------------------
// Idempotency Key Builder
// --------------------------------------------------------------------------

export const buildBillableEventIdempotencyKey = (
  eventType: string,
  sourceId: string,
) => `billable_event:${eventType}:${sourceId}`;

// --------------------------------------------------------------------------
// Create Event (before provider call)
// --------------------------------------------------------------------------

export const createBillableEvent = async (
  input: BillableEventInput,
): Promise<BillableEventResult> => {
  try {
    const event = await prisma.billableEvent.create({
      data: {
        shop_id: input.shopId,
        event_type: input.eventType,
        status: BillableEventStatus.pending,
        amount_mills: input.amountMills,
        currency_code: "USD",
        idempotency_key: input.idempotencyKey,
        description: input.description,
        source_id: input.sourceId,
      },
    });

    // Emit telemetry for event creation
    trackBillableEventCreated({
      shopId: input.shopId,
      billableEventId: event.id,
      idempotencyKey: input.idempotencyKey,
      eventType: input.eventType,
      amountMills: input.amountMills,
      sourceId: input.sourceId,
    });

    logger.info(
      {
        shop_id: input.shopId,
        billable_event_id: event.id,
        idempotency_key: input.idempotencyKey,
        event_type: input.eventType,
        amount_mills: input.amountMills,
      },
      "Billable event created",
    );

    return {
      created: true,
      eventId: event.id,
      status: event.status,
    };
  } catch (error) {
    // Handle duplicate key (idempotency)
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      const existing = await prisma.billableEvent.findUnique({
        where: {
          shop_id_idempotency_key: {
            shop_id: input.shopId,
            idempotency_key: input.idempotencyKey,
          },
        },
        select: { id: true, status: true },
      });

      if (!existing) {
        throw error;
      }

      return {
        created: false,
        eventId: existing.id,
        status: existing.status,
      };
    }

    throw error;
  }
};

// --------------------------------------------------------------------------
// Confirm Event (after asset persisted)
// --------------------------------------------------------------------------

export const confirmBillableEvent = async (
  input: BillableEventConfirmInput,
): Promise<{ confirmed: boolean; eventId: string }> => {
  const event = await prisma.billableEvent.findUnique({
    where: {
      shop_id_idempotency_key: {
        shop_id: input.shopId,
        idempotency_key: input.idempotencyKey,
      },
    },
    select: { id: true, status: true, event_type: true, amount_mills: true },
  });

  if (!event) {
    throw new Error(`Billable event not found: ${input.idempotencyKey}`);
  }

  // Already confirmed or processed
  if (event.status !== BillableEventStatus.pending) {
    logger.info(
      {
        shop_id: input.shopId,
        billable_event_id: event.id,
        idempotency_key: input.idempotencyKey,
        existing_status: event.status,
      },
      "Billable event already processed, skipping confirmation",
    );
    return { confirmed: false, eventId: event.id };
  }

  await prisma.billableEvent.update({
    where: { id: event.id },
    data: { status: BillableEventStatus.confirmed },
  });

  // Emit telemetry for event confirmation
  trackBillableEventConfirmed({
    shopId: input.shopId,
    billableEventId: event.id,
    idempotencyKey: input.idempotencyKey,
    eventType: event.event_type,
    amountMills: event.amount_mills,
  });

  logger.info(
    {
      shop_id: input.shopId,
      billable_event_id: event.id,
      idempotency_key: input.idempotencyKey,
      event_type: event.event_type,
      amount_mills: event.amount_mills,
    },
    "Billable event confirmed",
  );

  return { confirmed: true, eventId: event.id };
};

// --------------------------------------------------------------------------
// Fail Event (provider cost not incurred OR cost incurred but not persisted)
// --------------------------------------------------------------------------

export const failBillableEvent = async (
  input: BillableEventFailInput,
): Promise<{ updated: boolean; eventId: string }> => {
  const event = await prisma.billableEvent.findUnique({
    where: {
      shop_id_idempotency_key: {
        shop_id: input.shopId,
        idempotency_key: input.idempotencyKey,
      },
    },
    select: { id: true, status: true, event_type: true, amount_mills: true },
  });

  if (!event) {
    throw new Error(`Billable event not found: ${input.idempotencyKey}`);
  }

  // Already processed
  if (
    event.status === BillableEventStatus.confirmed ||
    event.status === BillableEventStatus.failed ||
    event.status === BillableEventStatus.waived
  ) {
    logger.info(
      {
        shop_id: input.shopId,
        billable_event_id: event.id,
        idempotency_key: input.idempotencyKey,
        existing_status: event.status,
      },
      "Billable event already processed, skipping failure update",
    );
    return { updated: false, eventId: event.id };
  }

  const newStatus = input.waived
    ? BillableEventStatus.waived
    : BillableEventStatus.failed;

  await prisma.billableEvent.update({
    where: { id: event.id },
    data: {
      status: newStatus,
      error_message: input.errorMessage ?? null,
    },
  });

  // Emit telemetry for failure/waived
  if (input.waived) {
    trackBillableEventWaived({
      shopId: input.shopId,
      billableEventId: event.id,
      idempotencyKey: input.idempotencyKey,
      errorMessage: input.errorMessage,
    });

    logger.warn(
      {
        shop_id: input.shopId,
        billable_event_id: event.id,
        idempotency_key: input.idempotencyKey,
        event_type: event.event_type,
        amount_mills: event.amount_mills,
        error_message: input.errorMessage,
      },
      "Billable event waived (provider cost incurred but not persisted)",
    );
  } else {
    trackChargeFailed({
      shopId: input.shopId,
      billableEventId: event.id,
      idempotencyKey: input.idempotencyKey,
      errorMessage: input.errorMessage,
    });

    logger.info(
      {
        shop_id: input.shopId,
        billable_event_id: event.id,
        idempotency_key: input.idempotencyKey,
        event_type: event.event_type,
        error_message: input.errorMessage,
      },
      "Billable event failed (no provider cost incurred)",
    );
  }

  return { updated: true, eventId: event.id };
};

// --------------------------------------------------------------------------
// Get Event by Idempotency Key
// --------------------------------------------------------------------------

export const getBillableEventByIdempotencyKey = async (
  shopId: string,
  idempotencyKey: string,
) => {
  return prisma.billableEvent.findUnique({
    where: {
      shop_id_idempotency_key: {
        shop_id: shopId,
        idempotency_key: idempotencyKey,
      },
    },
  });
};

// --------------------------------------------------------------------------
// List Recent Events (for UI)
// --------------------------------------------------------------------------

export const listBillableEvents = async (
  input: ListBillableEventsInput,
): Promise<BillableEventSummary[]> => {
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;

  const events = await prisma.billableEvent.findMany({
    where: {
      shop_id: input.shopId,
    },
    orderBy: {
      created_at: "desc",
    },
    take: limit,
    skip: offset,
    select: {
      id: true,
      event_type: true,
      status: true,
      amount_mills: true,
      idempotency_key: true,
      description: true,
      created_at: true,
    },
  });

  return events.map((event) => ({
    id: event.id,
    eventType: event.event_type,
    status: event.status,
    amountMills: event.amount_mills,
    amountUsd: millsToUsd(event.amount_mills),
    idempotencyKey: event.idempotency_key,
    description: event.description,
    createdAt: event.created_at,
  }));
};

// --------------------------------------------------------------------------
// Count Events (for pagination)
// --------------------------------------------------------------------------

export const countBillableEvents = async (shopId: string): Promise<number> => {
  return prisma.billableEvent.count({
    where: {
      shop_id: shopId,
    },
  });
};

// --------------------------------------------------------------------------
// Dev Utilities
// --------------------------------------------------------------------------

export const waivePendingTemplateTestGenerationEvents = async (
  shopId: string,
): Promise<{ updated: number }> => {
  if (process.env.NODE_ENV !== "development") {
    logger.warn(
      { shop_id: shopId },
      "Attempted to run dev-only billing waiver in non-dev environment",
    );
    throw new Error("This operation is only allowed in development mode.");
  }

  const pendingEvents = await prisma.billableEvent.findMany({
    where: {
      shop_id: shopId,
      status: BillableEventStatus.pending,
      event_type: BillableEventType.generation,
      description: "template_test_generation",
    },
    select: { id: true, idempotency_key: true },
  });

  if (pendingEvents.length === 0) {
    return { updated: 0 };
  }

  const updated = await prisma.billableEvent.updateMany({
    where: {
      id: { in: pendingEvents.map((event: { id: string }) => event.id) },
    },
    data: {
      status: BillableEventStatus.waived,
      error_message: "reconciled_after_remove_bg_charge",
    },
  });

  pendingEvents.forEach((event: { id: string; idempotency_key: string }) => {
    trackBillableEventWaived({
      shopId,
      billableEventId: event.id,
      idempotencyKey: event.idempotency_key,
      errorMessage: "reconciled_after_remove_bg_charge",
    });
  });

  logger.warn(
    {
      shop_id: shopId,
      updated_count: updated.count,
    },
    "Dev utility waived pending template test generation events",
  );

  return { updated: updated.count };
};

// --------------------------------------------------------------------------
// Integration: Confirm Event and Record Usage Charge
// --------------------------------------------------------------------------

import {
  recordUsageCharge,
  buildUsageChargeIdempotencyKey,
} from "./billing.server";

export type ConfirmAndChargeInput = {
  shopId: string;
  idempotencyKey: string;
  totalCostUsd: number;
  description?: string;
};

export type ConfirmAndChargeResult = {
  confirmed: boolean;
  eventId: string;
  chargeResult: {
    created: boolean;
    giftAppliedMills: number;
    paidUsageMills: number;
  } | null;
};

/**
 * Confirms a billable event and creates the corresponding usage charge.
 * This should be called AFTER the provider cost has been incurred AND the
 * result has been persisted.
 *
 * AC 5: exactly one billable event is created, billing finalized only once result is persisted
 * AC 6: exactly one Shopify Usage Charge after applying gift balance
 */
export const confirmAndCharge = async (
  input: ConfirmAndChargeInput,
): Promise<ConfirmAndChargeResult> => {
  const existingEvent = await getBillableEventByIdempotencyKey(
    input.shopId,
    input.idempotencyKey,
  );

  if (!existingEvent) {
    throw new Error(`Billable event not found: ${input.idempotencyKey}`);
  }

  if (existingEvent.status !== BillableEventStatus.pending) {
    return {
      confirmed: false,
      eventId: existingEvent.id,
      chargeResult: null,
    };
  }

  const chargeResult = await recordUsageCharge({
    shopId: input.shopId,
    totalCostUsd: input.totalCostUsd,
    idempotencyKey: buildUsageChargeIdempotencyKey(
      "billable_event",
      existingEvent.id,
    ),
    description: input.description,
  });

  const confirmResult = await confirmBillableEvent({
    shopId: input.shopId,
    idempotencyKey: input.idempotencyKey,
  });

  if (chargeResult.created) {
    trackChargeSucceeded({
      shopId: input.shopId,
      billableEventId: existingEvent.id,
      idempotencyKey: input.idempotencyKey,
      totalCostMills: Math.round(input.totalCostUsd * 1000),
      giftAppliedMills: chargeResult.giftAppliedMills,
      paidUsageMills: chargeResult.paidUsageMills,
    });
  }

  logger.info(
    {
      shop_id: input.shopId,
      billable_event_id: existingEvent.id,
      idempotency_key: input.idempotencyKey,
      total_cost_mills: Math.round(input.totalCostUsd * 1000),
      gift_applied_mills: chargeResult.giftAppliedMills,
      paid_usage_mills: chargeResult.paidUsageMills,
      charge_created: chargeResult.created,
      event_confirmed: confirmResult.confirmed,
    },
    "Billable event charged successfully",
  );

  return {
    confirmed: confirmResult.confirmed,
    eventId: existingEvent.id,
    chargeResult,
  };
};

// --------------------------------------------------------------------------
// Map Event Type from Description
// --------------------------------------------------------------------------

/**
 * Maps a description string to a BillableEventType enum value.
 */
export const mapDescriptionToEventType = (
  description: string,
): BillableEventType => {
  const desc = description.toLowerCase();
  if (
    desc.includes("remove_bg") ||
    desc.includes("background") ||
    desc.includes("remove bg")
  ) {
    return BillableEventType.remove_bg;
  }
  if (desc.includes("regenerat")) {
    return BillableEventType.regeneration;
  }
  if (desc.includes("order_fee") || desc.includes("order fee")) {
    return BillableEventType.order_fee;
  }
  // Default to generation
  return BillableEventType.generation;
};
