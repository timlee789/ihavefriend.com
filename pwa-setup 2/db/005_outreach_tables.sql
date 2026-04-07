-- ============================================================
-- Daily Outreach Support Tables
-- Run after other memory engine tables
-- ============================================================

-- Add phone column to User table (if not exists)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

-- Outreach log — tracks every message Emma sends
CREATE TABLE IF NOT EXISTS outreach_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  message_type VARCHAR(20) NOT NULL,
  message_text TEXT NOT NULL,
  channel VARCHAR(10) DEFAULT 'sms',
  sent BOOLEAN DEFAULT false,
  user_replied BOOLEAN DEFAULT false,
  replied_at TIMESTAMP WITH TIME ZONE,
  sent_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outreach_user ON outreach_log(user_id, sent_date);
CREATE INDEX IF NOT EXISTS idx_outreach_date ON outreach_log(sent_date);

-- SMS inbound log — when user replies to Emma's text
CREATE TABLE IF NOT EXISTS sms_inbound (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_phone VARCHAR(20) NOT NULL,
  user_id INTEGER REFERENCES "User"(id),
  body TEXT NOT NULL,
  twilio_sid VARCHAR(50),
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_inbound_user ON sms_inbound(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_inbound_unprocessed ON sms_inbound(processed) WHERE processed = false;
