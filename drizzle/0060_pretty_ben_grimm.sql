ALTER TABLE "school_memberships" ADD COLUMN "is_school_staff" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "school_memberships" ADD COLUMN "staff_request_code_id" uuid;--> statement-breakpoint
-- Existing school admins hold their access through `role`, which predates this
-- column. Flag them so `isSchoolAdminRole` reads one thing, not two.
UPDATE "school_memberships" SET "is_school_staff" = true WHERE "role" = 'admin';
