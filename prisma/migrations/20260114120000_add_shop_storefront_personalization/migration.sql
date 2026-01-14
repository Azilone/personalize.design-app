-- CreateTable
CREATE TABLE "shop_storefront_personalization" (
    "shop_id" TEXT NOT NULL PRIMARY KEY,
    "storefront_personalization_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
