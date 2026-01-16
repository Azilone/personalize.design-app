-- CreateTable
CREATE TABLE "template_test_generations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "template_id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "num_images_requested" INTEGER NOT NULL,
    "num_images_generated" INTEGER NOT NULL,
    "total_cost_usd" DECIMAL NOT NULL,
    "total_time_seconds" DECIMAL NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error_message" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "template_test_generations_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "design_templates" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_design_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop_id" TEXT NOT NULL,
    "template_name" TEXT NOT NULL,
    "photo_required" BOOLEAN NOT NULL DEFAULT true,
    "text_input_enabled" BOOLEAN NOT NULL DEFAULT false,
    "prompt" TEXT,
    "generation_model_identifier" TEXT,
    "price_usd_per_generation" DECIMAL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "test_generation_count" INTEGER NOT NULL DEFAULT 0,
    "test_generation_month" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_design_templates" ("created_at", "generation_model_identifier", "id", "photo_required", "price_usd_per_generation", "prompt", "shop_id", "status", "template_name", "text_input_enabled", "updated_at") SELECT "created_at", "generation_model_identifier", "id", "photo_required", "price_usd_per_generation", "prompt", "shop_id", "status", "template_name", "text_input_enabled", "updated_at" FROM "design_templates";
DROP TABLE "design_templates";
ALTER TABLE "new_design_templates" RENAME TO "design_templates";
CREATE INDEX "design_templates_shop_id_idx" ON "design_templates"("shop_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "template_test_generations_template_id_idx" ON "template_test_generations"("template_id");

-- CreateIndex
CREATE INDEX "template_test_generations_shop_id_idx" ON "template_test_generations"("shop_id");
