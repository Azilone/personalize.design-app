/*
  Warnings:

  - You are about to alter the column `created_at` on the `shop_generation_limits` table. The data in that column could be lost. The data in that column will be cast from `Unsupported("timestamp(3)")` to `DateTime`.
  - You are about to alter the column `updated_at` on the `shop_generation_limits` table. The data in that column could be lost. The data in that column will be cast from `Unsupported("timestamp(3)")` to `DateTime`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_shop_generation_limits" (
    "shop_id" TEXT NOT NULL PRIMARY KEY,
    "per_product_limit" INTEGER NOT NULL DEFAULT 5,
    "per_session_limit" INTEGER NOT NULL DEFAULT 15,
    "reset_window_minutes" INTEGER NOT NULL DEFAULT 30,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_shop_generation_limits" ("created_at", "per_product_limit", "per_session_limit", "reset_window_minutes", "shop_id", "updated_at") SELECT "created_at", "per_product_limit", "per_session_limit", "reset_window_minutes", "shop_id", "updated_at" FROM "shop_generation_limits";
DROP TABLE "shop_generation_limits";
ALTER TABLE "new_shop_generation_limits" RENAME TO "shop_generation_limits";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
