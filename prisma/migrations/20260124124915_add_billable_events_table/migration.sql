-- CreateTable
CREATE TABLE "billable_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "amount_mills" INTEGER NOT NULL,
    "currency_code" TEXT NOT NULL DEFAULT 'USD',
    "idempotency_key" TEXT NOT NULL,
    "description" TEXT,
    "source_id" TEXT,
    "error_message" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "billable_events_shop_id_created_at_idx" ON "billable_events"("shop_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "billable_events_shop_id_idempotency_key_key" ON "billable_events"("shop_id", "idempotency_key");
