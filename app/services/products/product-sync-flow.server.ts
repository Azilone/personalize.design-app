import logger from "../../lib/logger";
import { listShopifyProducts } from "../shopify/products.server";
import { upsertShopProducts } from "./product-sync.server";
import { getPrintifyIntegrationWithToken } from "../printify/integration.server";
import { listPrintifyProducts } from "../printify/client.server";
import { decryptPrintifyToken } from "../printify/token-encryption.server";
import type { ShopifyProduct } from "../shopify/products.server";
import type { ShopifyAdminGraphql } from "../shopify/admin.server";

/**
 * Builds a lookup map from Shopify GID -> Printify product info.
 * This matches products published from Printify to Shopify.
 *
 * Printify's external.id can be:
 * - A full GID: "gid://shopify/Product/12345"
 * - Just the numeric ID: "12345"
 *
 * We normalize all IDs to full GID format for consistent matching.
 */
type PrintifyProductMapping = Map<
  string,
  { printifyProductId: string; printifyShopId: string }
>;

/**
 * Normalizes a Shopify product ID to full GID format.
 * Handles both "12345" and "gid://shopify/Product/12345" formats.
 */
const normalizeToGid = (externalId: string): string => {
  if (externalId.startsWith("gid://")) {
    return externalId;
  }
  // Numeric ID - convert to GID format
  return `gid://shopify/Product/${externalId}`;
};

/**
 * Extracts the numeric ID from a Shopify GID.
 * "gid://shopify/Product/12345" -> "12345"
 */
const extractNumericId = (gid: string): string => {
  const match = gid.match(/\/(\d+)$/);
  return match ? match[1] : gid;
};

const buildPrintifyProductMap = async (
  shopId: string,
): Promise<PrintifyProductMapping> => {
  const map: PrintifyProductMapping = new Map();

  // Try to get Printify integration for this shop
  const integration = await getPrintifyIntegrationWithToken(shopId);
  if (!integration) {
    logger.info({ shop_id: shopId }, "No Printify integration, skipping match");
    return map;
  }

  try {
    const token = decryptPrintifyToken(integration.encryptedToken);
    const printifyProducts = await listPrintifyProducts({
      token,
      printifyShopId: integration.printifyShopId,
    });

    for (const product of printifyProducts) {
      if (product.externalShopifyGid) {
        // Store with normalized GID as key
        const normalizedGid = normalizeToGid(product.externalShopifyGid);
        map.set(normalizedGid, {
          printifyProductId: product.printifyProductId,
          printifyShopId: integration.printifyShopId,
        });
      }
    }

    logger.info(
      {
        shop_id: shopId,
        printify_product_count: printifyProducts.length,
        matched_count: map.size,
      },
      "Built Printify product mapping",
    );
  } catch (error) {
    // Log but don't fail sync - Printify matching is best-effort
    logger.warn(
      { shop_id: shopId, err: error },
      "Failed to fetch Printify products for matching",
    );
  }

  return map;
};

/**
 * Enriches Shopify products with Printify IDs by matching external.id.
 * Tries both GID and numeric ID matching for robustness.
 */
const enrichWithPrintifyData = (
  products: ShopifyProduct[],
  printifyMap: PrintifyProductMapping,
): ShopifyProduct[] => {
  return products.map((product) => {
    // Try exact match first (GID to GID)
    let printifyInfo = printifyMap.get(product.id);

    // If no match, try matching by numeric ID (Printify may store just "12345")
    if (!printifyInfo) {
      const numericId = extractNumericId(product.id);
      const numericGid = `gid://shopify/Product/${numericId}`;
      printifyInfo = printifyMap.get(numericGid);
    }

    if (printifyInfo) {
      return {
        ...product,
        printifyProductId: printifyInfo.printifyProductId,
        printifyShopId: printifyInfo.printifyShopId,
      };
    }
    return product;
  });
};

export const syncShopifyProducts = async (input: {
  admin: ShopifyAdminGraphql;
  shopId: string;
  syncedAt?: Date;
}): Promise<{ count: number; syncedAt: Date }> => {
  let cursor: string | null = null;
  let hasNextPage = true;
  const syncedAt = input.syncedAt ?? new Date();
  const allProducts: ShopifyProduct[] = [];

  // Fetch all Shopify products
  while (hasNextPage) {
    const page = await listShopifyProducts({
      admin: input.admin,
      after: cursor,
    });

    allProducts.push(...page.products);
    hasNextPage = page.hasNextPage;
    cursor = page.nextCursor;
  }

  // Build Printify mapping and enrich Shopify products
  const printifyMap = await buildPrintifyProductMap(input.shopId);
  const enrichedProducts = enrichWithPrintifyData(allProducts, printifyMap);

  return upsertShopProducts({
    shopId: input.shopId,
    products: enrichedProducts,
    syncedAt,
  });
};
