CREATE TABLE "shop_generation_limits" (
  "shop_id" TEXT NOT NULL,
  "per_product_limit" INTEGER NOT NULL DEFAULT 5,
  "per_session_limit" INTEGER NOT NULL DEFAULT 15,
  "reset_window_minutes" INTEGER NOT NULL DEFAULT 30,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "shop_generation_limits_pkey" PRIMARY KEY ("shop_id")
);
