/**
 * GET /api/audio/[token]
 *
 * 🔥 2026-05-06 (Tim) — Audio proxy through our own domain.
 *
 * Why this exists:
 *   Chrome's UrlSafetyCheck (SafeBrowsing) rejects media loads directly
 *   from `pub-{random}.r2.dev` URLs. These are Cloudflare's dev URLs,
 *   widely abused by phishing/malware hosters, so Chrome blocks them
 *   for media even when the file is innocent. The user sees:
 *     "MEDIA_ELEMENT_ERROR: Media load rejected by URL safety check"
 *   and the audio player reports duration=NaN, readyState=0.
 *
 *   By streaming the audio through *our* domain (sayandkeep.com), we
 *   bypass the dev-URL block entirely. As a side benefit:
 *     - R2 credentials stay server-side (we could make the bucket
 *       private later)
 *     - we control caching/headers
 *     - Range request support is consistent across browsers
 *
 * Public endpoint — no auth. Uses public_token as the bearer.
 *   Token is 16-char base64url (62^16 ≈ 4.7e28); unguessable.
 *   Filters by is_public=TRUE so private audio is invisible.
 *
 * Range support:
 *   <audio controls> issues HEAD-like range requests for seek bar
 *   metadata (`Range: bytes=0-`). We forward the Range header to R2
 *   (S3 GetObject Range param) and return 206 Partial Content with the
 *   correct Content-Range/Content-Length so seeking works.
 *
 * Related: /api/listen/[token] (Step 05) returns metadata; this endpoint
 *   serves the actual audio bytes.
 */
import { createDb } from '@/lib/db';
import { getAudio } from '@/lib/r2Client';

const MIN_TOKEN_LEN = 12;
const MAX_TOKEN_LEN = 20;

export const maxDuration = 60; // streaming may take a moment for slow clients

export async function GET(request, { params }) {
  const { token } = await params;

  if (!token || token.length < MIN_TOKEN_LEN || token.length > MAX_TOKEN_LEN) {
    return new Response(JSON.stringify({ error: 'invalid token' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = createDb();

  // Look up the audio row by public_token. is_public=TRUE filter is
  // critical: a user toggling sharing OFF must immediately stop family
  // playback even on cached QR scans.
  //
  // 🔥 2026-05-06 (Photobook v3 P5) — search both audio tables. token
  //   is UNIQUE in each, so at most one row across the union matches.
  //   Done as two separate queries (clearer than UNION ALL with LIMIT,
  //   which has parsing edge cases across PG versions); the second
  //   query only runs if the first misses.
  let row;
  try {
    const fragQ = await db.query(
      `SELECT r2_key, mime_type, size_bytes
         FROM fragment_audios
        WHERE public_token = $1
          AND is_public    = TRUE
        LIMIT 1`,
      [token]
    );
    if (fragQ.rows.length > 0) {
      row = fragQ.rows[0];
    } else {
      const pbQ = await db.query(
        `SELECT r2_key, mime_type, size_bytes
           FROM photobook_page_audios
          WHERE public_token = $1
            AND is_public    = TRUE
          LIMIT 1`,
        [token]
      );
      if (pbQ.rows.length > 0) {
        row = pbQ.rows[0];
      } else {
        return new Response(JSON.stringify({ error: 'not found or not public' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
  } catch (e) {
    console.error('[GET /api/audio/:token] db lookup failed:', e?.message);
    return new Response(JSON.stringify({ error: 'lookup failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Forward Range header to R2 if present so audio seek works.
  const rangeHeader = request.headers.get('range') || null;

  let r2Response;
  try {
    r2Response = await getAudio(row.r2_key, rangeHeader);
  } catch (e) {
    console.error('[GET /api/audio/:token] R2 fetch failed:', e?.message);
    return new Response(JSON.stringify({ error: 'storage fetch failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Build response headers from R2 metadata. Content-Type from DB is
  // authoritative (R2 sometimes returns generic types).
  const headers = new Headers({
    'Content-Type': row.mime_type || 'audio/webm',
    'Accept-Ranges': 'bytes',
    // Cache the audio for 1 hour at the edge. is_public toggle changes
    // are eventually consistent for QR scanners — acceptable trade-off
    // since toggling OFF is rare and the next scan will hit the 404
    // path within an hour.
    'Cache-Control': 'public, max-age=3600',
  });

  if (r2Response.ContentLength != null) {
    headers.set('Content-Length', String(r2Response.ContentLength));
  }
  if (r2Response.ContentRange) {
    headers.set('Content-Range', r2Response.ContentRange);
  }

  // Status: 206 if R2 returned a partial (Range request), 200 otherwise.
  const status = rangeHeader && r2Response.ContentRange ? 206 : 200;

  // r2Response.Body is a Web Streams ReadableStream in the v3 SDK on
  // Node 18+. Pass through directly to the Next response.
  return new Response(r2Response.Body, {
    status,
    headers,
  });
}
