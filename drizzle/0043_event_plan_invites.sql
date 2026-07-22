-- Invitations to a single event plan, addressed to an email rather than a user.
--
-- Event plans are now closed: the PTA board sees the school's whole slate, and
-- everyone else gets in only by being added to a specific plan. That works for
-- people who already have accounts, but the volunteers a lead most wants — the
-- parent who ran the silent auction last year, a committee chair who has never
-- signed in — often aren't in the directory yet. This table is the bridge: an
-- invite is created against their email, the emailed link carries the token,
-- and redeeming it grants both a school membership and the event membership so
-- the invitee never lands on the join-code wall.
--
-- One live invite per address per plan. Re-inviting the same person updates the
-- existing row and reissues its link rather than leaving two competing tokens
-- in their inbox, either of which would work.
--
-- Written by hand because drizzle-kit generate can't run non-interactively on
-- this branch's pending diffs (snapshots stopped at 0007) — same as 0040.

DO $$ BEGIN
  CREATE TYPE "event_plan_invite_status" AS ENUM ('pending', 'accepted', 'revoked');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_plan_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_plan_id" uuid NOT NULL,
  "email" text NOT NULL,
  "name" text,
  "role" "event_plan_member_role" DEFAULT 'member' NOT NULL,
  "token" text NOT NULL,
  "status" "event_plan_invite_status" DEFAULT 'pending' NOT NULL,
  "invited_by" uuid,
  "accepted_at" timestamp with time zone,
  "accepted_by" uuid,
  "created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_plan_invites" ADD CONSTRAINT "event_plan_invites_event_plan_id_event_plans_id_fk"
    FOREIGN KEY ("event_plan_id") REFERENCES "event_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_plan_invites" ADD CONSTRAINT "event_plan_invites_invited_by_users_id_fk"
    FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_plan_invites" ADD CONSTRAINT "event_plan_invites_accepted_by_users_id_fk"
    FOREIGN KEY ("accepted_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "event_plan_invites_token_unique" ON "event_plan_invites" ("token");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "event_plan_invites_unique" ON "event_plan_invites" ("event_plan_id","email");
--> statement-breakpoint
-- Redeeming a link looks the invite up by email to catch the case where someone
-- signs in by another route before clicking it.
CREATE INDEX IF NOT EXISTS "event_plan_invites_email_idx" ON "event_plan_invites" ("email");
