-- Improve AI recommendations by adding integration context to search
-- File titles weighted highest (A), integration folder names (B), content (C)

-- Add school_year to integrations for year-based filtering
ALTER TABLE "school_drive_integrations" ADD COLUMN "school_year" text;

-- Add integration fields to file index for search context
ALTER TABLE "drive_file_index" ADD COLUMN "integration_id" uuid;
ALTER TABLE "drive_file_index" ADD COLUMN "integration_name" text;

-- FK constraint linking files to their source integration
ALTER TABLE "drive_file_index"
  ADD CONSTRAINT "drive_file_index_integration_id_fkey"
  FOREIGN KEY ("integration_id")
  REFERENCES "school_drive_integrations"("id")
  ON DELETE SET NULL;

-- Index for faster joins on integration_id
CREATE INDEX "drive_file_index_integration_idx" ON "drive_file_index" ("integration_id");

-- Note: Existing rows will have NULL integration_id and integration_name.
-- These will be populated on the next indexing run, which will also
-- rebuild the search_vector to include integration_name at weight B.
