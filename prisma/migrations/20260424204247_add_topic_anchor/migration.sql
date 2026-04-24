-- AlterTable
ALTER TABLE "chat_sessions" ADD COLUMN     "topic_anchor" TEXT;

-- Preserve IVFFlat index (auto-generated DROP removed)
CREATE INDEX IF NOT EXISTS idx_embeddings_vector ON memory_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
