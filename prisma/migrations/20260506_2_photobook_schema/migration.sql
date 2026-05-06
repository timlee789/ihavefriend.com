-- Photobook v3 Phase 1 (P1): DB schema for photobook expansion.
--
-- Strategy: STRATEGY-photobook-expansion-v3-2026-05-06.md
-- Tim decision (2026-05-06):
--   "Template 이 필요 없을것 같아요. 그냥 한페이지에 사진하나 그리고
--   설명 과 음성 녹음 QR code 그리고 원본 음성 player 이렇게 구성"
--
-- Single layout per page. No template column. Photo per page is 1 (UNIQUE).
-- Audio per page is 1 (UNIQUE). Page order is user-controlled via page_number.
--
-- Why separate tables (vs reusing fragment_*):
--   - fragment_id FK on fragment_photos/fragment_audios is meaningless for
--     photobook pages (which belong to user_books, not story_fragments)
--   - photobook needs photo dimensions (width/height) for PDF layout;
--     fragment_photos doesn't track these
--   - keeping schemas separated prevents the voice QR system (just
--     beta-validated) from being destabilized by photobook changes
--   - lib/r2Client.js helpers are reused — only the table is new
--
-- All DDL is idempotent (IF NOT EXISTS / DO blocks for constraints).

-- ─────────────────────────────────────────────────────────────────
-- 1. user_books.book_type — distinguish memoir / essay / photobook
-- ─────────────────────────────────────────────────────────────────
-- Defaults to 'memoir' so existing rows keep working. New photobook
-- entries set 'photobook' explicitly. Future: 'essay', 'combined'.

ALTER TABLE user_books
  ADD COLUMN IF NOT EXISTS book_type TEXT NOT NULL DEFAULT 'memoir';

-- Optional: enforce known values. Keep it permissive for now (beta) so
-- new types can be added without a migration; promote to CHECK later if
-- we see corruption.
-- ALTER TABLE user_books
--   ADD CONSTRAINT user_books_book_type_check
--   CHECK (book_type IN ('memoir', 'essay', 'photobook', 'combined'));

CREATE INDEX IF NOT EXISTS idx_user_books_user_type
  ON user_books(user_id, book_type);

COMMENT ON COLUMN user_books.book_type IS
  'Type of book: memoir | essay | photobook | combined. Default memoir for backward compat.';

-- ─────────────────────────────────────────────────────────────────
-- 2. photobook_pages — one row per page in a photobook
-- ─────────────────────────────────────────────────────────────────
-- No layout_template column (v3 single-layout decision).
-- page_number is 1-based; UNIQUE(user_book_id, page_number) lets us
-- reorder by updating page_number values (with care for transient
-- collisions during reorder — handled at API layer with a temp shift).

CREATE TABLE IF NOT EXISTS photobook_pages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_book_id    UUID NOT NULL REFERENCES user_books(id) ON DELETE CASCADE,
  page_number     INT  NOT NULL,
  page_title      TEXT,
  caption         TEXT,
  caption_raw     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'photobook_pages_book_page_unique'
  ) THEN
    ALTER TABLE photobook_pages
      ADD CONSTRAINT photobook_pages_book_page_unique
      UNIQUE (user_book_id, page_number);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_photobook_pages_book
  ON photobook_pages(user_book_id, page_number);

COMMENT ON COLUMN photobook_pages.page_title IS 'Optional page title (above caption).';
COMMENT ON COLUMN photobook_pages.caption    IS 'User-edited caption text (final).';
COMMENT ON COLUMN photobook_pages.caption_raw IS 'Original Whisper transcript before user edits, for reference/comparison.';

-- ─────────────────────────────────────────────────────────────────
-- 3. photobook_page_photos — one photo per page (UNIQUE page_id)
-- ─────────────────────────────────────────────────────────────────
-- v3 simplification: 1 page = 1 photo. No photo_slot column. If we
-- later allow 2-photo layouts, we'll re-add slot via a new migration.

CREATE TABLE IF NOT EXISTS photobook_page_photos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id         UUID NOT NULL UNIQUE REFERENCES photobook_pages(id) ON DELETE CASCADE,
  r2_key          TEXT NOT NULL,
  r2_url          TEXT NOT NULL,
  width           INT,
  height          INT,
  size_bytes      INT,
  mime_type       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photobook_page_photos_page
  ON photobook_page_photos(page_id);

COMMENT ON COLUMN photobook_page_photos.width  IS 'Pixel width, used for PDF layout aspect-ratio calc.';
COMMENT ON COLUMN photobook_page_photos.height IS 'Pixel height, used for PDF layout aspect-ratio calc.';

-- ─────────────────────────────────────────────────────────────────
-- 4. photobook_page_audios — one audio per page (UNIQUE page_id)
-- ─────────────────────────────────────────────────────────────────
-- Mirrors fragment_audios shape (the voice QR system that just shipped)
-- so we can reuse R2 client + /api/audio/[token] proxy. Differences:
--   - page_id (UNIQUE) instead of fragment_id with audio_order
--   - no audio_order column (v3: 1 audio per page, no continuation)
--   - same public_token + is_public + play_count pattern
--
-- /api/audio/[token] will UNION-lookup both tables (Phase 1 P5).

CREATE TABLE IF NOT EXISTS photobook_page_audios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id         UUID NOT NULL UNIQUE REFERENCES photobook_pages(id) ON DELETE CASCADE,
  user_id         INT  NOT NULL REFERENCES "User"(id),
  r2_key          TEXT NOT NULL,
  r2_url          TEXT NOT NULL,
  duration_sec    INT  NOT NULL,
  size_bytes      INT,
  mime_type       TEXT,
  whisper_text    TEXT,
  public_token    TEXT NOT NULL UNIQUE,
  is_public       BOOLEAN NOT NULL DEFAULT TRUE,
  play_count      INT NOT NULL DEFAULT 0,
  first_played_at TIMESTAMPTZ,
  last_played_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photobook_page_audios_token
  ON photobook_page_audios(public_token);
CREATE INDEX IF NOT EXISTS idx_photobook_page_audios_user
  ON photobook_page_audios(user_id);

COMMENT ON TABLE photobook_page_audios IS
  'Voice recordings for photobook pages. Pattern mirrors fragment_audios (voice QR system). One audio per page.';

-- ─────────────────────────────────────────────────────────────────
-- 5. updated_at trigger (reuse existing or define if missing)
-- ─────────────────────────────────────────────────────────────────
-- The project already has set_updated_at() trigger function from earlier
-- migrations. Defensive create-or-replace:

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_photobook_pages_updated_at        ON photobook_pages;
DROP TRIGGER IF EXISTS trg_photobook_page_audios_updated_at  ON photobook_page_audios;

CREATE TRIGGER trg_photobook_pages_updated_at
  BEFORE UPDATE ON photobook_pages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_photobook_page_audios_updated_at
  BEFORE UPDATE ON photobook_page_audios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
