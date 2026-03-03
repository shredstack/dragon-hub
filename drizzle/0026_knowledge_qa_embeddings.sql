-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding columns to searchable tables
ALTER TABLE "knowledge_articles" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);
ALTER TABLE "budget_categories" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);
ALTER TABLE "event_plans" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);
ALTER TABLE "fundraisers" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);
ALTER TABLE "board_handoff_notes" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);
ALTER TABLE "drive_file_index" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

-- Create HNSW indexes for fast similarity search
-- HNSW provides better query performance than IVFFlat for this use case
CREATE INDEX IF NOT EXISTS "knowledge_articles_embedding_idx" ON "knowledge_articles" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX IF NOT EXISTS "budget_categories_embedding_idx" ON "budget_categories" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX IF NOT EXISTS "event_plans_embedding_idx" ON "event_plans" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX IF NOT EXISTS "fundraisers_embedding_idx" ON "fundraisers" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX IF NOT EXISTS "board_handoff_notes_embedding_idx" ON "board_handoff_notes" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX IF NOT EXISTS "drive_file_index_embedding_idx" ON "drive_file_index" USING hnsw ("embedding" vector_cosine_ops);
