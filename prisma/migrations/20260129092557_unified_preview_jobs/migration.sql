/*
  Warnings:

  - You are about to drop the `buyer_preview_jobs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `merchant_previews` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "buyer_preview_jobs";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "merchant_previews";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "preview_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "job_id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "input_image_url" TEXT,
    "input_text" TEXT,
    "variable_values" JSONB,
    "cover_print_area" BOOLEAN NOT NULL DEFAULT false,
    "design_url" TEXT,
    "design_storage_key" TEXT,
    "mockup_urls" JSONB,
    "temp_printify_product_id" TEXT,
    "session_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "error_message" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "preview_jobs_shop_id_idx" ON "preview_jobs"("shop_id");

-- CreateIndex
CREATE INDEX "preview_jobs_job_id_idx" ON "preview_jobs"("job_id");

-- CreateIndex
CREATE INDEX "preview_jobs_type_idx" ON "preview_jobs"("type");

-- CreateIndex
CREATE UNIQUE INDEX "preview_jobs_shop_id_job_id_key" ON "preview_jobs"("shop_id", "job_id");
