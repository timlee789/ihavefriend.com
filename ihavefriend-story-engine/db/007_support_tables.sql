-- ============================================================
-- 007: Support tables
-- Job queue for local LLM batch processing + voice profiles
-- ============================================================

-- ============================================================
-- Fragment Generation Queue — RTX 5090 batch job management
-- ============================================================
CREATE TABLE IF NOT EXISTS fragment_generation_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,

  -- Job type
  job_type VARCHAR(30) NOT NULL
    CHECK (job_type IN (
      'generate_fragment',          -- Create Fragment from tagged conversation
      'tag_fragment',               -- Auto-tag an existing Fragment
      'cluster_fragments',          -- Find related Fragments for Story suggestion
      'generate_story',             -- Combine Fragments into a Story
      'rewrite_fragment',           -- Rewrite in different voice style
      'voice_profile_update',       -- Analyze user's speech patterns
      'fact_check'                  -- Check consistency across Fragments
    )),

  -- Input data (varies by job_type)
  input_data JSONB NOT NULL DEFAULT '{}',

  -- Status
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  priority INT DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  -- Priority: 1=lowest, 10=highest
  -- generate_fragment: 8, tag_fragment: 6, cluster: 4, voice_profile: 3

  -- Output
  output_data JSONB,
  error_message TEXT,

  -- Processing info
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  processing_time_ms INT,
  model_used VARCHAR(50),                   -- "qwen2.5-32b-q4", "llama-3.3-70b-q4"

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Get next pending job (sorted by priority, then age)
CREATE INDEX IF NOT EXISTS idx_queue_pending
  ON fragment_generation_queue(status, priority DESC, created_at ASC)
  WHERE status = 'pending';

-- User's job history
CREATE INDEX IF NOT EXISTS idx_queue_user
  ON fragment_generation_queue(user_id, created_at DESC);

-- ============================================================
-- User Voice Profiles — How each user speaks/writes
-- ============================================================
CREATE TABLE IF NOT EXISTS user_voice_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,

  -- Speech pattern analysis
  avg_sentence_length DECIMAL(5,1),         -- Average words per sentence
  frequent_expressions TEXT[] DEFAULT '{}', -- "진짜", "솔직히", "근데"
  emotion_style VARCHAR(20) DEFAULT 'direct'
    CHECK (emotion_style IN ('direct', 'indirect', 'mixed')),
  humor_frequency VARCHAR(10) DEFAULT 'medium'
    CHECK (humor_frequency IN ('high', 'medium', 'low', 'none')),

  -- Language mixing pattern
  language_mix JSONB DEFAULT '{}',
  -- {"primary": "ko", "secondary": "en", "mix_pattern": "korean_with_english_terms",
  --  "english_ratio": 0.15, "common_english_words": ["AI", "marketing", "content"]}

  -- Preferred writing style for Fragments
  preferred_voice VARCHAR(20) DEFAULT 'conversational'
    CHECK (preferred_voice IN ('conversational', 'narrative', 'letter')),

  -- Analysis basis
  sessions_analyzed INT DEFAULT 0,
  last_analyzed_at TIMESTAMP WITH TIME ZONE,

  -- Ready-to-use prompt summary for LLM
  voice_prompt_summary TEXT,
  -- Example: "이 사용자는 짧은 문장을 선호하며, 감정 표현이 직접적입니다.
  --           '진짜', '솔직히' 같은 강조 표현을 자주 씁니다..."

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT uq_voice_user UNIQUE(user_id)
);

CREATE TRIGGER trg_voice_profiles_updated
  BEFORE UPDATE ON user_voice_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
