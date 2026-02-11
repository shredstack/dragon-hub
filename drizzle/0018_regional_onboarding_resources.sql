-- State-level onboarding resources (managed by super admins)
CREATE TABLE IF NOT EXISTS "state_onboarding_resources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "state" text NOT NULL,
  "position" "pta_board_position",
  "title" text NOT NULL,
  "url" text NOT NULL,
  "description" text,
  "category" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "created_by" uuid REFERENCES "users"("id"),
  "updated_at" timestamp with time zone DEFAULT now()
);

-- District-level onboarding resources (managed by super admins)
CREATE TABLE IF NOT EXISTS "district_onboarding_resources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "state" text NOT NULL,
  "district" text NOT NULL,
  "position" "pta_board_position",
  "title" text NOT NULL,
  "url" text NOT NULL,
  "description" text,
  "category" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "created_by" uuid REFERENCES "users"("id"),
  "updated_at" timestamp with time zone DEFAULT now()
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS "state_onboarding_resources_state_idx" ON "state_onboarding_resources" ("state");
CREATE INDEX IF NOT EXISTS "state_onboarding_resources_position_idx" ON "state_onboarding_resources" ("position");
CREATE INDEX IF NOT EXISTS "district_onboarding_resources_state_district_idx" ON "district_onboarding_resources" ("state", "district");
CREATE INDEX IF NOT EXISTS "district_onboarding_resources_position_idx" ON "district_onboarding_resources" ("position");
