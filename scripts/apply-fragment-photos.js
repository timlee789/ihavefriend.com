#!/usr/bin/env node
/**
 * scripts/apply-fragment-photos.js  (Task 75)
 *
 * Creates the fragment_photos table that backs the photo-attachment
 * feature. Each fragment can carry up to 2 photos (display_order 1
 * and 2); ON DELETE CASCADE means deleting a fragment also wipes its
 * photo rows. The unique (fragment_id, display_order) index turns
 * "max 2 photos per fragment" into a DB-level invariant.
 *
 * The actual binary lives in Vercel Blob; we keep blob_url +
 * blob_pathname here so we can clean up the blob when the row goes.
 *
 * Idempotent.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/apply-fragment-photos.js
 */
const { neon } = require('@neondatabase/serverless');

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
  const sql = neon(url);

  console.log('▶ creating fragment_photos…');
  await sql`
    CREATE TABLE IF NOT EXISTS fragment_photos (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      fragment_id     UUID NOT NULL REFERENCES story_fragments(id) ON DELETE CASCADE,
      user_id         INT NOT NULL,
      blob_url        TEXT NOT NULL,
      blob_pathname   TEXT NOT NULL,
      width           INT,
      height          INT,
      size_bytes      BIGINT,
      mime_type       TEXT DEFAULT 'image/jpeg',
      caption         TEXT,
      display_order   SMALLINT NOT NULL DEFAULT 1 CHECK (display_order IN (1, 2)),
      uploaded_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_fragment_photos_fragment ON fragment_photos (fragment_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_fragment_photos_user     ON fragment_photos (user_id)`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_fragment_photos_slot
      ON fragment_photos (fragment_id, display_order)
  `;

  console.log('✅ fragment_photos schema applied');
})().catch(e => { console.error(e); process.exit(1); });
