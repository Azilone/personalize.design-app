-- AlterTable
ALTER TABLE "order_line_processing" ADD COLUMN "printify_order_id" TEXT;
ALTER TABLE "order_line_processing" ADD COLUMN "printify_order_number" INTEGER;
ALTER TABLE "order_line_processing" ADD COLUMN "printify_submit_status" TEXT;
ALTER TABLE "order_line_processing" ADD COLUMN "printify_submit_idempotency_key" TEXT;
ALTER TABLE "order_line_processing" ADD COLUMN "printify_submitted_at" DATETIME;
ALTER TABLE "order_line_processing" ADD COLUMN "printify_error_code" TEXT;
ALTER TABLE "order_line_processing" ADD COLUMN "printify_error_message" TEXT;

-- CreateIndex
CREATE INDEX "order_line_processing_printify_submit_status_idx" ON "order_line_processing"("printify_submit_status");

-- CreateIndex
CREATE UNIQUE INDEX "order_line_processing_printify_submit_idempotency_key_key" ON "order_line_processing"("printify_submit_idempotency_key");
