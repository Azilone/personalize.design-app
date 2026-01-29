-- CreateTable
CREATE TABLE "shop_button_styles" (
    "shop_id" TEXT NOT NULL PRIMARY KEY,
    "use_custom" BOOLEAN NOT NULL DEFAULT false,
    "background_color" TEXT,
    "text_color" TEXT,
    "border_radius" TEXT,
    "font_size" TEXT,
    "font_weight" TEXT,
    "letter_spacing" TEXT,
    "padding_x" TEXT,
    "padding_y" TEXT,
    "border_width" TEXT,
    "border_color" TEXT,
    "box_shadow" TEXT,
    "hover_background_color" TEXT,
    "hover_text_color" TEXT,
    "hover_box_shadow" TEXT,
    "disabled_background_color" TEXT,
    "disabled_text_color" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
