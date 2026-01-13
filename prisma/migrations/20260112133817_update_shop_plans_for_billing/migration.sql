-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_shop_plans" (
    "shop_id" TEXT NOT NULL PRIMARY KEY,
    "plan_status" TEXT NOT NULL DEFAULT 'none',
    "shopify_subscription_id" TEXT,
    "shopify_subscription_status" TEXT,
    "free_usage_gift_cents" INTEGER NOT NULL DEFAULT 0,
    "free_usage_gift_remaining_cents" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_shop_plans" ("created_at", "plan_status", "shop_id", "updated_at") SELECT "created_at", "plan_status", "shop_id", "updated_at" FROM "shop_plans";
DROP TABLE "shop_plans";
ALTER TABLE "new_shop_plans" RENAME TO "shop_plans";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
