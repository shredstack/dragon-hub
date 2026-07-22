-- Track when the current guide generation run began so stale runs (whose
-- background work was killed by a deploy, crash, or function timeout) can be
-- detected and retried instead of leaving the UI spinning forever.

ALTER TABLE "onboarding_guides" ADD COLUMN "generation_started_at" timestamp with time zone;
