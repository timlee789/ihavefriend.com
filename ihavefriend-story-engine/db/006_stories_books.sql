-- ============================================================
-- 006: Stories & Books tables
-- Stories = grouped Fragments, Books = grouped Stories
-- ============================================================

-- ============================================================
-- Stories — A collection of related Fragments
-- ============================================================
CREATE TABLE IF NOT EXISTS stories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,

  title VARCHAR(300) NOT NULL,
  description TEXT,
  cover_image_url TEXT,

  -- How fragments are ordered
  chapter_type VARCHAR(20) DEFAULT 'thematic'
    CHECK (chapter_type IN ('chronological', 'thematic', 'hybrid')),

  -- Transition text between fragments
  -- Format: [{"after_fragment_id": "uuid", "before_fragment_id": "uuid", "transition_text": "..."}]
  narrative_transitions JSONB DEFAULT '[]',

  -- Aggregated tags from child fragments
  tags_theme TEXT[] DEFAULT '{}',
  tags_era TEXT[] DEFAULT '{}',

  -- Status
  status VARCHAR(20) DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'published')),
  fragment_count INT DEFAULT 0,
  total_word_count INT DEFAULT 0,

  -- Book connection
  book_id UUID,
  book_order INT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stories_user ON stories(user_id);
CREATE INDEX IF NOT EXISTS idx_stories_book
  ON stories(book_id, book_order)
  WHERE book_id IS NOT NULL;

CREATE TRIGGER trg_stories_updated
  BEFORE UPDATE ON stories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Books — Final output combining multiple Stories
-- ============================================================
CREATE TABLE IF NOT EXISTS books (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,

  title VARCHAR(300) NOT NULL,
  author_name VARCHAR(100),
  dedication TEXT,                          -- "To my children..."
  preface TEXT,                             -- Introduction text
  epilogue TEXT,                            -- Closing text

  -- Output format
  format VARCHAR(20) DEFAULT 'web'
    CHECK (format IN ('web', 'pdf', 'print')),
  output_url TEXT,

  -- Status
  status VARCHAR(20) DEFAULT 'draft'
    CHECK (status IN ('draft', 'generating', 'completed', 'published')),
  story_count INT DEFAULT 0,
  total_word_count INT DEFAULT 0,

  -- Design
  cover_image_url TEXT,
  design_template VARCHAR(50) DEFAULT 'classic',

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_books_user ON books(user_id);

CREATE TRIGGER trg_books_updated
  BEFORE UPDATE ON books
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Add FK references from story_fragments to stories
-- ============================================================
ALTER TABLE story_fragments
  ADD CONSTRAINT fk_fragments_story
  FOREIGN KEY (story_id) REFERENCES stories(id)
  ON DELETE SET NULL;

ALTER TABLE stories
  ADD CONSTRAINT fk_stories_book
  FOREIGN KEY (book_id) REFERENCES books(id)
  ON DELETE SET NULL;
