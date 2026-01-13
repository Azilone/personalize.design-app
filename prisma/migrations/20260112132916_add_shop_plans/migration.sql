-- CreateTable
CREATE TABLE "shop_plans" (
    "shop_id" TEXT NOT NULL PRIMARY KEY,
    "plan_status" TEXT NOT NULL DEFAULT 'none',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
