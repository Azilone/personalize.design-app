-- CreateTable
CREATE TABLE "shop_product_variants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop_id" TEXT NOT NULL,
    "shopify_product_id" TEXT NOT NULL,
    "shopify_variant_id" TEXT NOT NULL,
    "printify_product_id" TEXT NOT NULL,
    "printify_variant_id" TEXT NOT NULL,
    "variant_title" TEXT NOT NULL,
    "synced_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "shop_product_variants_shop_id_idx" ON "shop_product_variants"("shop_id");

-- CreateIndex
CREATE INDEX "shop_product_variants_shop_id_shopify_product_id_idx" ON "shop_product_variants"("shop_id", "shopify_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "shop_product_variants_shop_id_shopify_variant_id_key" ON "shop_product_variants"("shop_id", "shopify_variant_id");
