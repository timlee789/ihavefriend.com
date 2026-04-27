-- Task 47 #4: STT quality telemetry on chat_sessions
--
-- sttQualityScore: 1.0 = clean transcript, 0.0 = entirely noise
--   Computed as (1 - noiseRatio) where noiseRatio comes from
--   lib/transcriptNoise.cleanTranscript().
--
-- noisyTurnCount: number of user turns that contained an ASR
--   repetition burst (detected by lib/transcriptNoise.detectBurst).

ALTER TABLE "chat_sessions"
  ADD COLUMN "stt_quality_score" DOUBLE PRECISION,
  ADD COLUMN "noisy_turn_count"  INTEGER NOT NULL DEFAULT 0;

-- Optional partial index for analytics queries (find low-quality sessions)
CREATE INDEX IF NOT EXISTS "chat_sessions_low_quality_idx"
  ON "chat_sessions" ("stt_quality_score")
  WHERE "stt_quality_score" IS NOT NULL AND "stt_quality_score" < 0.7;
