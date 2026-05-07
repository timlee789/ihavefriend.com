#!/usr/bin/env node
/**
 * scripts/r1c-measure.js — R1c performance verification
 *
 * Builds fixture photobooks at 5 / 30 / 60 pages by cloning real
 * photobook_page_photos rows from an existing book (so R2 keys point
 * at real photos and R2 fetches happen for real). Then calls the
 * /api/photobooks/[id]/pdf endpoint and reports time + size + memory.
 *
 * Cleanup: drops the fixture books at the end so DB stays clean.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/r1c-measure.js
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), override: true });

const { Pool } = require('@neondatabase/serverless');
const jwt = require('jsonwebtoken');

const USER_ID = 3;
const SOURCE_BOOK_ID = '2a801e2b-e9d1-41c4-8f8c-54bc84542bb2'; // Tim's "Test 앨범"
const SCENARIOS = [5, 30, 60];

const PORT = 3000;
const SECRET = 'companionai-jwt-secret-change-in-production-2024';

const token = jwt.sign({ userId: USER_ID }, SECRET, { expiresIn: '1h' });

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  const created = []; // book ids to clean up

  try {
    // Get a known good photo's R2 keys (compressed, original where present)
    // from the source book to clone N times.
    const photoQ = await client.query(
      `SELECT pp.r2_key, pp.r2_key_original, pp.r2_url, pp.r2_url_original,
              pp.width, pp.height, pp.size_bytes, pp.mime_type,
              pp.original_width, pp.original_height,
              pp.original_size_bytes, pp.original_mime_type
         FROM photobook_page_photos pp
         JOIN photobook_pages pg ON pg.id = pp.page_id
        WHERE pg.user_book_id = $1
        ORDER BY pg.page_number ASC
        LIMIT 1`,
      [SOURCE_BOOK_ID]
    );
    if (photoQ.rows.length === 0) {
      throw new Error('source book has no photos to clone');
    }
    const seedPhoto = photoQ.rows[0];
    console.log(
      `🌱 seed photo r2_key=${seedPhoto.r2_key.slice(-30)} ` +
      `(original=${seedPhoto.r2_key_original ? 'yes' : 'no'})`
    );

    // Get an existing audio (with valid token) to clone too. Each cloned
    // page needs its own public_token (UNIQUE), so we generate fresh ones.
    const audioQ = await client.query(
      `SELECT pa.r2_key, pa.r2_url, pa.duration_sec, pa.size_bytes,
              pa.mime_type, pa.whisper_text
         FROM photobook_page_audios pa
         JOIN photobook_pages pg ON pg.id = pa.page_id
        ORDER BY pa.created_at DESC
        LIMIT 1`
    );
    const seedAudio = audioQ.rows[0] || null;
    console.log(`🌱 seed audio: ${seedAudio ? 'present' : 'none, no QR codes will render'}`);

    for (const N of SCENARIOS) {
      console.log(`\n━━━ ${N} pages ━━━`);
      // 1. Create the photobook
      const bookR = await client.query(
        `INSERT INTO user_books (user_id, title, subtitle, book_type, status, structure)
         VALUES ($1, $2, $3, 'photobook', 'active', '{}'::jsonb)
         RETURNING id`,
        [USER_ID, `R1c verify (${N}p)`, `Performance fixture, ${N} pages`]
      );
      const bookId = bookR.rows[0].id;
      created.push(bookId);

      // 2. Insert N pages + photo per page + audio per page
      const pageInserts = [];
      for (let i = 1; i <= N; i++) {
        pageInserts.push(client.query(
          `INSERT INTO photobook_pages
             (user_book_id, page_number, page_title, caption)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [
            bookId,
            i,
            i % 5 === 0 ? `${i}번째 추억` : null,
            `이 사진은 ${i}번째 페이지의 캡션입니다. 한글 텍스트가 ` +
            `정상적으로 렌더링되는지 확인하기 위한 임의의 문장이며, ` +
            `Lulu 와 Blurb 인쇄 검증 직전 마지막 단계입니다.`,
          ]
        ));
      }
      const pages = (await Promise.all(pageInserts)).map(r => r.rows[0].id);

      // Photos — every page gets the seed photo (clones the same R2 keys
      // so we exercise the prefetchPhotoBuffers parallel R2 fetch path).
      const photoInserts = pages.map((pageId, idx) => client.query(
        `INSERT INTO photobook_page_photos
           (page_id, r2_key, r2_url, width, height, size_bytes, mime_type,
            r2_key_original, r2_url_original,
            original_width, original_height,
            original_size_bytes, original_mime_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          pageId,
          seedPhoto.r2_key,
          seedPhoto.r2_url,
          seedPhoto.width,
          seedPhoto.height,
          seedPhoto.size_bytes,
          seedPhoto.mime_type,
          seedPhoto.r2_key_original,
          seedPhoto.r2_url_original,
          seedPhoto.original_width,
          seedPhoto.original_height,
          seedPhoto.original_size_bytes,
          seedPhoto.original_mime_type,
        ]
      ));
      await Promise.all(photoInserts);

      // Audio — every 3rd page gets audio so QR rendering is exercised
      // but not over-counted (we don't need 60 audio rows, just enough
      // to measure QR.toBuffer in parallel).
      if (seedAudio) {
        const audioInserts = pages
          .filter((_, i) => i % 3 === 0)
          .map(pageId => client.query(
            `INSERT INTO photobook_page_audios
               (page_id, user_id, r2_key, r2_url, duration_sec, size_bytes,
                mime_type, whisper_text, public_token, is_public)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)`,
            [
              pageId,
              USER_ID,
              seedAudio.r2_key,
              seedAudio.r2_url,
              seedAudio.duration_sec,
              seedAudio.size_bytes,
              seedAudio.mime_type,
              seedAudio.whisper_text,
              `r1c_${pageId.slice(0, 12)}`,
            ]
          ));
        await Promise.all(audioInserts);
      }

      // 3. Hit the endpoint and measure
      const url = `http://localhost:${PORT}/api/photobooks/${bookId}/pdf`;
      const t0 = Date.now();
      const memBefore = process.memoryUsage().rss;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const buf = Buffer.from(await res.arrayBuffer());
      const elapsed = Date.now() - t0;
      const memAfter = process.memoryUsage().rss;

      console.log(`  status:    ${res.status}`);
      console.log(`  PDF size:  ${(buf.length / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  time:      ${(elapsed / 1000).toFixed(2)}s`);
      console.log(`  client memory delta: ${((memAfter - memBefore) / 1024 / 1024).toFixed(1)} MB (caller-side)`);

      // Save the largest one for visual inspection
      if (N === 60 || N === 30 || N === 5) {
        const out = `/tmp/r1c-${N}p.pdf`;
        fs.writeFileSync(out, buf);
        console.log(`  wrote ${out}`);
      }

      if (res.status !== 200) {
        console.error(`  ❌ non-200: ${buf.toString().slice(0, 300)}`);
      }
    }

    console.log('\n✅ measurements done');
  } finally {
    // Cleanup fixtures
    for (const bookId of created) {
      try {
        await client.query(`DELETE FROM user_books WHERE id = $1 AND user_id = $2`, [bookId, USER_ID]);
        console.log(`🧹 cleaned ${bookId}`);
      } catch (e) {
        console.warn(`   cleanup failed for ${bookId}: ${e?.message}`);
      }
    }
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error('❌', e?.message); console.error(e?.stack); process.exit(1); });
