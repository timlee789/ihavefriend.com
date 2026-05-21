-- V3 Milestone 3 Step 1e — user_books.language 컬럼 신설.
--
-- 단일 언어 정책의 진짜 해결. 이전엔 blueprint_samples 와 LEFT JOIN 으로
-- language 를 derive 했지만:
--   1) blueprint_samples 시드가 모두 language='ko' 라 영문 책도 ko 반환
--   2) source_sample_id 가 NULL 인 책 (legacy template path) 은 무조건 'ko'
--
-- 이제 user_books 가 자기 language 를 직접 저장. chapter/question API 가
-- 그 컬럼을 직접 읽어 단일 lang 키로 저장.
--
-- 실행: Neon SQL Editor 에서 이 SQL 직접 실행 (apply 스크립트 X — Tim 의 결정).
--
-- 적용 후 영문 책에서 새 챕터 추가 시 { en: "..." } 단일 키 저장 동작.
-- 단, sample-blueprints 시드가 ko 만 있어서 신규 영문 책 만들기는 별도 작업.
-- 기존 영문 책은 backfill 후 수동으로 UPDATE user_books SET language='en' WHERE id='...' 필요.

-- 1) 컬럼 추가 (nullable 로 시작 — backfill 한 다음에 NOT NULL)
ALTER TABLE user_books ADD COLUMN IF NOT EXISTS language TEXT;

-- 2) 기존 책 backfill — sample 기반은 sample.language, 없으면 'ko'
UPDATE user_books b
   SET language = COALESCE(
     (SELECT bs.language FROM blueprint_samples bs WHERE bs.id = b.source_sample_id),
     'ko'
   )
 WHERE language IS NULL;

-- 3) default + NOT NULL 강제 — 향후 INSERT 누락 방지
ALTER TABLE user_books ALTER COLUMN language SET DEFAULT 'ko';
ALTER TABLE user_books ALTER COLUMN language SET NOT NULL;

-- 4) (선택) language 별 책 카운트 인덱스 — 통계용. 현재 쿼리에선 안 쓰지만
--    향후 admin 화면 분석할 때 유용. 비용 작아서 추가.
CREATE INDEX IF NOT EXISTS idx_user_books_language
  ON user_books (language, last_active_at DESC);
