import { z } from "zod";

export const billingSummarySchema = z.object({
  monthlyCapCents: z.number().int().nonnegative(),
  paidUsageConsentAt: z.string().nullable(),
  giftGrantTotalMills: z.number().int().nonnegative(),
  giftBalanceMills: z.number().int().nonnegative(),
  paidUsageMonthToDateMills: z.number().int().nonnegative(),
  planStatus: z.enum([
    "none",
    "standard",
    "early_access",
    "standard_pending",
    "early_access_pending",
  ]),
});

export type BillingSummary = z.infer<typeof billingSummarySchema>;

export const billableEventSchema = z.object({
  id: z.string(),
  eventType: z.enum(["generation", "regeneration", "remove_bg", "order_fee"]),
  status: z.enum(["pending", "confirmed", "failed", "waived"]),
  amountMills: z.number().int(),
  amountUsd: z.number(),
  idempotencyKey: z.string(),
  description: z.string().nullable(),
  createdAt: z.string(),
});

export const billableEventsListSchema = z.array(billableEventSchema);

export type BillableEvent = z.infer<typeof billableEventSchema>;
