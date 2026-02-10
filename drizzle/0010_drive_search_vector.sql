-- Add full-text search vector column to drive_file_index
-- Filename matches are weighted higher (A) than content matches (C)

ALTER TABLE "drive_file_index" ADD COLUMN "search_vector" tsvector;

-- Create GIN index for fast full-text search
CREATE INDEX "drive_file_index_search_idx" ON "drive_file_index" USING GIN ("search_vector");

-- Populate search_vector for existing rows
-- Weight A (highest) for filename, Weight C for content
UPDATE "drive_file_index" SET "search_vector" =
  setweight(to_tsvector('english', coalesce("file_name", '')), 'A') ||
  setweight(to_tsvector('english', coalesce("text_content", '')), 'C');
