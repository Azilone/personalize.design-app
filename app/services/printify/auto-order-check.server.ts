import type { PrintifyOrderDetails } from "./order-details.server";
import prisma from "../../db.server";

export type AutoOrderCheckResult =
  | { action: "skip"; reason: "not_personalized" }
  | { action: "cancel"; reason: "auto_imported_without_external_id" }
  | { action: "warn"; reason: "valid_external_id_no_record" };

/**
 * Check if an auto-imported Printify order should be cancelled.
 *
 * This function determines whether a Printify order that was auto-imported
 * (not created by our system) should be cancelled because it contains
 * personalized products but doesn't have our expected external_id format.
 *
 * Business logic:
 * 1. If order doesn't contain personalized products → skip (no action needed)
 * 2. If order contains personalized products but has invalid external_id → cancel
 * 3. If order contains personalized products and has valid external_id → warn (unexpected)
 *
 * @param shopId - The shop ID in our system
 * @param orderDetails - Details of the Printify order including external_id and line items
 * @returns Object describing what action to take and why
 */
export const checkAutoImportedOrder = async (
  shopId: string,
  orderDetails: PrintifyOrderDetails,
): Promise<AutoOrderCheckResult> => {
  // Check if any line items are personalized products
  const printifyProductIds = orderDetails.lineItems.map(
    (item) => item.productId,
  );

  const shopProducts = await prisma.shopProduct.findMany({
    where: {
      shop_id: shopId,
      printify_product_id: { in: printifyProductIds },
    },
    select: { product_id: true },
  });

  const shopProductIds = shopProducts.map((product) => product.product_id);
  const personalizedAssignment = shopProductIds.length
    ? await prisma.productTemplateAssignment.findFirst({
        where: {
          shop_id: shopId,
          product_id: { in: shopProductIds },
          personalization_enabled: true,
        },
        select: { id: true },
      })
    : null;

  if (!personalizedAssignment) {
    return { action: "skip", reason: "not_personalized" };
  }

  // Check if external_id follows our expected format
  const hasValidExternalId = isValidPersonalizeExternalId(
    orderDetails.externalId,
  );

  if (!hasValidExternalId) {
    return { action: "cancel", reason: "auto_imported_without_external_id" };
  }

  return { action: "warn", reason: "valid_external_id_no_record" };
};

/**
 * Validates if an external_id follows our expected format.
 *
 * Expected format: "{shopifyOrderId}-{orderLineId}"
 * Examples:
 * - "gid://shopify/Order/1234567890-gid://shopify/LineItem/9876543210"
 * - "1234567890-9876543210"
 *
 * Requirements:
 * - Must contain exactly one hyphen
 * - Both parts must be non-empty
 * - Minimum length of 5 characters total (to avoid matching "1-1")
 *
 * @param externalId - The external_id to validate
 * @returns true if the external_id follows our expected format
 */
export const isValidPersonalizeExternalId = (
  externalId: string | null,
): boolean => {
  if (!externalId) return false;

  // Must have exactly one hyphen
  const parts = externalId.split("-");
  if (parts.length !== 2) return false;

  const [part1, part2] = parts;

  // Both parts must be non-empty
  if (!part1 || !part2) return false;

  // Minimum length check to avoid matching "1-1" or similar
  if (externalId.length < 5) return false;

  // Both parts should contain at least one alphanumeric character
  const hasContent = /^[a-zA-Z0-9].*[a-zA-Z0-9]$/;
  if (!hasContent.test(part1) || !hasContent.test(part2)) return false;

  return true;
};
