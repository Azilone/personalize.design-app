-- CreateTable
CREATE TABLE "usage_ledger_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop_id" TEXT NOT NULL,
    "entry_type" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency_code" TEXT NOT NULL DEFAULT 'USD',
    "idempotency_key" TEXT NOT NULL,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "usage_ledger_entries_shop_id_created_at_idx" ON "usage_ledger_entries"("shop_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "usage_ledger_entries_shop_id_idempotency_key_key" ON "usage_ledger_entries"("shop_id", "idempotency_key");
