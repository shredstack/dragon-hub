CREATE TABLE "classroom_teachers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"classroom_id" uuid NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "classroom_teachers" ADD CONSTRAINT "classroom_teachers_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "classroom_teachers_classroom_email_unique" ON "classroom_teachers" USING btree ("classroom_id","email");--> statement-breakpoint
CREATE INDEX "classroom_teachers_email_idx" ON "classroom_teachers" USING btree ("email");--> statement-breakpoint
-- Backfill: every room that already named a teacher keeps that teacher, as the
-- first entry in its new list. Lowercased and trimmed to match how
-- `setClassroomTeachers` writes from here on — every lookup is a plain equality
-- against this column. No name: there was never a field to type one into.
--
-- `classrooms.teacher_email` stays as a deprecated mirror of the first entry
-- (see the comment on it in schema.ts); it is no longer read by the app.
INSERT INTO "classroom_teachers" ("classroom_id", "name", "email", "sort_order")
SELECT "id", NULL, lower(trim("teacher_email")), 0
FROM "classrooms"
WHERE "teacher_email" IS NOT NULL AND trim("teacher_email") <> ''
ON CONFLICT DO NOTHING;