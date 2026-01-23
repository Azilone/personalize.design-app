ALTER TABLE "usage_ledger_entries" ADD COLUMN "amount_mills" INTEGER NOT NULL DEFAULT 0;

UPDATE "usage_ledger_entries"
SET "amount_mills" = "amount_cents" * 10
WHERE "amount_mills" = 0;
