/*
  Warnings:

  - Made the column `id` on table `generation_attempts` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_generation_attempts" (
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
INSERT INTO "new_generation_attempts" ("attempt_count", "created_at", "first_attempt_at", "id", "last_attempt_at", "product_id", "reset_window_minutes", "session_id", "shop_id", "updated_at") SELECT "attempt_count", "created_at", "first_attempt_at", "id", "last_attempt_at", "product_id", "reset_window_minutes", "session_id", "shop_id", "updated_at" FROM "generation_attempts";
DROP TABLE "generation_attempts";
ALTER TABLE "new_generation_attempts" RENAME TO "generation_attempts";
CREATE INDEX "generation_attempts_shop_id_session_id_idx" ON "generation_attempts"("shop_id", "session_id");
CREATE INDEX "generation_attempts_shop_id_product_id_idx" ON "generation_attempts"("shop_id", "product_id");
CREATE INDEX "generation_attempts_last_attempt_at_idx" ON "generation_attempts"("last_attempt_at");
CREATE UNIQUE INDEX "generation_attempts_shop_id_session_id_product_id_key" ON "generation_attempts"("shop_id", "session_id", "product_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
