import logger from "../../lib/logger";
import { PrintifyRequestError } from "./client.server";
import { getPrintifyIntegrationWithToken } from "./integration.server";
import { decryptPrintifyToken } from "./token-encryption.server";
import {
  PRINTIFY_BASE_URL,
  assertPrintifyOk,
  fetchPrintify,
} from "./request.server";

type CancelPrintifyOrderInput = {
  shopId: string;
  printifyOrderId: string;
};

/**
 * Statuses that allow order cancellation.
 * Once an order moves to production, it typically cannot be cancelled.
 */
const CANCELLABLE_STATUSES = ["pending", "on-hold", "waiting-for-approval"];

/**
 * Check if a Printify order can be cancelled based on its status.
 *
 * @param status - The current status of the Printify order
 * @returns true if the order can be cancelled
 */
export const canCancelPrintifyOrder = (status: string | null): boolean => {
  if (!status) return true; // If status unknown, attempt cancellation
  return CANCELLABLE_STATUSES.includes(status.toLowerCase());
};

export const cancelPrintifyOrder = async (
  input: CancelPrintifyOrderInput,
): Promise<void> => {
  const integration = await getPrintifyIntegrationWithToken(input.shopId);
  if (!integration) {
    throw new PrintifyRequestError(
      "printify_not_configured",
      "Printify integration not configured for this shop.",
    );
  }

  const token = decryptPrintifyToken(integration.encryptedToken);
  const response = await fetchPrintify(
    `${PRINTIFY_BASE_URL}/shops/${integration.printifyShopId}/orders/${input.printifyOrderId}/cancel.json`,
    token,
    { method: "POST" },
  );

  await assertPrintifyOk(response, "Unable to cancel Printify order.");

  logger.info(
    {
      shop_id: input.shopId,
      printify_shop_id: integration.printifyShopId,
      printify_order_id: input.printifyOrderId,
    },
    "Printify order cancelled",
  );
};
