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
    "remove_background_enabled" BOOLEAN NOT NULL DEFAULT false,
    "cover_print_area" BOOLEAN NOT NULL DEFAULT true,
    "aspect_ratio" TEXT NOT NULL DEFAULT 'ratio_1_1',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "test_generation_count" INTEGER NOT NULL DEFAULT 0,
    "test_generation_month" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_design_templates" ("aspect_ratio", "created_at", "generation_model_identifier", "id", "photo_required", "price_usd_per_generation", "prompt", "remove_background_enabled", "shop_id", "status", "template_name", "test_generation_count", "test_generation_month", "text_input_enabled", "updated_at") SELECT "aspect_ratio", "created_at", "generation_model_identifier", "id", "photo_required", "price_usd_per_generation", "prompt", "remove_background_enabled", "shop_id", "status", "template_name", "test_generation_count", "test_generation_month", "text_input_enabled", "updated_at" FROM "design_templates";
DROP TABLE "design_templates";
ALTER TABLE "new_design_templates" RENAME TO "design_templates";
CREATE INDEX "design_templates_shop_id_idx" ON "design_templates"("shop_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
