-- NOTE (2026-04-24): Prisma auto-generated a DROP INDEX for
-- "idx_embeddings_vector" (IVFFlat) because it is not in the schema.
-- We intentionally preserve this index. The DROP has been removed and,
-- as a belt-and-suspenders safeguard, we re-assert its existence at the
-- end of this migration via CREATE INDEX IF NOT EXISTS.

-- AlterTable
ALTER TABLE "books" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "chat_sessions" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "memory_nodes" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "stories" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "story_fragments" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "user_collections" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "user_voice_profiles" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- Re-assert IVFFlat vector index (preserved through this migration)
CREATE INDEX IF NOT EXISTS idx_embeddings_vector ON memory_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
