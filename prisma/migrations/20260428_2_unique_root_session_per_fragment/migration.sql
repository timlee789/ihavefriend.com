-- Task 56 (c): prevent duplicate root fragments from racing
-- /api/chat/end requests for the same session.
--
-- The bug: when a user navigates away from /chat, the page-close beacon
-- (visibilitychange/beforeunload) AND the React unmount cleanup
-- (forceStop) BOTH POST /api/chat/end with the same sessionId. Both
-- pass the STORY universal-save gate, both queue an `after()` job, and
-- both INSERT a story_fragments row. Result: 2-3 fragments for the
-- same session with subtly different titles (Gemini Flash is non-
-- deterministic). Confirmed in production for session f2d04e14 which
-- produced three fragments at 13:30:00 / :38 / :43.
--
-- Code-level idempotency check (EXISTS before INSERT) lands in the
-- same commit. This index is the database-level safety net so two
-- concurrent INSERTs racing past the EXISTS check still can't both
-- land — the second one will fail on the unique constraint and the
-- catch block will log + skip.
--
-- The index is partial:
--   • parent_fragment_id IS NULL  → only root fragments. Continuations
--     intentionally have their own session id, but the constraint is
--     still safe because each continuation session creates exactly one
--     continuation fragment with a different parent.
--   • array_length(source_session_ids, 1) >= 1  → guards against
--     the unrealistic empty-array case.
-- Index expression: (user_id, source_session_ids[1])
--   The single root fragment we ever generate per session sets
--   source_session_ids = [sessionId], so [1] is always the canonical
--   anchor. If we ever support multi-session merges, this index
--   would need adjusting.

CREATE UNIQUE INDEX IF NOT EXISTS "story_fragments_unique_session_root"
  ON "story_fragments" ("user_id", ("source_session_ids"[1]))
  WHERE "parent_fragment_id" IS NULL
    AND array_length("source_session_ids", 1) >= 1;
