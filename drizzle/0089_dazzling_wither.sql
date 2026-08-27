-- Ask DragonHub previously never queried pta_minutes at all — it only ever
-- saw minutes through a separate, unrelated Drive-folder sync into
-- drive_file_index, truncated more aggressively and with none of this
-- table's meeting_month/meeting_year metadata. This embedding lets
-- semanticSearch query minutes directly, against their fuller text and with
-- date metadata attached (see formatMinutesForEmbedding).
ALTER TABLE "pta_minutes" ADD COLUMN "embedding" vector(1536);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pta_minutes_embedding_idx" ON "pta_minutes" USING hnsw ("embedding" vector_cosine_ops);