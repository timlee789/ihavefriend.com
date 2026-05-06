/**
 * GET /api/photobook-photo/[id]
 *
 * 🔥 2026-05-06 (Tim) — Photo proxy through our own domain.
 *
 * Why this exists:
 *   Same Chrome SafeBrowsing dev-URL block that affects audio also
 *   affects images loaded from `pub-*.r2.dev`. Tim reported images
 *   not rendering in /photobook/[id]/edit.
 *
 *   We proxy photos the same way as /api/audio/[token]: stream R2
 *   bytes through our domain so the browser doesn't see the dev URL.
 *
 * Auth model:
 *   No Bearer auth here. <img> elements can't carry an Authorization
 *   header on their automatic load, and we don't want to fall back to
 *   cookie auth just for image rendering.
 *
 *   Instead we rely on the photo's UUID as the bearer: UUIDv4 has
 *   ~122 bits of randomness (5e36 combinations), comparable to the
 *   audio public_token (16 base64url chars ≈ 96 bits). An attacker
 *   would need to guess the UUID to access the photo.
 *
 *   This matches how the audio proxy works (token-only, no Bearer)
 *   and lets the same pattern apply later for the family-side
 *   /listen page when we surface photobook pages there.
 *
 *   Caveat: photo UUIDs are visible in the editor's full-photobook
 *   GET response (which IS auth-protected). So in practice, only
 *   the owner ever sees these UUIDs. If a stranger somehow leaks the
 *   URL the photo is exposed — acceptable for beta, can tighten with
 *   a separate share_token + is_public model later if needed.
 */
import { createDb } from '@/lib/db';
import { getR2Client, getR2Bucket } from '@/lib/r2Client';
import { GetObjectCommand } from '@aws-sdk/client-s3';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const maxDuration = 30;

export async function GET(request, { params }) {
  const { id: photoId } = await params;

  if (!photoId || !UUID_RE.test(photoId)) {
    return new Response(JSON.stringify({ error: 'invalid id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = createDb();

  // Look up by id only — UUID is the access capability (see auth note).
  let row;
  try {
    const result = await db.query(
      `SELECT r2_key, mime_type
         FROM photobook_page_photos
        WHERE id = $1`,
      [photoId]
    );
    if (result.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    row = result.rows[0];
  } catch (e) {
    console.error('[GET /api/photobook-photo/:id] db lookup failed:', e?.message);
    return new Response(JSON.stringify({ error: 'lookup failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rangeHeader = request.headers.get('range') || null;

  let r2Response;
  try {
    const client = getR2Client();
    r2Response = await client.send(
      new GetObjectCommand({
        Bucket: getR2Bucket(),
        Key: row.r2_key,
        ...(rangeHeader ? { Range: rangeHeader } : {}),
      })
    );
  } catch (e) {
    console.error('[GET /api/photobook-photo/:id] R2 fetch failed:', e?.message);
    return new Response(JSON.stringify({ error: 'storage fetch failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const headers = new Headers({
    'Content-Type': row.mime_type || 'image/jpeg',
    // Aggressive cache — photo URL is id-based and never changes
    // (replace = new id). Public so CDN can cache.
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
  if (r2Response.ContentLength != null) {
    headers.set('Content-Length', String(r2Response.ContentLength));
  }
  if (r2Response.ContentRange) {
    headers.set('Content-Range', r2Response.ContentRange);
  }

  const status = rangeHeader && r2Response.ContentRange ? 206 : 200;
  return new Response(r2Response.Body, { status, headers });
}
