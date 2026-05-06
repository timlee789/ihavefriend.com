/**
 * POST /api/listen/[token]/played
 *
 * Public endpoint — no auth. Increments play_count and updates
 * last_played_at / first_played_at when family members start
 * playback on /listen/[token].
 *
 * Idempotency:
 *   - Multiple POSTs increment naively. The /listen page should
 *     call this exactly once per session (on first play). Refreshing
 *     and replaying counts as a new play, which is the intended
 *     behaviour for the "가족이 N번 들었어요" UI.
 *
 * Security:
 *   - Same is_public filter as GET. A flipped-private audio stops
 *     accepting analytics, even if the token is known.
 *   - No body required. Token in URL only.
 *
 * Voice QR System Phase 1 (Step 05).
 */
import { NextResponse } from 'next/server';
import { createDb } from '@/lib/db';

const MIN_TOKEN_LEN = 12;
const MAX_TOKEN_LEN = 20;

export async function POST(request, { params }) {
  const { token } = await params;

  if (!token || token.length < MIN_TOKEN_LEN || token.length > MAX_TOKEN_LEN) {
    return NextResponse.json({ error: 'invalid token' }, { status: 400 });
  }

  const db = createDb();

  try {
    const result = await db.query(
      `UPDATE fragment_audios
          SET play_count       = play_count + 1,
              last_played_at   = NOW(),
              first_played_at  = COALESCE(first_played_at, NOW())
        WHERE public_token = $1
          AND is_public    = TRUE
      RETURNING id`,
      [token]
    );

    if (result.rows.length === 0) {
      // Either token doesn't exist or audio was flipped private.
      // We return 404 to avoid leaking existence vs. visibility.
      return NextResponse.json({ ok: false }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[POST /api/listen/:token/played]', e.message);
    return NextResponse.json(
      { error: 'failed to record play' },
      { status: 500 }
    );
  }
}
