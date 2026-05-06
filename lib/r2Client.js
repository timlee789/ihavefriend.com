/**
 * Cloudflare R2 client wrapper for voice audio storage.
 * Used by /api/fragments/[id]/audio endpoint to upload/delete user voice
 * recordings, and to generate the public_token for QR-based family sharing.
 *
 * R2 is S3-compatible — we use @aws-sdk/client-s3 with R2's S3 API endpoint.
 *
 * ENV variables required (set in .env.local + Vercel):
 *   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT,
 *   R2_BUCKET, R2_PUBLIC_URL
 *
 * Part of Voice QR System Phase 1.
 * See experiments/100-voice-qr-system-phase-1.md §5.
 */
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { randomBytes } from 'crypto';

let _client = null;

/**
 * Singleton R2 S3Client. Lazy-initialized on first call.
 * Region 'auto' is required for R2 (R2 ignores region but the SDK demands one).
 */
export function getR2Client() {
  if (_client) return _client;
  _client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  return _client;
}

/**
 * Returns the R2 bucket name (default: 'sayandkeep-audio').
 */
export function getR2Bucket() {
  return process.env.R2_BUCKET || 'sayandkeep-audio';
}

/**
 * Builds the public URL for a given R2 object key.
 * Uses R2_PUBLIC_URL (Cloudflare's r2.dev URL or custom domain).
 */
export function getR2PublicUrl(key) {
  const base = process.env.R2_PUBLIC_URL;
  if (!base) {
    throw new Error('R2_PUBLIC_URL environment variable not set');
  }
  return `${base.replace(/\/$/, '')}/${key}`;
}

/**
 * Generates a 16-char URL-safe public token for /listen/[token] URLs.
 * 12 random bytes → ~16 base64url chars (62^16 ≈ 4.7e28 combinations).
 * Unguessable in practice.
 */
export function generatePublicToken() {
  return randomBytes(12).toString('base64url').slice(0, 16);
}

/**
 * Builds the R2 object key for a fragment's audio file.
 * Format: audios/u_{userId}/f_{fragmentId}/audio_{timestamp}.{ext}
 * Timestamp prevents collision when re-recording the same fragment
 * (we delete the old object before upload, but timestamp is a safety net).
 *
 * @param {number|string} userId - User.id (integer in our schema)
 * @param {string} fragmentId - StoryFragment.id (UUID)
 * @param {string} ext - File extension without dot (default: 'webm')
 */
export function makeAudioKey(userId, fragmentId, ext = 'webm') {
  return `audios/u_${userId}/f_${fragmentId}/audio_${Date.now()}.${ext}`;
}

/**
 * Uploads an audio Buffer to R2 under the given key.
 * Returns { key, url } where url is the public URL (assumes bucket
 * has Public Development URL enabled or custom domain configured).
 *
 * @param {Buffer|Uint8Array} buffer - Audio data
 * @param {string} key - R2 object key (use makeAudioKey())
 * @param {string} contentType - MIME type (default: 'audio/webm')
 * @returns {Promise<{key: string, url: string}>}
 */
export async function uploadAudio(buffer, key, contentType = 'audio/webm') {
  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return {
    key,
    url: getR2PublicUrl(key),
  };
}

/**
 * Deletes an R2 object by key. Idempotent (R2 returns success even if
 * the object doesn't exist).
 *
 * @param {string} key - R2 object key to delete
 */
export async function deleteAudio(key) {
  const client = getR2Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
    })
  );
}
