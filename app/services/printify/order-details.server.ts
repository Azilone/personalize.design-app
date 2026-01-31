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

export type PrintifyOrderDetails = {
  externalId: string | null;
  lineItems: Array<{ productId: string }>;
  status: string | null;
};

const printifyOrderDetailsSchema = z.object({
  external_id: z.string().nullish(),
  line_items: z
    .array(
      z.object({
        product_id: z.union([z.string(), z.number()]),
      }),
    )
    .default([]),
  status: z.string().nullish(),
});

export const getPrintifyOrderDetails = async (
  shopId: string,
  printifyOrderId: string,
): Promise<PrintifyOrderDetails> => {
  const integration = await getPrintifyIntegrationWithToken(shopId);
  if (!integration) {
    throw new PrintifyRequestError(
      "printify_not_configured",
      "Printify integration not configured for this shop.",
    );
  }

  const token = decryptPrintifyToken(integration.encryptedToken);
  const response = await fetchPrintify(
    `${PRINTIFY_BASE_URL}/shops/${integration.printifyShopId}/orders/${printifyOrderId}.json`,
    token,
    { method: "GET" },
  );

  await assertPrintifyOk(response, "Unable to fetch Printify order details.");

  const payload = (await response.json()) as unknown;
  const parsed = printifyOrderDetailsSchema.safeParse(payload);
  if (!parsed.success) {
    logger.warn(
      {
        shop_id: shopId,
        printify_shop_id: integration.printifyShopId,
        printify_order_id: printifyOrderId,
        errors: parsed.error.flatten(),
      },
      "Invalid Printify order details response",
    );
    throw new PrintifyRequestError(
      "unexpected_response",
      "Printify order details response was invalid.",
    );
  }

  return {
    externalId: parsed.data.external_id ?? null,
    lineItems: parsed.data.line_items.map((item) => ({
      productId: String(item.product_id),
    })),
    status: parsed.data.status ?? null,
  };
};
