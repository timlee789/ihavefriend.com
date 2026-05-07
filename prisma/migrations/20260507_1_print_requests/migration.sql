-- Photobook v3 R2: 인쇄 신청 (Print Request) 테이블
--
-- Tim 결정 (2026-05-07): "모든 책 오더는 수동으로 오더 하는 것을 원칙."
-- 사용자 "인쇄 신청" → Tim 이메일 알림 → Tim 검수 → 수동 발주.
--
-- Strategy: STRATEGY-photobook-r2-print-request-2026-05-07.md §2.1, §1.6
--
-- status 6단계 (수동 진행):
--   submitted → reviewing → ordered → shipped → delivered
--   cancelled (어디서든 가능)
-- 베타엔 Tim 이 DB 직접 status 업데이트. 미래엔 Lulu API webhook.
--
-- 모든 DDL idempotent (IF NOT EXISTS) — 재실행 안전.

CREATE TABLE IF NOT EXISTS print_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         INT  NOT NULL REFERENCES "User"(id),
  user_book_id    UUID NOT NULL REFERENCES user_books(id),

  -- 배송 정보 (사용자 신청 시 입력)
  recipient_name        TEXT NOT NULL,
  recipient_phone       TEXT,
  shipping_address      TEXT NOT NULL,
  shipping_city         TEXT,
  shipping_state        TEXT,
  shipping_postal       TEXT,
  shipping_country      TEXT NOT NULL DEFAULT 'US',
  message_to_recipient  TEXT,

  -- 상태 추적
  status                TEXT NOT NULL DEFAULT 'submitted',

  -- Tim 의 검수 메모 (베타엔 수동, 미래 자동)
  vendor                TEXT,
  vendor_order_id       TEXT,
  cost_usd              DECIMAL(10, 2),
  tim_notes             TEXT,

  -- 메타
  pdf_size_bytes        INT,
  page_count            INT,

  -- 알림 추적
  email_sent_to_tim     BOOLEAN NOT NULL DEFAULT FALSE,
  email_sent_at         TIMESTAMPTZ,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_print_requests_user
  ON print_requests(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_print_requests_status
  ON print_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_print_requests_user_book
  ON print_requests(user_book_id);

COMMENT ON COLUMN print_requests.status IS
  'submitted | reviewing | ordered | shipped | delivered | cancelled. 베타엔 Tim 수동 업데이트, 미래 Lulu webhook 자동.';

COMMENT ON COLUMN print_requests.vendor IS
  'lulu | blurb | etc. NULL = 아직 발주 전.';

COMMENT ON COLUMN print_requests.email_sent_to_tim IS
  'TRUE = Resend API 가 ADMIN_EMAIL 로 이메일 보냄. FALSE = best-effort 실패. Tim 이 DB 직접 모니터링 fallback.';

-- updated_at 자동 갱신 trigger (다른 photobook 테이블과 동일 패턴)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_print_requests_updated_at ON print_requests;
CREATE TRIGGER trg_print_requests_updated_at
  BEFORE UPDATE ON print_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
