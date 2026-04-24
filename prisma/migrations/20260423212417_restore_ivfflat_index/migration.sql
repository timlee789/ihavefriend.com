-- ═══════════════════════════════════════════════════════════════
-- Restore IVFFlat index for pgvector cosine similarity search
-- ═══════════════════════════════════════════════════════════════
--
-- WHY THIS MIGRATION EXISTS:
-- The `idx_embeddings_vector` IVFFlat index was accidentally dropped by
-- the preceding migration `20260423211513_add_user_settings` because
-- Prisma's schema diff does not know about pgvector index types.
--
-- Prisma v5 CANNOT represent IVFFlat indexes in schema.prisma because
-- the `vector(768)` column is typed as `Unsupported(...)`. As a result,
-- every time `prisma migrate dev` is run, Prisma's diff algorithm sees
-- this index as "unknown" and adds `DROP INDEX` to the new migration.
--
-- FUTURE MIGRATIONS — IMPORTANT PROCEDURE:
-- Before running `prisma migrate dev`:
--   1. Always use `--create-only` first:
--        npx prisma migrate dev --create-only --name <your-name>
--   2. Inspect the generated migration.sql
--   3. If it contains `DROP INDEX "idx_embeddings_vector";`:
--        - Either delete that line, OR
--        - Append the CREATE INDEX statement below to restore it
--   4. Then apply:  npx prisma migrate dev
--
-- This guard pattern is documented in:
--   wiki/projects/sayandkeep/experiments/11-migration-execution-guide.md
-- ═══════════════════════════════════════════════════════════════

-- pgvector IVFFlat cosine similarity index
-- Used by lib/tokenBudget.js vectorSimilaritySearch()
-- for semantic memory retrieval during Emma conversations.
CREATE INDEX IF NOT EXISTS idx_embeddings_vector
  ON memory_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
