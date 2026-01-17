import prisma from "../../db.server";
import logger from "../../lib/logger";
import type { ShopifyProduct } from "../shopify/products.server";

export type ShopProductRecord = {
  productId: string;
  title: string;
  handle: string;
  imageUrl: string | null;
  imageAlt: string | null;
  printifyProductId: string | null;
  printifyShopId: string | null;
  syncedAt: Date;
};

type UpsertProductInput = {
  shopId: string;
  products: ShopifyProduct[];
  syncedAt: Date;
};

type ProductSyncResult = {
  count: number;
  syncedAt: Date;
};

export const mapShopifyProductToRecord = (
  product: ShopifyProduct,
  syncedAt: Date,
): ShopProductRecord => {
  return {
    productId: product.id,
    title: product.title,
    handle: product.handle,
    imageUrl: product.imageUrl,
    imageAlt: product.imageAlt,
    printifyProductId: product.printifyProductId,
    printifyShopId: product.printifyShopId,
    syncedAt,
  };
};

export const upsertShopProducts = async (
  input: UpsertProductInput,
): Promise<ProductSyncResult> => {
  const { shopId, products, syncedAt } = input;

  if (products.length === 0) {
    return { count: 0, syncedAt };
  }

  const records = products.map((product) =>
    mapShopifyProductToRecord(product, syncedAt),
  );

  // HIGH-2 FIX: Use $transaction for batched upserts to avoid N+1 round trips
  await prisma.$transaction(
    records.map((record) =>
      prisma.shopProduct.upsert({
        where: {
          shop_id_product_id: {
            shop_id: shopId,
            product_id: record.productId,
          },
        },
        update: {
          title: record.title,
          handle: record.handle,
          image_url: record.imageUrl,
          image_alt: record.imageAlt,
          printify_product_id: record.printifyProductId,
          printify_shop_id: record.printifyShopId,
          synced_at: record.syncedAt,
        },
        create: {
          shop_id: shopId,
          product_id: record.productId,
          title: record.title,
          handle: record.handle,
          image_url: record.imageUrl,
          image_alt: record.imageAlt,
          printify_product_id: record.printifyProductId,
          printify_shop_id: record.printifyShopId,
          synced_at: record.syncedAt,
        },
      }),
    ),
  );

  logger.info(
    { shop_id: shopId, product_count: records.length },
    "Shop products synced",
  );
  // MED-2 FIX: Removed duplicate captureEvent - telemetry emitted in route only

  return { count: records.length, syncedAt };
};

export type ShopProductListItem = {
  productId: string;
  title: string;
  handle: string;
  imageUrl: string | null;
  imageAlt: string | null;
  printifyProductId: string | null;
  printifyShopId: string | null;
  syncedAt: Date;
};

export const listShopProducts = async (
  shopId: string,
): Promise<ShopProductListItem[]> => {
  // HIGH-3 FIX: Use prisma.shopProduct directly (proper Prisma client access)
  const products = await prisma.shopProduct.findMany({
    where: { shop_id: shopId },
    orderBy: { title: "asc" },
  });

  return products.map((product) => ({
    productId: product.product_id,
    title: product.title,
    handle: product.handle,
    imageUrl: product.image_url,
    imageAlt: product.image_alt,
    printifyProductId: product.printify_product_id,
    printifyShopId: product.printify_shop_id,
    syncedAt: product.synced_at,
  }));
};

export const getLatestProductSync = async (
  shopId: string,
): Promise<Date | null> => {
  const latest = await prisma.shopProduct.findFirst({
    where: { shop_id: shopId },
    orderBy: { synced_at: "desc" },
    select: { synced_at: true },
  });

  return latest?.synced_at ?? null;
};
