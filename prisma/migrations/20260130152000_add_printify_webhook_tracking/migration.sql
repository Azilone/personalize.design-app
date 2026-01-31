-- Add Printify webhook tracking fields
ALTER TABLE "order_line_processing" ADD COLUMN "printify_order_status" TEXT;
ALTER TABLE "order_line_processing" ADD COLUMN "printify_order_status_updated_at" TIMESTAMP;
ALTER TABLE "order_line_processing" ADD COLUMN "printify_last_event" TEXT;
ALTER TABLE "order_line_processing" ADD COLUMN "printify_last_event_at" TIMESTAMP;
ALTER TABLE "order_line_processing" ADD COLUMN "printify_tracking_number" TEXT;
ALTER TABLE "order_line_processing" ADD COLUMN "printify_tracking_url" TEXT;
ALTER TABLE "order_line_processing" ADD COLUMN "printify_tracking_carrier" TEXT;
ALTER TABLE "order_line_processing" ADD COLUMN "printify_shipped_at" TIMESTAMP;
ALTER TABLE "order_line_processing" ADD COLUMN "printify_delivered_at" TIMESTAMP;
