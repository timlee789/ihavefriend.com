-- Task 52 #5: reconnect_count telemetry on chat_sessions
--
-- Counts mid-session WebSocket reconnect events (silentReconnect).
-- Lets us tell a clean session from one that was patched together
-- through transient drops when reading STT quality data later.
--
-- The two existing telemetry columns (stt_quality_score and
-- noisy_turn_count) were added in 20260427_add_stt_quality_telemetry.
-- This migration is purely additive — backfill is not needed since
-- 0 is the natural baseline for a counter.

ALTER TABLE "chat_sessions"
  ADD COLUMN IF NOT EXISTS "reconnect_count" INTEGER NOT NULL DEFAULT 0;
