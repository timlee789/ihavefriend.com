-- NOTE (2026-04-23): Prisma auto-generated a DROP INDEX for
-- "idx_embeddings_vector" (IVFFlat) because it is not in the schema.
-- We intentionally preserve this index. The DROP has been removed and,
-- as a belt-and-suspenders safeguard, we re-assert its existence at the
-- end of this migration via CREATE INDEX IF NOT EXISTS.

-- CreateTable
CREATE TABLE "api_usage_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "session_id" UUID,
    "provider" VARCHAR(20) NOT NULL,
    "model" VARCHAR(50) NOT NULL,
    "operation" VARCHAR(40) NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DECIMAL(10,8) NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error_code" VARCHAR(50),
    "latency_ms" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "api_usage_logs_user_id_created_at_idx" ON "api_usage_logs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_usage_user_month" ON "api_usage_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_usage_recent" ON "api_usage_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_usage_op" ON "api_usage_logs"("user_id", "operation");

-- AddForeignKey
ALTER TABLE "api_usage_logs" ADD CONSTRAINT "api_usage_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Re-assert IVFFlat vector index (preserved through this migration)
CREATE INDEX IF NOT EXISTS idx_embeddings_vector ON memory_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
