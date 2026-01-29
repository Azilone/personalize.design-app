import { z } from "zod";

export const LineItemPropertySchema = z.object({
  name: z.string(),
  value: z.string(),
});

export const LineItemSchema = z.object({
  id: z.union([z.string(), z.number()]),
  product_id: z.union([z.string(), z.number()]).optional(),
  variant_id: z.union([z.string(), z.number()]).optional(),
  quantity: z.number(),
  price: z.string(),
  properties: z.array(LineItemPropertySchema).default([]),
});

export const OrderPaidPayloadSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  email: z.string().optional(),
  line_items: z.array(LineItemSchema),
  total_price: z.string(),
  currency: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type LineItemProperty = z.infer<typeof LineItemPropertySchema>;
export type LineItem = z.infer<typeof LineItemSchema>;
export type OrderPaidPayload = z.infer<typeof OrderPaidPayloadSchema>;
