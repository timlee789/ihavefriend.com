-- ============================================================
-- 004: Add Story Fragment fields to existing tables
-- Run AFTER 001-003 are already executed
-- ============================================================

-- memory_nodes: track which fragment uses this memory
ALTER TABLE memory_nodes
  ADD COLUMN IF NOT EXISTS story_fragment_id UUID,
  ADD COLUMN IF NOT EXISTS narrative_relevance INT DEFAULT 0
    CHECK (narrative_relevance BETWEEN 0 AND 5);

-- Index: find memories linked to a fragment
CREATE INDEX IF NOT EXISTS idx_memory_nodes_fragment
  ON memory_nodes(story_fragment_id)
  WHERE story_fragment_id IS NOT NULL;

-- Index: find story-worthy memories efficiently
CREATE INDEX IF NOT EXISTS idx_memory_nodes_narrative
  ON memory_nodes(user_id, narrative_relevance DESC)
  WHERE narrative_relevance >= 3;

COMMENT ON COLUMN memory_nodes.story_fragment_id IS
  'ID of the Story Fragment this memory was used to generate';
COMMENT ON COLUMN memory_nodes.narrative_relevance IS
  'How story-worthy this memory is (0=none, 3=episode, 5=life-defining)';

-- chat_sessions: mark conversations that contain fragment-worthy content
ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS fragment_candidate BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS fragment_elements JSONB DEFAULT '{}';

COMMENT ON COLUMN chat_sessions.fragment_candidate IS
  'true if this conversation contains content for a Story Fragment';
COMMENT ON COLUMN chat_sessions.fragment_elements IS
  'Detected story elements: {when, where, who, what, emotion, why, completeness}';
