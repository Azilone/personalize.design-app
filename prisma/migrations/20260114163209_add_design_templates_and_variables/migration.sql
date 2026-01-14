-- CreateTable
CREATE TABLE "design_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop_id" TEXT NOT NULL,
    "template_name" TEXT NOT NULL,
    "photo_required" BOOLEAN NOT NULL DEFAULT true,
    "text_input_enabled" BOOLEAN NOT NULL DEFAULT false,
    "prompt" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "design_template_variables" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "template_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "design_template_variables_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "design_templates" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "design_templates_shop_id_idx" ON "design_templates"("shop_id");

-- CreateIndex
CREATE UNIQUE INDEX "design_template_variables_template_id_name_key" ON "design_template_variables"("template_id", "name");
