-- Migration 010: Add conversation_mode to chat_sessions
-- Values: 'auto' (default), 'companion', 'story'
ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS conversation_mode TEXT NOT NULL DEFAULT 'auto';
