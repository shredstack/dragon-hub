CREATE TABLE "reimbursement_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"vendor" text DEFAULT '' NOT NULL,
	"purchase_date" date NOT NULL,
	"subtotal_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"sales_tax_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "reimbursement_items" ADD COLUMN "expense_id" uuid;--> statement-breakpoint
ALTER TABLE "reimbursement_receipts" ADD COLUMN "expense_id" uuid;--> statement-breakpoint
ALTER TABLE "reimbursement_expenses" ADD CONSTRAINT "reimbursement_expenses_request_id_reimbursement_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."reimbursement_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reimbursement_expenses_request_idx" ON "reimbursement_expenses" USING btree ("request_id");--> statement-breakpoint
ALTER TABLE "reimbursement_items" ADD CONSTRAINT "reimbursement_items_expense_id_reimbursement_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."reimbursement_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement_receipts" ADD CONSTRAINT "reimbursement_receipts_expense_id_reimbursement_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."reimbursement_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reimbursement_receipts_expense_idx" ON "reimbursement_receipts" USING btree ("expense_id");--> statement-breakpoint
--
-- Backfill: every existing request becomes a one-receipt request.
--
-- The request's vendor, date and amounts are now a rollup of its receipts, so
-- each existing request needs the single receipt those values were describing,
-- with its items and images pointed at it. Written so the numbers move nowhere:
-- the copy is exact, and the rollup of one receipt is the receipt.
--
INSERT INTO "reimbursement_expenses" (
  "request_id", "vendor", "purchase_date",
  "subtotal_amount", "sales_tax_amount", "total_amount",
  "sort_order", "created_at"
)
SELECT
  r."id", r."vendor", r."purchase_date",
  r."subtotal_amount", r."sales_tax_amount", r."total_amount",
  0, r."created_at"
FROM "reimbursement_requests" r;--> statement-breakpoint
UPDATE "reimbursement_items" i
SET "expense_id" = e."id"
FROM "reimbursement_expenses" e
WHERE e."request_id" = i."request_id" AND i."expense_id" IS NULL;--> statement-breakpoint
-- A spending card's receipts stay unattached: a card has no per-receipt claim
-- to belong to, which is why `request_id` is null on those rows.
UPDATE "reimbursement_receipts" rc
SET "expense_id" = e."id"
FROM "reimbursement_expenses" e
WHERE e."request_id" = rc."request_id" AND rc."expense_id" IS NULL;