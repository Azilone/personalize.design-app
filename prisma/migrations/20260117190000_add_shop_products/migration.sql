-- CreateTable
CREATE TABLE "shop_products" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "image_url" TEXT,
    "image_alt" TEXT,
    "printify_product_id" TEXT,
    "printify_shop_id" TEXT,
    "synced_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "shop_products_shop_id_idx" ON "shop_products"("shop_id");

-- CreateIndex
CREATE UNIQUE INDEX "shop_products_shop_id_product_id_key" ON "shop_products"("shop_id", "product_id");
