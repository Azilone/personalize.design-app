import { beforeEach, describe, expect, it, vi } from "vitest";
import { BillableEventStatus, BillableEventType } from "@prisma/client";

const mockPrisma = vi.hoisted(() => ({
  billableEvent: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(),
}));

const mockTrackBillableEventCreated = vi.hoisted(() => vi.fn());
const mockTrackBillableEventConfirmed = vi.hoisted(() => vi.fn());
const mockTrackChargeSucceeded = vi.hoisted(() => vi.fn());
const mockTrackChargeFailed = vi.hoisted(() => vi.fn());
const mockTrackBillableEventWaived = vi.hoisted(() => vi.fn());

const mockRecordUsageCharge = vi.hoisted(() => vi.fn());

vi.mock("../../db.server", () => ({
  default: mockPrisma,
}));

vi.mock("../posthog/events", () => ({
  trackBillableEventCreated: mockTrackBillableEventCreated,
  trackBillableEventConfirmed: mockTrackBillableEventConfirmed,
  trackChargeSucceeded: mockTrackChargeSucceeded,
  trackChargeFailed: mockTrackChargeFailed,
  trackBillableEventWaived: mockTrackBillableEventWaived,
}));

vi.mock("./billing.server", () => ({
  recordUsageCharge: mockRecordUsageCharge,
  buildUsageChargeIdempotencyKey: (prefix: string, eventId: string) =>
    `${prefix}:${eventId}`,
}));

// Import AFTER mocks
import {
  createBillableEvent,
  confirmBillableEvent,
  failBillableEvent,
  confirmAndCharge,
  listBillableEvents,
  mapDescriptionToEventType,
} from "./billable-events.server";

describe("createBillableEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a pending event and tracks telemetry", async () => {
    mockPrisma.billableEvent.create.mockResolvedValue({
      id: "evt_123",
      status: BillableEventStatus.pending,
    });

    const result = await createBillableEvent({
      shopId: "shop.myshopify.com",
      eventType: BillableEventType.generation,
      amountMills: 50,
      idempotencyKey: "key_1",
      description: "Test gen",
    });

    expect(result).toEqual({
      created: true,
      eventId: "evt_123",
      status: BillableEventStatus.pending,
    });

    expect(mockPrisma.billableEvent.create).toHaveBeenCalledWith({
      data: {
        shop_id: "shop.myshopify.com",
        event_type: BillableEventType.generation,
        status: BillableEventStatus.pending,
        amount_mills: 50,
        currency_code: "USD",
        idempotency_key: "key_1",
        description: "Test gen",
        source_id: undefined,
      },
    });

    expect(mockTrackBillableEventCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: "shop.myshopify.com",
        billableEventId: "evt_123",
        amountMills: 50,
      }),
    );
  });

  it("returns existing event on duplicate key", async () => {
    const error = Object.assign(new Error("duplicate"), { code: "P2002" });
    mockPrisma.billableEvent.create.mockRejectedValue(error);
    mockPrisma.billableEvent.findUnique.mockResolvedValue({
      id: "evt_existing",
      status: BillableEventStatus.confirmed,
    });

    const result = await createBillableEvent({
      shopId: "shop.myshopify.com",
      eventType: BillableEventType.generation,
      amountMills: 50,
      idempotencyKey: "key_1",
    });

    expect(result).toEqual({
      created: false,
      eventId: "evt_existing",
      status: BillableEventStatus.confirmed,
    });

    expect(mockTrackBillableEventCreated).not.toHaveBeenCalled();
  });
});

describe("confirmBillableEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("confirms pending event and tracks telemetry", async () => {
    mockPrisma.billableEvent.findUnique.mockResolvedValue({
      id: "evt_123",
      status: BillableEventStatus.pending,
      event_type: BillableEventType.generation,
      amount_mills: 50,
    });
    mockPrisma.billableEvent.update.mockResolvedValue({});

    const result = await confirmBillableEvent({
      shopId: "shop.myshopify.com",
      idempotencyKey: "key_1",
    });

    expect(result).toEqual({ confirmed: true, eventId: "evt_123" });
    expect(mockPrisma.billableEvent.update).toHaveBeenCalledWith({
      where: { id: "evt_123" },
      data: { status: BillableEventStatus.confirmed },
    });
    expect(mockTrackBillableEventConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({
        billableEventId: "evt_123",
        amountMills: 50,
      }),
    );
  });

  it("skips confirmation if already confirmed", async () => {
    mockPrisma.billableEvent.findUnique.mockResolvedValue({
      id: "evt_123",
      status: BillableEventStatus.confirmed,
      event_type: BillableEventType.generation,
      amount_mills: 50,
    });

    const result = await confirmBillableEvent({
      shopId: "shop.myshopify.com",
      idempotencyKey: "key_1",
    });

    expect(result).toEqual({ confirmed: false, eventId: "evt_123" });
    expect(mockPrisma.billableEvent.update).not.toHaveBeenCalled();
    expect(mockTrackBillableEventConfirmed).not.toHaveBeenCalled();
  });
});

describe("failBillableEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks event as failed (no cost incurred)", async () => {
    mockPrisma.billableEvent.findUnique.mockResolvedValue({
      id: "evt_123",
      status: BillableEventStatus.pending,
      event_type: BillableEventType.generation,
    });

    const result = await failBillableEvent({
      shopId: "shop.myshopify.com",
      idempotencyKey: "key_1",
      errorMessage: "Generation failed",
    });

    expect(result).toEqual({ updated: true, eventId: "evt_123" });
    expect(mockPrisma.billableEvent.update).toHaveBeenCalledWith({
      where: { id: "evt_123" },
      data: {
        status: BillableEventStatus.failed,
        error_message: "Generation failed",
      },
    });
    expect(mockTrackChargeFailed).toHaveBeenCalled();
    expect(mockTrackBillableEventWaived).not.toHaveBeenCalled();
  });

  it("marks event as waived (cost incurred but not persisted)", async () => {
    mockPrisma.billableEvent.findUnique.mockResolvedValue({
      id: "evt_123",
      status: BillableEventStatus.pending,
      event_type: BillableEventType.generation,
    });

    const result = await failBillableEvent({
      shopId: "shop.myshopify.com",
      idempotencyKey: "key_1",
      errorMessage: "Storage error",
      waived: true,
    });

    expect(result).toEqual({ updated: true, eventId: "evt_123" });
    expect(mockPrisma.billableEvent.update).toHaveBeenCalledWith({
      where: { id: "evt_123" },
      data: {
        status: BillableEventStatus.waived,
        error_message: "Storage error",
      },
    });
    expect(mockTrackBillableEventWaived).toHaveBeenCalled();
    expect(mockTrackChargeFailed).not.toHaveBeenCalled();
  });
});

describe("confirmAndCharge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("confirms event and records usage charge", async () => {
    // Mock confirm step
    mockPrisma.billableEvent.findUnique.mockResolvedValue({
      id: "evt_123",
      status: BillableEventStatus.pending,
      event_type: BillableEventType.generation,
      amount_mills: 50,
    });

    // Mock charge step
    mockRecordUsageCharge.mockResolvedValue({
      created: true,
      giftAppliedMills: 0,
      paidUsageMills: 50,
    });

    const result = await confirmAndCharge({
      shopId: "shop.myshopify.com",
      idempotencyKey: "key_1",
      totalCostUsd: 0.05,
    });

    expect(result.confirmed).toBe(true);
    expect(result.chargeResult).toBeDefined();

    expect(mockPrisma.billableEvent.update).toHaveBeenCalledWith({
      where: { id: "evt_123" },
      data: { status: BillableEventStatus.confirmed },
    });

    expect(mockRecordUsageCharge).toHaveBeenCalledWith({
      shopId: "shop.myshopify.com",
      totalCostUsd: 0.05,
      idempotencyKey: "billable_event:evt_123",
      description: undefined,
    });

    expect(mockTrackChargeSucceeded).toHaveBeenCalled();
  });

  it("skips charge if event already confirmed", async () => {
    mockPrisma.billableEvent.findUnique.mockResolvedValue({
      id: "evt_123",
      status: BillableEventStatus.confirmed, // Already confirmed
      event_type: BillableEventType.generation,
      amount_mills: 50,
    });

    const result = await confirmAndCharge({
      shopId: "shop.myshopify.com",
      idempotencyKey: "key_1",
      totalCostUsd: 0.05,
    });

    expect(result.confirmed).toBe(false);
    expect(result.chargeResult).toBeNull();
    expect(mockRecordUsageCharge).not.toHaveBeenCalled();
  });
});

describe("mapDescriptionToEventType", () => {
  it("maps Remove BG", () => {
    expect(mapDescriptionToEventType("Remove BG for product")).toBe(
      BillableEventType.remove_bg,
    );
  });
  it("maps Regeneration", () => {
    expect(mapDescriptionToEventType("Regenerate image")).toBe(
      BillableEventType.regeneration,
    );
  });
  it("maps Order Fee", () => {
    expect(mapDescriptionToEventType("Order fee for item")).toBe(
      BillableEventType.order_fee,
    );
  });
  it("defaults to Generation", () => {
    expect(mapDescriptionToEventType("Create new image")).toBe(
      BillableEventType.generation,
    );
  });
});

describe("listBillableEvents", () => {
  it("fetches and maps events", async () => {
    const date = new Date();
    mockPrisma.billableEvent.findMany.mockResolvedValue([
      {
        id: "evt_1",
        event_type: BillableEventType.generation,
        status: BillableEventStatus.confirmed,
        amount_mills: 50,
        idempotency_key: "key_1",
        description: "Test",
        created_at: date,
      },
    ]);

    const results = await listBillableEvents({ shopId: "shop.myshopify.com" });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      id: "evt_1",
      eventType: BillableEventType.generation,
      status: BillableEventStatus.confirmed,
      amountMills: 50,
      amountUsd: 0.05, // 50 mills = $0.05
      idempotencyKey: "key_1",
      description: "Test",
      createdAt: date,
    });
  });
});
