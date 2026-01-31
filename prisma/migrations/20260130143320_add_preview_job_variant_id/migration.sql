-- AlterTable
ALTER TABLE "preview_jobs" ADD COLUMN "variant_id" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_shop_product_variants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop_id" TEXT NOT NULL,
    "shopify_product_id" TEXT NOT NULL,
    "shopify_variant_id" TEXT NOT NULL,
    "printify_product_id" TEXT NOT NULL,
    "printify_variant_id" TEXT NOT NULL,
    "variant_title" TEXT NOT NULL,
    "synced_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_shop_product_variants" ("created_at", "id", "printify_product_id", "printify_variant_id", "shop_id", "shopify_product_id", "shopify_variant_id", "synced_at", "updated_at", "variant_title") SELECT "created_at", "id", "printify_product_id", "printify_variant_id", "shop_id", "shopify_product_id", "shopify_variant_id", "synced_at", "updated_at", "variant_title" FROM "shop_product_variants";
DROP TABLE "shop_product_variants";
ALTER TABLE "new_shop_product_variants" RENAME TO "shop_product_variants";
CREATE INDEX "shop_product_variants_shop_id_idx" ON "shop_product_variants"("shop_id");
CREATE INDEX "shop_product_variants_shop_id_shopify_product_id_idx" ON "shop_product_variants"("shop_id", "shopify_product_id");
CREATE UNIQUE INDEX "shop_product_variants_shop_id_shopify_variant_id_key" ON "shop_product_variants"("shop_id", "shopify_variant_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
