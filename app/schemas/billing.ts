import { z } from "zod";

export const billingSummarySchema = z.object({
  monthlyCapCents: z.number().int().nonnegative(),
  paidUsageConsentAt: z.string().nullable(),
  giftGrantTotalCents: z.number().int().nonnegative(),
  giftBalanceCents: z.number().int().nonnegative(),
  paidUsageMonthToDateCents: z.number().int().nonnegative(),
  planStatus: z.enum([
    "none",
    "standard",
    "early_access",
    "standard_pending",
    "early_access_pending",
  ]),
});

export type BillingSummary = z.infer<typeof billingSummarySchema>;
