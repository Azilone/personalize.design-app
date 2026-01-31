import prisma from "../../db.server";
import logger from "../../lib/logger";
import { getPrintifyProductDetails } from "../printify/product-details.server";
import { getOfflineShopifyAdmin } from "../shopify/admin.server";
import type { ShopifyAdminGraphql } from "../shopify/admin.server";

/**
 * Resolves Printify variant ID from Shopify variant ID
 * First checks the database cache, then fetches from APIs if needed
 */
export async function resolvePrintifyVariantId(
  shopId: string,
  shopifyProductId: string,
  shopifyVariantId: string,
): Promise<{ printifyVariantId: string; variantTitle: string } | null> {
  // First, check if we have a cached mapping
  const cachedMapping = await prisma.shopProductVariant.findUnique({
    where: {
      shop_id_shopify_variant_id: {
        shop_id: shopId,
        shopify_variant_id: shopifyVariantId,
      },
    },
  });

  if (cachedMapping) {
    logger.debug(
      {
        shop_id: shopId,
        shopify_variant_id: shopifyVariantId,
        printify_variant_id: cachedMapping.printify_variant_id,
      },
      "Found cached variant mapping",
    );
    return {
      printifyVariantId: cachedMapping.printify_variant_id,
      variantTitle: cachedMapping.variant_title,
    };
  }

  // No cached mapping - need to fetch and match
  logger.info(
    {
      shop_id: shopId,
      shopify_product_id: shopifyProductId,
      shopify_variant_id: shopifyVariantId,
    },
    "No cached variant mapping, fetching from APIs",
  );

  try {
    // Get the Printify product ID for this Shopify product
    const shopProduct = await prisma.shopProduct.findUnique({
      where: {
        shop_id_product_id: {
          shop_id: shopId,
          product_id: shopifyProductId,
        },
      },
      select: {
        printify_product_id: true,
      },
    });

    if (!shopProduct?.printify_product_id) {
      logger.warn(
        {
          shop_id: shopId,
          shopify_product_id: shopifyProductId,
        },
        "No Printify product found for Shopify product",
      );
      return null;
    }

    const printifyProductId = shopProduct.printify_product_id;

    // Fetch Shopify variant details
    const admin = await getOfflineShopifyAdmin(shopId);
    const shopifyVariant = await fetchShopifyVariant(admin, shopifyVariantId);

    if (!shopifyVariant) {
      logger.warn(
        {
          shop_id: shopId,
          shopify_variant_id: shopifyVariantId,
        },
        "Could not fetch Shopify variant details",
      );
      return null;
    }

    // Fetch Printify product details with variants
    const printifyProduct = await getPrintifyProductDetails(
      shopId,
      printifyProductId,
    );

    // Find matching variant by title
    const matchingVariant = printifyProduct.variants.find(
      (v) => v.title === shopifyVariant.title && v.isEnabled,
    );

    if (!matchingVariant) {
      logger.warn(
        {
          shop_id: shopId,
          shopify_variant_id: shopifyVariantId,
          shopify_variant_title: shopifyVariant.title,
          printify_product_id: printifyProductId,
          available_variants: printifyProduct.variants
            .filter((v) => v.isEnabled)
            .map((v) => v.title),
        },
        "No matching Printify variant found",
      );
      return null;
    }

    // Cache the mapping for future use
    await prisma.shopProductVariant.create({
      data: {
        shop_id: shopId,
        shopify_product_id: shopifyProductId,
        shopify_variant_id: shopifyVariantId,
        printify_product_id: printifyProductId,
        printify_variant_id: String(matchingVariant.id),
        variant_title: shopifyVariant.title,
      },
    });

    logger.info(
      {
        shop_id: shopId,
        shopify_variant_id: shopifyVariantId,
        printify_variant_id: matchingVariant.id,
        variant_title: shopifyVariant.title,
      },
      "Created variant mapping",
    );

    return {
      printifyVariantId: String(matchingVariant.id),
      variantTitle: shopifyVariant.title,
    };
  } catch (error) {
    logger.error(
      {
        shop_id: shopId,
        shopify_product_id: shopifyProductId,
        shopify_variant_id: shopifyVariantId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Error resolving Printify variant ID",
    );
    return null;
  }
}

/**
 * Fetches variant details from Shopify
 */
async function fetchShopifyVariant(
  admin: ShopifyAdminGraphql,
  variantId: string,
): Promise<{ id: string; title: string } | null> {
  try {
    const response = await admin.graphql(
      `#graphql
        query getVariant($id: ID!) {
          productVariant(id: $id) {
            id
            title
          }
        }
      `,
      {
        variables: {
          id: variantId.startsWith("gid://")
            ? variantId
            : `gid://shopify/ProductVariant/${variantId}`,
        },
      },
    );

    if (!response.ok) {
      return null;
    }

    const json = (await response.json()) as {
      data?: {
        productVariant?: {
          id: string;
          title: string;
        } | null;
      };
      errors?: Array<{ message?: string }>;
    };

    if (json.errors?.length || !json.data?.productVariant) {
      return null;
    }

    return {
      id: json.data.productVariant.id,
      title: json.data.productVariant.title,
    };
  } catch (error) {
    logger.error(
      { variant_id: variantId, error: String(error) },
      "Error fetching Shopify variant",
    );
    return null;
  }
}
