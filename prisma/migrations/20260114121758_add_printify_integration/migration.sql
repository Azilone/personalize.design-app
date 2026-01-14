-- CreateTable
CREATE TABLE "shop_printify_integrations" (
    "shop_id" TEXT NOT NULL PRIMARY KEY,
    "token_ciphertext" TEXT NOT NULL,
    "token_iv" TEXT NOT NULL,
    "token_auth_tag" TEXT NOT NULL,
    "printify_shop_id" TEXT NOT NULL,
    "printify_shop_title" TEXT NOT NULL,
    "printify_sales_channel" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
