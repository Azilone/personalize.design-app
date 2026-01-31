import { z } from "zod";

import logger from "../../lib/logger";
import { PrintifyRequestError } from "./client.server";
import { getPrintifyIntegrationWithToken } from "./integration.server";
import { decryptPrintifyToken } from "./token-encryption.server";
import {
  PRINTIFY_BASE_URL,
  assertPrintifyOk,
  fetchPrintify,
} from "./request.server";

export type PrintifyShippingAddress = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address1: string;
  address2?: string;
  city: string;
  region: string;
  zip: string;
  country: string;
};

export type PrintifyShippingLineItem = {
  productId: string;
  variantId: number;
  quantity: number;
};

export type PrintifyShippingMethod = {
  id: number;
  name: string | null;
  cost: number | null;
};

export type PreferredShippingChoice = {
  name?: string | null;
  price?: number | null;
};

const shippingMethodSchema = z.object({
  id: z.union([z.number(), z.string()]),
  name: z.string().optional().nullable(),
  rate: z.number().optional().nullable(),
  cost: z.number().optional().nullable(),
  price: z
    .object({
      amount: z.number().optional().nullable(),
    })
    .optional()
    .nullable(),
  first_item: z
    .object({
      cost: z.number().optional().nullable(),
      amount: z.number().optional().nullable(),
    })
    .optional()
    .nullable(),
});

const shippingMethodsResponseSchema = z.union([
  z.array(shippingMethodSchema),
  z.object({ data: z.array(shippingMethodSchema) }),
]);

const normalizeShippingMethods = (payload: unknown) => {
  const parsed = shippingMethodsResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return [] as Array<z.infer<typeof shippingMethodSchema>>;
  }
  return Array.isArray(parsed.data) ? parsed.data : parsed.data.data;
};

const resolveShippingCost = (
  method: z.infer<typeof shippingMethodSchema>,
): number | null => {
  if (typeof method.rate === "number") return method.rate;
  if (typeof method.cost === "number") return method.cost;
  if (typeof method.price?.amount === "number") return method.price.amount;
  if (typeof method.first_item?.cost === "number")
    return method.first_item.cost;
  if (typeof method.first_item?.amount === "number")
    return method.first_item.amount;
  return null;
};

const normalizeName = (value: string | null | undefined) =>
  value ? value.trim().toLowerCase() : "";

const selectByName = (
  methods: Array<{
    method: z.infer<typeof shippingMethodSchema>;
    cost: number | null;
  }>,
  preferredName: string,
  preferredPrice: number | null,
) => {
  const normalized = normalizeName(preferredName);
  if (!normalized) return null;

  const exact = methods.filter(
    (candidate) => normalizeName(candidate.method.name) === normalized,
  );

  if (exact.length) {
    if (preferredPrice === null) return exact[0];
    return exact.sort((a, b) => {
      const diffA =
        a.cost === null
          ? Number.POSITIVE_INFINITY
          : Math.abs(a.cost - preferredPrice);
      const diffB =
        b.cost === null
          ? Number.POSITIVE_INFINITY
          : Math.abs(b.cost - preferredPrice);
      return diffA - diffB;
    })[0];
  }

  const partial = methods.filter((candidate) => {
    const name = normalizeName(candidate.method.name);
    return name.includes(normalized) || normalized.includes(name);
  });

  if (!partial.length) return null;
  if (preferredPrice === null) return partial[0];
  return partial.sort((a, b) => {
    const diffA =
      a.cost === null
        ? Number.POSITIVE_INFINITY
        : Math.abs(a.cost - preferredPrice);
    const diffB =
      b.cost === null
        ? Number.POSITIVE_INFINITY
        : Math.abs(b.cost - preferredPrice);
    return diffA - diffB;
  })[0];
};

export const selectPrintifyShippingMethod = async (input: {
  shopId: string;
  address: PrintifyShippingAddress;
  lineItems: PrintifyShippingLineItem[];
  preferred?: PreferredShippingChoice;
}): Promise<PrintifyShippingMethod | null> => {
  const integration = await getPrintifyIntegrationWithToken(input.shopId);
  if (!integration) {
    throw new PrintifyRequestError(
      "printify_not_configured",
      "Printify integration not configured for this shop.",
    );
  }

  const token = decryptPrintifyToken(integration.encryptedToken);

  const payload = {
    line_items: input.lineItems.map((item) => ({
      product_id: item.productId,
      variant_id: item.variantId,
      quantity: item.quantity,
    })),
    address_to: {
      first_name: input.address.firstName,
      last_name: input.address.lastName,
      email: input.address.email,
      phone: input.address.phone ?? "",
      address1: input.address.address1,
      address2: input.address.address2 ?? "",
      city: input.address.city,
      region: input.address.region,
      zip: input.address.zip,
      country: input.address.country,
    },
  };

  const response = await fetchPrintify(
    `${PRINTIFY_BASE_URL}/shops/${integration.printifyShopId}/orders/shipping.json`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  await assertPrintifyOk(response, "Unable to calculate Printify shipping.");

  const responseData = (await response.json()) as unknown;
  const methods = normalizeShippingMethods(responseData);

  if (!methods.length) {
    logger.warn(
      {
        shop_id: input.shopId,
        printify_shop_id: integration.printifyShopId,
      },
      "Printify shipping response had no methods",
    );
    return null;
  }

  const ranked = methods
    .map((method) => ({
      method,
      cost: resolveShippingCost(method),
    }))
    .sort((a, b) => {
      if (a.cost === null && b.cost === null) return 0;
      if (a.cost === null) return 1;
      if (b.cost === null) return -1;
      return a.cost - b.cost;
    });

  const preferredName = input.preferred?.name ?? null;
  const preferredPrice =
    typeof input.preferred?.price === "number" ? input.preferred.price : null;

  const matchedByName = preferredName
    ? selectByName(ranked, preferredName, preferredPrice)
    : null;

  const matchedByPrice =
    !matchedByName && preferredPrice !== null
      ? ranked
          .filter((candidate) => candidate.cost !== null)
          .sort(
            (a, b) =>
              Math.abs((a.cost ?? 0) - preferredPrice) -
              Math.abs((b.cost ?? 0) - preferredPrice),
          )[0]
      : null;

  const selected =
    matchedByName?.method ??
    matchedByPrice?.method ??
    ranked[0]?.method ??
    methods[0];
  const selectedCost = selected ? resolveShippingCost(selected) : null;

  return {
    id: Number(selected.id),
    name: selected.name ?? null,
    cost: selectedCost,
  };
};
