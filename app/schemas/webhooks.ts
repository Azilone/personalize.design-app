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

/**
 * Shopify shipping address schema (Story 7.3)
 */
export const ShippingAddressSchema = z.object({
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  address1: z.string().nullable().optional(),
  address2: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  province: z.string().nullable().optional(),
  province_code: z.string().nullable().optional(),
  zip: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  country_code: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
});

export const ShippingLineSchema = z.object({
  title: z.string(),
  code: z.string().nullable().optional(),
  price: z.string().nullable().optional(),
});

export type ShippingAddress = z.infer<typeof ShippingAddressSchema>;

/**
 * Shopify customer schema (Story 7.3)
 */
export const CustomerSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  email: z.string().nullable().optional(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
});

export type Customer = z.infer<typeof CustomerSchema>;

export const OrderPaidPayloadSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  email: z.string().optional(),
  line_items: z.array(LineItemSchema),
  total_price: z.string(),
  currency: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  // Shipping info for Printify submission (Story 7.3)
  shipping_address: ShippingAddressSchema.nullable().optional(),
  shipping_lines: z.array(ShippingLineSchema).optional(),
  customer: CustomerSchema.nullable().optional(),
});

export type LineItemProperty = z.infer<typeof LineItemPropertySchema>;
export type LineItem = z.infer<typeof LineItemSchema>;
export type OrderPaidPayload = z.infer<typeof OrderPaidPayloadSchema>;
