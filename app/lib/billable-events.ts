// --------------------------------------------------------------------------
// Shared Constants (Decoupled from @prisma/client for client-side safety)
// --------------------------------------------------------------------------

export const BillableEventType = {
  generation: "generation",
  regeneration: "regeneration",
  remove_bg: "remove_bg",
  order_fee: "order_fee",
} as const;

export type BillableEventType =
  (typeof BillableEventType)[keyof typeof BillableEventType];

export const BillableEventStatus = {
  pending: "pending",
  confirmed: "confirmed",
  failed: "failed",
  waived: "waived",
} as const;

export type BillableEventStatus =
  (typeof BillableEventStatus)[keyof typeof BillableEventStatus];

// --------------------------------------------------------------------------
// Event Type Labels (for UI display)
// --------------------------------------------------------------------------

export const BILLABLE_EVENT_TYPE_LABELS: Record<BillableEventType, string> = {
  [BillableEventType.generation]: "AI generation",
  [BillableEventType.regeneration]: "AI regeneration",
  [BillableEventType.remove_bg]: "Background removal",
  [BillableEventType.order_fee]: "Order line fee",
};

export const BILLABLE_EVENT_STATUS_LABELS: Record<BillableEventStatus, string> =
  {
    [BillableEventStatus.pending]: "Pending",
    [BillableEventStatus.confirmed]: "Succeeded",
    [BillableEventStatus.failed]: "Failed",
    [BillableEventStatus.waived]: "Waived",
  };

export const getBillableEventTypeLabel = (eventType: BillableEventType) =>
  BILLABLE_EVENT_TYPE_LABELS[eventType] ?? eventType;

export const getBillableEventStatusLabel = (status: BillableEventStatus) =>
  BILLABLE_EVENT_STATUS_LABELS[status] ?? status;
