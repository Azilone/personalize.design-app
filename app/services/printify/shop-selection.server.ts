import type { PrintifyShopChoice } from "./client.server";

/**
 * Pure helper function: Select the best Printify shop during token rotation.
 *
 * Priority:
 * 1. User explicitly selected a shop ID → use that
 * 2. Previously saved shop ID still exists in new token's shops → auto-select
 * 3. Multiple shops and no match → return null (prompt selection)
 * 4. Single shop → auto-select
 */
export function selectPrintifyShop(
  shops: PrintifyShopChoice[],
  explicitShopId: string | undefined,
  previousShopId: string | undefined,
): PrintifyShopChoice | null {
  if (shops.length === 0) return null;

  // Single shop - auto-select
  if (shops.length === 1) return shops[0];

  // User explicitly selected
  if (explicitShopId) {
    const match = shops.find((s) => s.shopId === explicitShopId);
    return match ?? null;
  }

  // Auto-select previously saved shop if still valid
  if (previousShopId) {
    const match = shops.find((s) => s.shopId === previousShopId);
    return match ?? null;
  }

  // Multiple shops and no previous selection - needs user selection
  return null;
}
