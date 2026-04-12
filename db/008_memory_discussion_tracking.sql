-- Migration 008: Add discussion tracking columns to memory_nodes
-- times_discussed: how many separate sessions this memory has been re-mentioned
-- discussion_depth: cumulative depth score (increases when new data fields are added)

ALTER TABLE memory_nodes
  ADD COLUMN IF NOT EXISTS times_discussed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discussion_depth INTEGER NOT NULL DEFAULT 0;

-- Backfill existing rows: use mention_count as a proxy for times_discussed
UPDATE memory_nodes
SET times_discussed = COALESCE(mention_count, 0),
    discussion_depth = COALESCE(mention_count, 0)
WHERE times_discussed = 0;
