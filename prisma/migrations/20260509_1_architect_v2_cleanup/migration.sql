-- Migration: 20260509_1_architect_v2_cleanup
-- Created: 2026-05-09 (Tim 의 6차 정정 후, V2 시스템 시작)
--
-- SayAndKeep Architect Bot V2 — Cleanup + Integration.
--
-- Tim 의 결정적 짚어줌 (2026-05-08):
--   "기존의 시스템을 절대 훼손하지 않고 여기에 편입해서 일을 해야하는것"
--
-- 폐기 (제 실수 정정):
--   - user_blueprints (V1, user_books 와 중복)
--   - user_chapters
--   - user_questions
--   - chat_sessions.user_question_id (FK + column)
--   - story_fragments.user_question_id (FK + column)
--
-- 추가 (V2):
--   - blueprint_samples (5 시나리오 = book_template_definitions 형식)
--   - user_books.source_sample_id (어느 시나리오에서 시작)
--
-- 변경:
--   - book_template_definitions.is_active = false (모든 active templates)
--
-- 보존 (Phase 1a-1b 자산):
--   - chapter_library (45 chapters) — 영감 + 시나리오 만들기 재료
--   - question_library (75 questions) — 영감 + 시나리오 만들기 재료
--   - 4 endpoints (general-chapters, match-chapters, match-questions, extract-keywords) — 미래 옵션
--   - lib/architect/categoryHints.js — 미래 옵션
--
-- Strategy: STRATEGY-architect-bot-final-V2-2026-05-08.md
-- Decision: DECISION-deprecate-user-blueprints-2026-05-08.md

-- =====================================================================
-- 1. user_blueprints 시스템 폐기 (DROP CASCADE)
-- =====================================================================

-- 의존 순서: questions → chapters → blueprints
-- CASCADE 로 FK 자동 처리. 데이터 0 rows 확인됨 (Tim Q3=b).

DROP TABLE IF EXISTS user_questions CASCADE;
DROP TABLE IF EXISTS user_chapters CASCADE;
DROP TABLE IF EXISTS user_blueprints CASCADE;

-- =====================================================================
-- 2. chat_sessions, story_fragments 의 user_question_id 제거
-- =====================================================================

-- FK constraint 먼저 (idempotent 패턴 — R0/R1/R2 photobook 일관)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_sessions_user_question_fk'
  ) THEN
    ALTER TABLE chat_sessions DROP CONSTRAINT chat_sessions_user_question_fk;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'story_fragments_user_question_fk'
  ) THEN
    ALTER TABLE story_fragments DROP CONSTRAINT story_fragments_user_question_fk;
  END IF;
END $$;

-- Indexes
DROP INDEX IF EXISTS idx_chat_sessions_user_question;
DROP INDEX IF EXISTS idx_story_fragments_user_question;

-- Columns
ALTER TABLE chat_sessions DROP COLUMN IF EXISTS user_question_id;
ALTER TABLE story_fragments DROP COLUMN IF EXISTS user_question_id;

-- =====================================================================
-- 3. blueprint_samples 테이블 추가 (V2 핵심)
-- =====================================================================

-- structure JSONB 는 book_template_definitions.default_structure 와 동일 형식.
-- POST /api/book/start 에서 이 structure 가 user_books.structure 로 복사됨.

CREATE TABLE IF NOT EXISTS blueprint_samples (
  id            TEXT PRIMARY KEY,                    -- 'sample-001' ~ 'sample-005'
  display_label TEXT NOT NULL,                       -- '목차 샘플 1' (UI 표시)
  language      TEXT NOT NULL DEFAULT 'ko',
  structure     JSONB NOT NULL,                      -- book_template_definitions 와 동일
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Active samples 빠른 조회 (사용자 페이지)
CREATE INDEX IF NOT EXISTS idx_blueprint_samples_active
  ON blueprint_samples (language, sort_order)
  WHERE is_active = TRUE;

-- Trigger (update_updated_at_column 함수 재사용 — Phase 1a 에서 정의됨)
DROP TRIGGER IF EXISTS update_blueprint_samples_updated_at ON blueprint_samples;
CREATE TRIGGER update_blueprint_samples_updated_at
  BEFORE UPDATE ON blueprint_samples
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- 4. user_books 확장 — source_sample_id (시나리오 추적)
-- =====================================================================

ALTER TABLE user_books
  ADD COLUMN IF NOT EXISTS source_sample_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_books_source_sample_fk'
  ) THEN
    ALTER TABLE user_books
      ADD CONSTRAINT user_books_source_sample_fk
      FOREIGN KEY (source_sample_id) REFERENCES blueprint_samples(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_books_source_sample
  ON user_books (source_sample_id)
  WHERE source_sample_id IS NOT NULL;

-- =====================================================================
-- 5. book_template_definitions 비활성화 (Tim Q2=a)
-- =====================================================================

-- 데이터 보존, UI 노출 X, FK 안전.
-- /api/book/templates 가 is_active=true 만 반환하므로 자동 숨김.

UPDATE book_template_definitions 
   SET is_active = FALSE 
 WHERE is_active = TRUE;

-- =====================================================================
-- DONE
-- =====================================================================

-- 다음 단계: 
--   1. Prisma schema.prisma 정리 (5 모델 삭제 + 1 모델 + 1 컬럼 추가)
--   2. npx prisma format + generate (0 errors 검증)
--   3. scripts/seed-blueprint-samples.js (시나리오 5개 INSERT)
--   4. POST /api/book/start 수정 (sampleId 지원)
--   5. UI 4 페이지 + Admin UI

-- 보존된 자산 (Phase 1a-1b):
--   ✅ chapter_library (45) + question_library (75)
--   ✅ /api/architect/* 4 endpoints (general-chapters, match-chapters, 
--      match-questions, extract-keywords)
--   ✅ lib/architect/categoryHints.js
--   → 이 자산은 V2 의 시나리오 만들 때 + 구조 수정 페이지에서 영감 제공으로 활용 가능
