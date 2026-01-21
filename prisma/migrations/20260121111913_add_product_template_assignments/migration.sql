-- CreateTable
CREATE TABLE "product_template_assignments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "personalization_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "product_template_assignments_shop_id_idx" ON "product_template_assignments"("shop_id");

-- CreateIndex
CREATE INDEX "product_template_assignments_template_id_idx" ON "product_template_assignments"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_template_assignments_shop_id_product_id_key" ON "product_template_assignments"("shop_id", "product_id");
