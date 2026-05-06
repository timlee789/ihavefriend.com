-- Step 11 (Voice QR Phase 1): fragment_audios → multi-audio per fragment.
--
-- Background:
--   The original fragment_audios table (20260505_1_fragment_audios)
--   enforced one audio per fragment via UNIQUE (fragment_id). This was
--   correct for the single-recording flow but broke continuation (이어
--   말하기): on POST, the existing R2 object was deleted and the row was
--   UPDATEd, wiping the user's first recording. Tim's 시나리오 2 surfaced
--   this on 2026-05-06.
--
-- Tim decision (2026-05-06):
--   - 1 fragment can have N audio recordings (continuation appends one)
--   - 1 QR code per fragment (uses the FIRST audio's public_token)
--   - Family sees a single /listen page with all N players in order
--   - Limits: 5 min/recording, 10 recordings/fragment, 30 recordings/day
--     (limits enforced in the API layer, not as DB constraints — easier
--      to tune during beta without migrations)
--
-- Changes:
--   1. DROP UNIQUE (fragment_id) — replaced by composite UNIQUE
--   2. ADD audio_order INT (1, 2, 3...) — continuation order
--   3. ADD UNIQUE (fragment_id, audio_order) — prevents duplicate orders
--   4. New index for ordered fetching
--
-- Backfill:
--   Existing rows get audio_order = 1 (single recordings). Safe because
--   every existing fragment has at most one audio row (the old constraint
--   guaranteed this).
--
-- Rollback notes:
--   Reverting requires DELETE of all rows where audio_order > 1, then
--   ADD CONSTRAINT UNIQUE (fragment_id). Not provided here — beta data
--   loss is acceptable, production migration is forward-only.
--
-- All DDL is IF NOT EXISTS / safe-to-rerun (idempotent).

-- ─────────────────────────────────────────────────────────────────
-- 1. Add audio_order column with default 1 (backfills existing rows)
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE fragment_audios
  ADD COLUMN IF NOT EXISTS audio_order INT NOT NULL DEFAULT 1;

-- ─────────────────────────────────────────────────────────────────
-- 2. Drop the single-audio UNIQUE constraint
-- ─────────────────────────────────────────────────────────────────
-- Constraint was named "fragment_audios_one_per_fragment" in the
-- original migration. Defensive: try both that name and the Postgres
-- auto-generated name, since some environments may have one or the other.

ALTER TABLE fragment_audios
  DROP CONSTRAINT IF EXISTS fragment_audios_one_per_fragment;

ALTER TABLE fragment_audios
  DROP CONSTRAINT IF EXISTS fragment_audios_fragment_id_key;

-- ─────────────────────────────────────────────────────────────────
-- 3. Add composite UNIQUE (fragment_id, audio_order)
-- ─────────────────────────────────────────────────────────────────
-- This replaces the single-column UNIQUE. Two recordings on the same
-- fragment get different audio_order values; uniqueness prevents the
-- API from accidentally creating order collisions.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'fragment_audios_fragment_order_unique'
  ) THEN
    ALTER TABLE fragment_audios
      ADD CONSTRAINT fragment_audios_fragment_order_unique
      UNIQUE (fragment_id, audio_order);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 4. Index for ordered fetch (fragment → all audios in order)
-- ─────────────────────────────────────────────────────────────────
-- The composite UNIQUE above creates a backing index but ordered by
-- (fragment_id, audio_order) which is exactly what we want for
-- "SELECT ... WHERE fragment_id = $1 ORDER BY audio_order". An
-- explicit index isn't strictly needed, but we add a named one for
-- clarity and to make EXPLAIN plans easier to read.

CREATE INDEX IF NOT EXISTS idx_fragment_audios_fragment_order
  ON fragment_audios(fragment_id, audio_order);

-- ─────────────────────────────────────────────────────────────────
-- 5. Sanity comment column for future readers
-- ─────────────────────────────────────────────────────────────────

COMMENT ON COLUMN fragment_audios.audio_order IS
  '1-based order of this audio within its fragment. First recording = 1, continuation = 2, 3, ...';
