CREATE TYPE "public"."membership_source" AS ENUM('pta_join_code', 'volunteer_signup', 'committee_signup', 'event_plan_invite', 'school_admin_code', 'scc_code', 'admin_add', 'super_admin');--> statement-breakpoint
ALTER TYPE "public"."school_membership_status" ADD VALUE 'pending';--> statement-breakpoint
CREATE TABLE "school_admin_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"is_standard" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "school_join_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"grants_role" "school_role" DEFAULT 'member' NOT NULL,
	"grants_source" "membership_source" NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"max_uses" integer,
	"uses" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "school_join_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "school_memberships" ADD COLUMN "admin_position" text;--> statement-breakpoint
ALTER TABLE "school_memberships" ADD COLUMN "source" "membership_source";--> statement-breakpoint
ALTER TABLE "school_memberships" ADD COLUMN "join_code_id" uuid;--> statement-breakpoint
ALTER TABLE "school_admin_positions" ADD CONSTRAINT "school_admin_positions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_join_codes" ADD CONSTRAINT "school_join_codes_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_join_codes" ADD CONSTRAINT "school_join_codes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "school_admin_positions_school_slug_unique" ON "school_admin_positions" USING btree ("school_id","slug");--> statement-breakpoint
CREATE INDEX "school_admin_positions_school_idx" ON "school_admin_positions" USING btree ("school_id","active");--> statement-breakpoint
CREATE INDEX "school_join_codes_school_idx" ON "school_join_codes" USING btree ("school_id","active");--> statement-breakpoint
ALTER TABLE "school_memberships" ADD CONSTRAINT "school_memberships_join_code_id_school_join_codes_id_fk" FOREIGN KEY ("join_code_id") REFERENCES "public"."school_join_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "school_join_codes" ("school_id", "code", "label", "grants_role", "grants_source", "requires_approval", "active")
SELECT "id", "join_code", 'PTA join code', 'member', 'pta_join_code', false, true FROM "schools";--> statement-breakpoint
UPDATE "school_memberships" SET "source" = 'super_admin' WHERE "role" = 'admin';--> statement-breakpoint
UPDATE "school_memberships" sm SET "source" = 'volunteer_signup' WHERE sm."source" IS NULL AND EXISTS (
	SELECT 1 FROM "volunteer_signups" vs WHERE vs."user_id" = sm."user_id" AND vs."school_id" = sm."school_id"
);--> statement-breakpoint
UPDATE "school_memberships" sm SET "source" = 'committee_signup' WHERE sm."source" IS NULL AND EXISTS (
	SELECT 1 FROM "committee_signups" cs WHERE cs."user_id" = sm."user_id" AND cs."school_id" = sm."school_id"
);--> statement-breakpoint
UPDATE "school_memberships" SET "source" = 'pta_join_code' WHERE "source" IS NULL;--> statement-breakpoint
UPDATE "school_memberships" sm SET "join_code_id" = jc."id" FROM "school_join_codes" jc
WHERE jc."school_id" = sm."school_id" AND jc."grants_source" = 'pta_join_code' AND sm."source" = 'pta_join_code';--> statement-breakpoint
ALTER TABLE "school_memberships" ALTER COLUMN "source" SET NOT NULL;
