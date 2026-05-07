-- Photobook v3 R0: 사진 원본 R2 보존
--
-- Tim 결정 (2026-05-06):
--   "이 원본 PDF 의 quality 가 책의 Quality 가 되는 것이니까요"
--   → 인쇄 품질 보장을 위해 원본 사진을 R2 에 보존
--
-- Strategy: STRATEGY-photobook-r0-original-photo-storage-2026-05-06.md
--
-- 패턴:
--   - 기존 r2_key, r2_url, width, height, size_bytes, mime_type 는 압축본
--     (display 용, 1920px JPEG 80%) 그대로 유지 — 기존 코드 깨지지 않음
--   - 새 컬럼은 모두 NULLable — 베타 시작 전에 만들었던 사진은 원본 없음
--   - 미래 자서전 마이그레이션 시 fragment_photos 에도 동일 패턴 적용
--   - 원본 R2 key 조회는 PDF 생성 시점에만 필요 (rare path) → 추가 인덱스 불필요
--
-- 모든 ALTER 가 IF NOT EXISTS — 재실행 안전.

ALTER TABLE photobook_page_photos
  ADD COLUMN IF NOT EXISTS r2_key_original     TEXT,
  ADD COLUMN IF NOT EXISTS r2_url_original     TEXT,
  ADD COLUMN IF NOT EXISTS original_width      INT,
  ADD COLUMN IF NOT EXISTS original_height     INT,
  ADD COLUMN IF NOT EXISTS original_size_bytes INT,
  ADD COLUMN IF NOT EXISTS original_mime_type  TEXT;

COMMENT ON COLUMN photobook_page_photos.r2_key_original IS
  'R2 object key for the high-resolution original (for print PDF). NULL = no original stored (legacy or upload failure).';

COMMENT ON COLUMN photobook_page_photos.r2_url_original IS
  'Public URL of the original. Display path still uses r2_url (compressed).';

COMMENT ON COLUMN photobook_page_photos.original_width IS
  'Pixel width of the original. Used by PDF generator to verify print resolution adequacy (300 DPI check).';

COMMENT ON COLUMN photobook_page_photos.original_height IS
  'Pixel height of the original.';

COMMENT ON COLUMN photobook_page_photos.original_size_bytes IS
  'Size of the original on R2 (for storage cost monitoring + UX warnings if >X MB).';

COMMENT ON COLUMN photobook_page_photos.original_mime_type IS
  'Original MIME type (always image/jpeg in R0; HEIC is converted client-side via canvas).';
