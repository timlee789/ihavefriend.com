-- AlterTable
ALTER TABLE "chat_sessions" ADD COLUMN     "continuation_parent_id" UUID;

-- AlterTable
ALTER TABLE "story_fragments" ADD COLUMN     "parent_fragment_id" UUID,
ADD COLUMN     "thread_order" SMALLINT;

-- CreateIndex
CREATE INDEX "idx_fragment_thread" ON "story_fragments"("parent_fragment_id", "thread_order");

-- AddForeignKey
ALTER TABLE "story_fragments" ADD CONSTRAINT "story_fragments_parent_fragment_id_fkey" FOREIGN KEY ("parent_fragment_id") REFERENCES "story_fragments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve IVFFlat index (auto-generated DROP removed)
CREATE INDEX IF NOT EXISTS idx_embeddings_vector ON memory_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
