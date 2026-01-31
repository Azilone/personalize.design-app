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

export type PrintifyProductVariant = {
  id: number;
  title: string;
  price: number;
  isEnabled: boolean;
};

export type PrintifyProductDetails = {
  blueprintId: number;
  printProviderId: number;
  variants: PrintifyProductVariant[];
};

const printifyProductVariantSchema = z.object({
  id: z.number(),
  title: z.string(),
  price: z.number().optional(),
  is_enabled: z.boolean().optional(),
});

const printifyProductDetailsSchema = z.object({
  id: z.union([z.string(), z.number()]),
  blueprint_id: z.number(),
  print_provider_id: z.number(),
  variants: z.array(printifyProductVariantSchema),
});

export const getPrintifyProductDetails = async (
  shopId: string,
  printifyProductId: string,
): Promise<PrintifyProductDetails> => {
  const integration = await getPrintifyIntegrationWithToken(shopId);
  if (!integration) {
    throw new PrintifyRequestError(
      "unexpected_response",
      "Printify integration not configured for this shop.",
    );
  }

  const token = decryptPrintifyToken(integration.encryptedToken);
  const response = await fetchPrintify(
    `${PRINTIFY_BASE_URL}/shops/${integration.printifyShopId}/products/${printifyProductId}.json`,
    token,
    { method: "GET" },
  );

  await assertPrintifyOk(response, "Unable to fetch Printify product details.");

  const payload = (await response.json()) as unknown;
  const parsed = printifyProductDetailsSchema.safeParse(payload);
  if (!parsed.success) {
    throw new PrintifyRequestError(
      "unexpected_response",
      "Printify product details response was invalid.",
    );
  }

  const variants = parsed.data.variants.map((variant) => ({
    id: variant.id,
    title: variant.title,
    price: variant.price ?? 0,
    isEnabled: variant.is_enabled ?? true,
  }));

  logger.info(
    {
      shop_id: shopId,
      printify_shop_id: integration.printifyShopId,
      printify_product_id: printifyProductId,
      blueprint_id: parsed.data.blueprint_id,
      print_provider_id: parsed.data.print_provider_id,
      variant_count: variants.length,
    },
    "Fetched Printify product details",
  );

  return {
    blueprintId: parsed.data.blueprint_id,
    printProviderId: parsed.data.print_provider_id,
    variants,
  };
};
