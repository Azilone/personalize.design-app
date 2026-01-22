-- CreateTable
CREATE TABLE "merchant_previews" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "job_id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "cover_print_area" BOOLEAN NOT NULL DEFAULT false,
    "test_image_url" TEXT NOT NULL,
    "test_text" TEXT,
    "variable_values" JSONB,
    "design_url" TEXT,
    "mockup_urls" JSONB,
    "error_message" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "merchant_previews_shop_id_idx" ON "merchant_previews"("shop_id");

-- CreateIndex
CREATE INDEX "merchant_previews_job_id_idx" ON "merchant_previews"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_previews_shop_id_job_id_key" ON "merchant_previews"("shop_id", "job_id");
