-- CreateTable
CREATE TABLE "buyer_preview_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "buyer_session_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "preview_url" TEXT,
    "error_message" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "buyer_preview_jobs_shop_id_idx" ON "buyer_preview_jobs"("shop_id");

-- CreateIndex
CREATE INDEX "buyer_preview_jobs_product_id_idx" ON "buyer_preview_jobs"("product_id");

-- CreateIndex
CREATE INDEX "buyer_preview_jobs_template_id_idx" ON "buyer_preview_jobs"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "buyer_preview_jobs_shop_id_id_key" ON "buyer_preview_jobs"("shop_id", "id");
