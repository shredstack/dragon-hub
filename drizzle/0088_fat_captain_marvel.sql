-- The submitter's own way out of a request an officer has already seen.
--
-- `IF NOT EXISTS` because this is re-runnable against a database that was
-- pushed before it was migrated. Nothing in this migration *uses* the new
-- value, which is what keeps `ALTER TYPE ... ADD VALUE` safe inside the
-- transaction drizzle-kit wraps a migration in.
ALTER TYPE "public"."reimbursement_status" ADD VALUE IF NOT EXISTS 'withdrawn';
