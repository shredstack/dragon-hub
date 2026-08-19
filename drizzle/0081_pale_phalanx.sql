CREATE TYPE "public"."spending_card_request_status" AS ENUM('requested', 'approved', 'issued', 'reconciled', 'denied', 'cancelled');--> statement-breakpoint
CREATE TABLE "spending_card_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"school_year" text NOT NULL,
	"requested_by" uuid NOT NULL,
	"event_plan_id" uuid,
	"event_label" text,
	"purpose" text NOT NULL,
	"requested_amount" numeric(10, 2) NOT NULL,
	"budget_category_id" uuid,
	"status" "spending_card_request_status" DEFAULT 'requested' NOT NULL,
	"card_label" text,
	"issued_amount" numeric(10, 2),
	"issued_at" timestamp with time zone,
	"spent_amount" numeric(10, 2),
	"reconciled_at" timestamp with time zone,
	"reconciliation_note" text,
	"denied_reason" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "reimbursement_receipts" ALTER COLUMN "request_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reimbursement_receipts" ADD COLUMN "spending_card_request_id" uuid;--> statement-breakpoint
ALTER TABLE "spending_card_requests" ADD CONSTRAINT "spending_card_requests_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spending_card_requests" ADD CONSTRAINT "spending_card_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spending_card_requests" ADD CONSTRAINT "spending_card_requests_event_plan_id_event_plans_id_fk" FOREIGN KEY ("event_plan_id") REFERENCES "public"."event_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spending_card_requests" ADD CONSTRAINT "spending_card_requests_budget_category_id_budget_categories_id_fk" FOREIGN KEY ("budget_category_id") REFERENCES "public"."budget_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement_receipts" ADD CONSTRAINT "reimbursement_receipts_spending_card_request_id_spending_card_requests_id_fk" FOREIGN KEY ("spending_card_request_id") REFERENCES "public"."spending_card_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reimbursement_receipts_card_idx" ON "reimbursement_receipts" USING btree ("spending_card_request_id");--> statement-breakpoint
ALTER TABLE "reimbursement_receipts" ADD CONSTRAINT "reimbursement_receipts_owner" CHECK (("reimbursement_receipts"."request_id" IS NOT NULL) <> ("reimbursement_receipts"."spending_card_request_id" IS NOT NULL));