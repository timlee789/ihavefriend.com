-- Migration: 20260508_1_architect_system
-- Created: 2026-05-08 (after pricing V3 + Architect Bot final 결정)
--
-- SayAndKeep Architect Bot 시스템 schema.
--
-- 5 새 테이블:
--   1. chapter_library — Tim 큐레이션 챕터 (영감 트리거)
--   2. question_library — Tim 큐레이션 질문 (영감 트리거)
--   3. user_blueprints — 사용자 청사진
--   4. user_chapters — 사용자 챕터 (라이브러리 참조 + 수정 가능)
--   5. user_questions — 사용자 질문 (라이브러리 참조 + 수정 가능)
--
-- 2 기존 테이블 확장:
--   - chat_sessions.user_question_id (Studio 답변 매핑)
--   - story_fragments.user_question_id (Fragment 매핑)
--
-- 디자인 원칙:
--   - 라이브러리 = 영감 트리거 (정답 X)
--   - tag 매칭 (GIN index) + category 보강
--   - 사용자 자유 변경 (소스 라이브러리 추적용 source_*_id 별도)

-- =====================================================================
-- 1. chapter_library — 챕터 라이브러리 (Tim 사전 큐레이션)
-- =====================================================================

CREATE TABLE IF NOT EXISTS chapter_library (
  id            TEXT PRIMARY KEY,                    -- 'ch-001', 'ch-002'
  title         TEXT NOT NULL,                       -- '어린 시절'
  description   TEXT,                                -- 사용자에게 보여줄 설명
  language      TEXT NOT NULL DEFAULT 'ko',          -- 'ko' | 'en' | 'es'
  category      TEXT NOT NULL,                       -- 'childhood', 'youth', 'marriage' 등
  tags          TEXT[] NOT NULL DEFAULT '{}',        -- 5-10 영감 키워드
  is_general    BOOLEAN NOT NULL DEFAULT FALSE,      -- 기본 7 일반 목차
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- GIN index — tag 배열 검색용 (사용자 키워드 매칭)
CREATE INDEX IF NOT EXISTS idx_chapter_library_tags 
  ON chapter_library USING GIN (tags);

-- 일반 목차 (기본 7) 빠른 조회
CREATE INDEX IF NOT EXISTS idx_chapter_library_general
  ON chapter_library (language, sort_order)
  WHERE is_general = TRUE;

-- 언어별 전체 조회
CREATE INDEX IF NOT EXISTS idx_chapter_library_language
  ON chapter_library (language, category, sort_order);

-- =====================================================================
-- 2. question_library — 질문 라이브러리 (Tim 사전 큐레이션)
-- =====================================================================

CREATE TABLE IF NOT EXISTS question_library (
  id            TEXT PRIMARY KEY,                    -- 'q-001'
  question_text TEXT NOT NULL,                       -- '어머니에 대한 한 장면'
  description   TEXT,                                -- 사용자에게 보여줄 hint
  language      TEXT NOT NULL DEFAULT 'ko',
  category      TEXT NOT NULL,                       -- chapter 와 동일한 enum
  tags          TEXT[] NOT NULL DEFAULT '{}',        -- 3-5 매칭 키워드
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_question_library_tags
  ON question_library USING GIN (tags);

CREATE INDEX IF NOT EXISTS idx_question_library_category
  ON question_library (language, category);

-- =====================================================================
-- 3. user_blueprints — 사용자 청사진
-- =====================================================================

CREATE TABLE IF NOT EXISTS user_blueprints (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     INTEGER NOT NULL,
  title                       TEXT,                  -- 사용자 책 제목 (변경 가능)
  language                    TEXT NOT NULL DEFAULT 'ko',
  status                      TEXT NOT NULL DEFAULT 'designing',  -- designing | answering | completed
  max_chapters                INTEGER NOT NULL DEFAULT 7,
  max_questions_per_chapter   INTEGER NOT NULL DEFAULT 5,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT user_blueprints_user_fk
    FOREIGN KEY (user_id) REFERENCES "User"(id) ON DELETE CASCADE,
  CONSTRAINT user_blueprints_status_check
    CHECK (status IN ('designing', 'answering', 'completed', 'abandoned'))
);

CREATE INDEX IF NOT EXISTS idx_user_blueprints_user
  ON user_blueprints (user_id, status);

-- =====================================================================
-- 4. user_chapters — 사용자 챕터
-- =====================================================================

CREATE TABLE IF NOT EXISTS user_chapters (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id        UUID NOT NULL,
  source_chapter_id   TEXT,                          -- 라이브러리에서 import 한 경우
  chapter_number      INTEGER,                       -- 사용자가 보는 번호 (1, 2, 3...)
  title               TEXT NOT NULL,                 -- 사용자 수정 가능
  description         TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE, -- 사용자가 비활성 가능
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT user_chapters_blueprint_fk
    FOREIGN KEY (blueprint_id) REFERENCES user_blueprints(id) ON DELETE CASCADE,
  CONSTRAINT user_chapters_source_fk
    FOREIGN KEY (source_chapter_id) REFERENCES chapter_library(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_user_chapters_blueprint
  ON user_chapters (blueprint_id, sort_order)
  WHERE is_active = TRUE;

-- =====================================================================
-- 5. user_questions — 사용자 질문
-- =====================================================================

CREATE TABLE IF NOT EXISTS user_questions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id            UUID NOT NULL,
  source_question_id    TEXT,                        -- 라이브러리에서 import
  question_text         TEXT NOT NULL,               -- 사용자 수정 가능
  description           TEXT,                        -- hint (사용자 보기)
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  status                TEXT NOT NULL DEFAULT 'pending', -- pending | answered | skipped
  fragment_ids          UUID[] NOT NULL DEFAULT '{}',  -- Studio 답변 fragment 들
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT user_questions_chapter_fk
    FOREIGN KEY (chapter_id) REFERENCES user_chapters(id) ON DELETE CASCADE,
  CONSTRAINT user_questions_source_fk
    FOREIGN KEY (source_question_id) REFERENCES question_library(id) ON DELETE SET NULL,
  CONSTRAINT user_questions_status_check
    CHECK (status IN ('pending', 'answered', 'skipped'))
);

CREATE INDEX IF NOT EXISTS idx_user_questions_chapter
  ON user_questions (chapter_id, sort_order)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_user_questions_status
  ON user_questions (chapter_id, status);

-- =====================================================================
-- 6. 기존 테이블 확장 — Studio 답변 매핑
-- =====================================================================

-- chat_sessions: Studio 세션이 어느 user_question 에 답변하는지
ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS user_question_id UUID;

-- 🔥 PostgreSQL 은 ADD CONSTRAINT IF NOT EXISTS 를 지원 안 함.
-- pg_constraint 검사 후 ALTER 하는 DO 블록 패턴으로 idempotent 보장
-- (R0/R1/R2 의 photobook 마이그레이션과 동일 패턴).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_sessions_user_question_fk'
  ) THEN
    ALTER TABLE chat_sessions
      ADD CONSTRAINT chat_sessions_user_question_fk
        FOREIGN KEY (user_question_id) REFERENCES user_questions(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_question
  ON chat_sessions (user_question_id)
  WHERE user_question_id IS NOT NULL;

-- story_fragments: Fragment 가 어느 user_question 의 답변인지
ALTER TABLE story_fragments
  ADD COLUMN IF NOT EXISTS user_question_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'story_fragments_user_question_fk'
  ) THEN
    ALTER TABLE story_fragments
      ADD CONSTRAINT story_fragments_user_question_fk
        FOREIGN KEY (user_question_id) REFERENCES user_questions(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_story_fragments_user_question
  ON story_fragments (user_question_id)
  WHERE user_question_id IS NOT NULL;

-- =====================================================================
-- 7. updated_at 자동 갱신 trigger (PostgreSQL 표준 패턴)
-- =====================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_chapter_library_updated_at ON chapter_library;
CREATE TRIGGER update_chapter_library_updated_at
  BEFORE UPDATE ON chapter_library
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_question_library_updated_at ON question_library;
CREATE TRIGGER update_question_library_updated_at
  BEFORE UPDATE ON question_library
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_blueprints_updated_at ON user_blueprints;
CREATE TRIGGER update_user_blueprints_updated_at
  BEFORE UPDATE ON user_blueprints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_chapters_updated_at ON user_chapters;
CREATE TRIGGER update_user_chapters_updated_at
  BEFORE UPDATE ON user_chapters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_questions_updated_at ON user_questions;
CREATE TRIGGER update_user_questions_updated_at
  BEFORE UPDATE ON user_questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- DONE
-- =====================================================================

-- 다음 단계: 
--   1. scripts/seed-architect-libraries.js 실행
--      → JSON 파일 (data/architect/*.json) 을 DB 에 INSERT
--   2. Prisma schema.prisma 에 모델 추가 (별도 task)
--   3. /api/architect/* endpoints 구현
