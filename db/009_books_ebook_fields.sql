-- Migration 009: Expand books table for ebook request flow
-- + output_data TEXT (base64 PDF from 5090 runner)
-- + fragment_ids JSONB (which fragments are included)
-- + auto_preface / auto_epilogue BOOLEAN flags
-- + Expand books.status CHECK to include 'pending' and 'review'
-- + Expand fragment_generation_queue.job_type to include 'generate_pdf'

ALTER TABLE books
  ADD COLUMN IF NOT EXISTS output_data  TEXT,
  ADD COLUMN IF NOT EXISTS fragment_ids JSONB   NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS auto_preface BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_epilogue BOOLEAN NOT NULL DEFAULT true;

-- Expand books.status constraint
ALTER TABLE books DROP CONSTRAINT IF EXISTS books_status_check;
ALTER TABLE books ADD CONSTRAINT books_status_check
  CHECK (status IN ('draft', 'pending', 'generating', 'review', 'completed', 'published'));

-- Expand queue job_type constraint
ALTER TABLE fragment_generation_queue DROP CONSTRAINT IF EXISTS fragment_generation_queue_job_type_check;
ALTER TABLE fragment_generation_queue ADD CONSTRAINT fgq_job_type_check
  CHECK (job_type IN (
    'generate_fragment', 'tag_fragment', 'cluster_fragments',
    'generate_story', 'rewrite_fragment', 'voice_profile_update',
    'fact_check', 'generate_pdf'
  ));
