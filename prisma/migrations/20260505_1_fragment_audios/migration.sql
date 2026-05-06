-- Step 02 (Voice QR Phase 1): fragment_audios table.
--
-- Stores user voice recordings tied to story_fragments. Each row links
-- a fragment to its R2 object + public_token for QR-code-based family
-- listening. See experiments/100-voice-qr-system-phase-1.md §5.1.
--
-- Tim decision 5-A (2026-05-04): is_public defaults to TRUE — family
--   sharing is the natural flow, opt-out via toggle in FragmentModal.
--
-- All DDL is IF NOT EXISTS / safe-to-rerun (idempotent), matching
-- prior migrations like 20260428_3_book_system_schema.

-- ─────────────────────────────────────────────────────────────────
-- 1. Table
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fragment_audios (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fragment_id     UUID NOT NULL REFERENCES story_fragments(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,

  -- R2 storage
  r2_key          TEXT NOT NULL,
  r2_bucket       TEXT NOT NULL DEFAULT 'sayandkeep-audio',
  r2_url          TEXT NOT NULL,
  duration_sec    INTEGER NOT NULL,
  size_bytes      BIGINT NOT NULL,
  mime_type       TEXT NOT NULL DEFAULT 'audio/webm',

  -- Whisper transcript (음성 검색용 미래 활용)
  whisper_text    TEXT,

  -- QR 공유 (Tim 결정 5-A: 기본 ON)
  public_token    TEXT NOT NULL,
  is_public       BOOLEAN NOT NULL DEFAULT TRUE,

  -- Analytics
  play_count      INTEGER NOT NULL DEFAULT 0,
  last_played_at  TIMESTAMPTZ,
  first_played_at TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT fragment_audios_one_per_fragment UNIQUE (fragment_id),
  CONSTRAINT fragment_audios_public_token_unique UNIQUE (public_token)
);

-- ─────────────────────────────────────────────────────────────────
-- 2. Indexes
-- ─────────────────────────────────────────────────────────────────

-- Fast lookup by token for public /listen endpoint (only when shared)
CREATE INDEX IF NOT EXISTS idx_fragment_audios_token
  ON fragment_audios(public_token)
  WHERE is_public = TRUE;

-- User's audio listing
CREATE INDEX IF NOT EXISTS idx_fragment_audios_user
  ON fragment_audios(user_id);

-- ─────────────────────────────────────────────────────────────────
-- 3. updated_at trigger
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_fragment_audios_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS fragment_audios_updated_at ON fragment_audios;
CREATE TRIGGER fragment_audios_updated_at
  BEFORE UPDATE ON fragment_audios
  FOR EACH ROW
  EXECUTE FUNCTION update_fragment_audios_updated_at();
