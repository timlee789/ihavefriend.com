-- ============================================================
-- 005: Story Fragments table
-- Core table for the Story Fragment Engine
-- ============================================================

CREATE TABLE IF NOT EXISTS story_fragments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,

  -- Title & Content
  title VARCHAR(200) NOT NULL,
  subtitle VARCHAR(300),
  content TEXT NOT NULL,                    -- Final polished text
  content_raw TEXT,                         -- LLM first draft (before user edits)

  -- Source tracking
  source_session_ids UUID[] DEFAULT '{}',           -- Which conversations produced this
  source_memory_node_ids UUID[] DEFAULT '{}',       -- Which memory nodes were used
  source_conversation_date DATE,                    -- Date of the original conversation

  -- Auto-generated tags (5 types)
  tags_era TEXT[] DEFAULT '{}',             -- Time periods: "childhood", "2024", "20s"
  tags_people TEXT[] DEFAULT '{}',          -- People mentioned: "Harold", "어머니"
  tags_place TEXT[] DEFAULT '{}',           -- Places: "The Collegiate Grill", "서울"
  tags_theme TEXT[] DEFAULT '{}',           -- Themes: "family", "loss", "work", "faith"
  tags_emotion TEXT[] DEFAULT '{}',         -- Emotions: "gratitude", "grief", "joy"

  -- Metadata
  word_count INT DEFAULT 0,
  language VARCHAR(5) DEFAULT 'ko',
  voice_style VARCHAR(20) DEFAULT 'conversational'
    CHECK (voice_style IN ('conversational', 'narrative', 'letter')),

  -- Status management
  status VARCHAR(20) DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'archived', 'deleted')),
  visibility VARCHAR(20) DEFAULT 'private'
    CHECK (visibility IN ('private', 'shared', 'public')),

  -- Media attachments (future)
  media_attachments JSONB DEFAULT '[]',
  -- Format: [{"type": "image", "url": "...", "caption": "..."}, ...]

  -- Story connection (when Fragment joins a Story)
  story_id UUID,
  story_order INT,

  -- User edit tracking
  user_edited BOOLEAN DEFAULT false,
  user_edited_at TIMESTAMP WITH TIME ZONE,
  edit_count INT DEFAULT 0,

  -- LLM generation metadata
  generated_by VARCHAR(50),                -- Model name: "qwen2.5-32b", "llama-3.3-70b"
  generation_prompt_hash VARCHAR(64),       -- Hash of prompt used (for reproducibility)
  generation_version INT DEFAULT 1,         -- How many times regenerated

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_fragments_user
  ON story_fragments(user_id);
CREATE INDEX IF NOT EXISTS idx_fragments_status
  ON story_fragments(user_id, status)
  WHERE status != 'deleted';
CREATE INDEX IF NOT EXISTS idx_fragments_story
  ON story_fragments(story_id, story_order)
  WHERE story_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fragments_date
  ON story_fragments(user_id, created_at DESC);

-- GIN indexes for tag-based queries (clustering, story suggestions)
CREATE INDEX IF NOT EXISTS idx_fragments_tags_theme
  ON story_fragments USING GIN(tags_theme);
CREATE INDEX IF NOT EXISTS idx_fragments_tags_people
  ON story_fragments USING GIN(tags_people);
CREATE INDEX IF NOT EXISTS idx_fragments_tags_era
  ON story_fragments USING GIN(tags_era);
CREATE INDEX IF NOT EXISTS idx_fragments_tags_place
  ON story_fragments USING GIN(tags_place);

-- Auto-update trigger
CREATE TRIGGER trg_fragments_updated
  BEFORE UPDATE ON story_fragments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
