-- ============================================================
-- 011: Add `truncated` flag to story_fragments
--
-- Marks fragments that were reconstructed from a Gemini response
-- which hit MAX_TOKENS (i.e. the JSON payload was cut off and
-- repaired by the progressive recovery parser in
-- lib/generateFragmentCloud.js). Lets the UI warn the user and
-- offer a "Regenerate" action, and lets us measure truncation
-- frequency over time.
-- ============================================================

ALTER TABLE story_fragments
  ADD COLUMN IF NOT EXISTS truncated BOOLEAN DEFAULT false;

-- Partial index — we only ever query "show me truncated ones",
-- so the index only stores those rows. Keeps it tiny.
CREATE INDEX IF NOT EXISTS idx_fragments_truncated
  ON story_fragments(user_id, truncated)
  WHERE truncated = true;

COMMENT ON COLUMN story_fragments.truncated IS
  'True if fragment was reconstructed from a MAX_TOKENS-truncated Gemini response';
