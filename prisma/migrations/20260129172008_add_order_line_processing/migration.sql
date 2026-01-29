/*
  Warnings:

  - You are about to alter the column `created_at` on the `shop_generation_limits` table. The data in that column could be lost. The data in that column will be cast from `Unsupported("timestamp(3)")` to `DateTime`.
  - You are about to alter the column `updated_at` on the `shop_generation_limits` table. The data in that column could be lost. The data in that column will be cast from `Unsupported("timestamp(3)")` to `DateTime`.

*/
-- CreateTable
CREATE TABLE "order_line_processing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_line_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "personalization_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "generation_attempts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "first_attempt_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_attempt_at" DATETIME NOT NULL,
    "reset_window_minutes" INTEGER NOT NULL DEFAULT 30,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

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

-- CreateIndex
CREATE UNIQUE INDEX "order_line_processing_idempotency_key_key" ON "order_line_processing"("idempotency_key");

-- CreateIndex
CREATE INDEX "order_line_processing_shop_id_order_line_id_idx" ON "order_line_processing"("shop_id", "order_line_id");

-- CreateIndex
CREATE INDEX "order_line_processing_status_idx" ON "order_line_processing"("status");

-- CreateIndex
CREATE INDEX "generation_attempts_shop_id_session_id_idx" ON "generation_attempts"("shop_id", "session_id");

-- CreateIndex
CREATE INDEX "generation_attempts_shop_id_product_id_idx" ON "generation_attempts"("shop_id", "product_id");

-- CreateIndex
CREATE INDEX "generation_attempts_last_attempt_at_idx" ON "generation_attempts"("last_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "generation_attempts_shop_id_session_id_product_id_key" ON "generation_attempts"("shop_id", "session_id", "product_id");
