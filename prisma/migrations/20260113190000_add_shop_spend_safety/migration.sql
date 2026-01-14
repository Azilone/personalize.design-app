-- CreateTable
CREATE TABLE "shop_spend_safety" (
    "shop_id" TEXT NOT NULL PRIMARY KEY,
    "monthly_cap_cents" INTEGER,
    "paid_usage_consent_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
