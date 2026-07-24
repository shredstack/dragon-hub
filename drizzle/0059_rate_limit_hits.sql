-- Rate limit counters.
--
-- The public signup forms and join-code redemption are the only endpoints an
-- anonymous stranger can reach. A successful signup emails a 72-hour one-click
-- sign-in link to whatever address was typed, and a join code resolves the
-- *school* from the code — so both need a meter. There is no Redis in this
-- stack and a PTA's traffic fits comfortably in one indexed upsert.
--
-- Hand-trimmed after generation. drizzle-kit diffed against 0057's snapshot,
-- because 0058 is hand-written and never had one emitted, so it re-issued
-- 0058's classroom_signup_status / volunteer_signups statements into this file.
-- Those are already applied by 0058 and re-running them fails on
-- `CREATE TYPE ... already exists`. Only the rate-limit statements belong here;
-- 0059_snapshot.json is correct as written and covers both.

CREATE TABLE "rate_limit_hits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"subject" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint

-- The counter is an INSERT ... ON CONFLICT DO UPDATE, so this index is what
-- stops two concurrent requests both believing they were the fourth.
CREATE UNIQUE INDEX "rate_limit_hits_unique" ON "rate_limit_hits" USING btree ("action","subject","window_start");
--> statement-breakpoint

-- Serves the sweep in pruneRateLimitHits.
CREATE INDEX "rate_limit_hits_window_idx" ON "rate_limit_hits" USING btree ("window_start");
