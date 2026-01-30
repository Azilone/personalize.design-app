-- AlterTable
ALTER TABLE "order_line_processing" ADD COLUMN "final_asset_bucket" TEXT;
ALTER TABLE "order_line_processing" ADD COLUMN "final_asset_checksum" TEXT;
ALTER TABLE "order_line_processing" ADD COLUMN "final_asset_error_code" TEXT;
ALTER TABLE "order_line_processing" ADD COLUMN "final_asset_error_message" TEXT;
ALTER TABLE "order_line_processing" ADD COLUMN "final_asset_persisted_at" DATETIME;
ALTER TABLE "order_line_processing" ADD COLUMN "final_asset_storage_key" TEXT;
