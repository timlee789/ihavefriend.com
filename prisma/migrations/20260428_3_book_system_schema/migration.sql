-- Task 58 (Stage 1): Book System schema.
--
-- Two-part migration:
--   Part A — extend chat_sessions and story_fragments with optional
--            book_id / book_question_id pointers. NULL-allowed so beta
--            users keep working with no behaviour change.
--   Part B — three new tables: book_template_definitions (system-
--            provided memoir / etc.), user_books (a user's customised
--            book based on a template), and user_book_responses (one
--            row per question, tracking which fragments answer it).
--
-- All indexes are CREATE INDEX IF NOT EXISTS so re-running this
-- migration on a partially-applied DB is safe.

-- ─────────────────────────────────────────────────────────────────
-- A. Extend existing tables
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS book_id          UUID,
  ADD COLUMN IF NOT EXISTS book_question_id TEXT;

ALTER TABLE story_fragments
  ADD COLUMN IF NOT EXISTS book_id                UUID,
  ADD COLUMN IF NOT EXISTS book_question_id       TEXT,
  ADD COLUMN IF NOT EXISTS imported_from_fragment UUID;

CREATE INDEX IF NOT EXISTS idx_fragments_book
  ON story_fragments (user_id, book_id)
  WHERE book_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_book
  ON chat_sessions (user_id, book_id, started_at DESC)
  WHERE book_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────
-- B. New tables
-- ─────────────────────────────────────────────────────────────────

-- System-provided template definitions (memoir, milestone, etc.).
CREATE TABLE IF NOT EXISTS book_template_definitions (
  id                     TEXT PRIMARY KEY,
  name                   JSONB NOT NULL,
  description            JSONB,
  category               TEXT NOT NULL,
  default_structure      JSONB NOT NULL,
  estimated_chapters     INTEGER,
  estimated_questions    INTEGER,
  estimated_pages        INTEGER,
  estimated_days         INTEGER,
  is_active              BOOLEAN DEFAULT true,
  is_premium             BOOLEAN DEFAULT false,
  sort_order             INTEGER,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_book_templates_active
  ON book_template_definitions (sort_order)
  WHERE is_active = true;

-- A user's customised book derived from a template.
CREATE TABLE IF NOT EXISTS user_books (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                INTEGER NOT NULL,
  template_id            TEXT REFERENCES book_template_definitions(id),
  title                  TEXT,
  subtitle               TEXT,
  structure              JSONB NOT NULL,
  status                 TEXT DEFAULT 'in_progress',
  started_at             TIMESTAMPTZ DEFAULT NOW(),
  completed_at           TIMESTAMPTZ,
  last_active_at         TIMESTAMPTZ DEFAULT NOW(),
  payment_status         TEXT DEFAULT 'free',
  paid_at                TIMESTAMPTZ,
  paid_amount_usd        INTEGER,
  total_questions        INTEGER DEFAULT 0,
  completed_questions    INTEGER DEFAULT 0,
  current_chapter_id     TEXT,
  current_question_id    TEXT,
  last_question_id       TEXT,
  book_generated         BOOLEAN DEFAULT false,
  book_pdf_url           TEXT,
  book_generated_at      TIMESTAMPTZ,
  preview_pdf_url        TEXT,
  view_mode              TEXT DEFAULT 'linear'
);

CREATE INDEX IF NOT EXISTS idx_user_books_user
  ON user_books (user_id, last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_books_status
  ON user_books (status, last_active_at DESC);

-- Only one in_progress book per (user, template).
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_books_unique_active
  ON user_books (user_id, template_id)
  WHERE status = 'in_progress';

-- Per-question response tracking.
CREATE TABLE IF NOT EXISTS user_book_responses (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id                UUID REFERENCES user_books(id) ON DELETE CASCADE,
  user_id                INTEGER NOT NULL,
  question_id            TEXT NOT NULL,
  fragment_ids           UUID[] DEFAULT '{}',
  imported_fragment_ids  UUID[] DEFAULT '{}',
  status                 TEXT DEFAULT 'empty',
  first_answered_at      TIMESTAMPTZ,
  last_updated_at        TIMESTAMPTZ,
  selected_fragment_id   UUID,
  selected_imported_id   UUID,
  book_section_text      TEXT,
  UNIQUE (book_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_book_responses_book   ON user_book_responses (book_id);
CREATE INDEX IF NOT EXISTS idx_book_responses_user   ON user_book_responses (user_id);
CREATE INDEX IF NOT EXISTS idx_book_responses_status ON user_book_responses (book_id, status);
