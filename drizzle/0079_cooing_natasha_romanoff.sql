CREATE TYPE "public"."reimbursement_status" AS ENUM('draft', 'submitted', 'changes_requested', 'approved', 'rejected', 'paid');--> statement-breakpoint
CREATE TABLE "reimbursement_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reimbursement_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"role" text NOT NULL,
	"approved_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reimbursement_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reimbursement_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state" text,
	"district_id" uuid,
	"approver_roles" text[] NOT NULL,
	"requires_minutes_approval" boolean DEFAULT false NOT NULL,
	"sales_tax_refund_tracking" boolean DEFAULT false NOT NULL,
	"tax_guidance_note" text,
	"submission_window_days" integer DEFAULT 60 NOT NULL,
	"spending_cards_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "reimbursement_policies_scope" CHECK (("reimbursement_policies"."state" IS NOT NULL) <> ("reimbursement_policies"."district_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "reimbursement_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"blob_url" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reimbursement_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"school_year" text NOT NULL,
	"submitted_by" uuid NOT NULL,
	"payee_name" text NOT NULL,
	"event_plan_id" uuid,
	"event_label" text,
	"budget_category_id" uuid,
	"purpose" text NOT NULL,
	"purchase_date" date NOT NULL,
	"vendor" text NOT NULL,
	"subtotal_amount" numeric(10, 2) NOT NULL,
	"sales_tax_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"attested_personal_funds" boolean DEFAULT false NOT NULL,
	"missing_receipt" boolean DEFAULT false NOT NULL,
	"board_decision_note" text,
	"status" "reimbursement_status" DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp with time zone,
	"required_approver_roles" text[],
	"authorization_note" text,
	"authorization_minutes_date" date,
	"check_number" text,
	"paid_at" timestamp with time zone,
	"paid_by" uuid,
	"principal_acknowledged" boolean DEFAULT false NOT NULL,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "reimbursement_activity" ADD CONSTRAINT "reimbursement_activity_request_id_reimbursement_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."reimbursement_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement_activity" ADD CONSTRAINT "reimbursement_activity_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement_approvals" ADD CONSTRAINT "reimbursement_approvals_request_id_reimbursement_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."reimbursement_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement_approvals" ADD CONSTRAINT "reimbursement_approvals_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement_items" ADD CONSTRAINT "reimbursement_items_request_id_reimbursement_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."reimbursement_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement_policies" ADD CONSTRAINT "reimbursement_policies_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement_receipts" ADD CONSTRAINT "reimbursement_receipts_request_id_reimbursement_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."reimbursement_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement_receipts" ADD CONSTRAINT "reimbursement_receipts_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement_requests" ADD CONSTRAINT "reimbursement_requests_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement_requests" ADD CONSTRAINT "reimbursement_requests_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement_requests" ADD CONSTRAINT "reimbursement_requests_event_plan_id_event_plans_id_fk" FOREIGN KEY ("event_plan_id") REFERENCES "public"."event_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement_requests" ADD CONSTRAINT "reimbursement_requests_budget_category_id_budget_categories_id_fk" FOREIGN KEY ("budget_category_id") REFERENCES "public"."budget_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement_requests" ADD CONSTRAINT "reimbursement_requests_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reimbursement_approvals_unique" ON "reimbursement_approvals" USING btree ("request_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "reimbursement_policies_state_unique" ON "reimbursement_policies" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "reimbursement_policies_district_unique" ON "reimbursement_policies" USING btree ("district_id");--> statement-breakpoint
CREATE INDEX "reimbursement_requests_school_status_idx" ON "reimbursement_requests" USING btree ("school_id","status");--> statement-breakpoint
CREATE INDEX "reimbursement_requests_submitter_idx" ON "reimbursement_requests" USING btree ("submitted_by");--> statement-breakpoint
CREATE INDEX "reimbursement_requests_event_plan_idx" ON "reimbursement_requests" USING btree ("event_plan_id");