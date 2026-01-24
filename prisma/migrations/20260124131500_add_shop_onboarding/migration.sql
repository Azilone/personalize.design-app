CREATE TABLE "shop_onboarding" (
    "shop_id" TEXT NOT NULL PRIMARY KEY,
    "completed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
