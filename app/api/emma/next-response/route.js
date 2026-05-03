/**
 * GET /api/emma/next-response?sessionId=<uuid>
 *
 * Stage 3 consumer endpoint (Task 90). EmmaChat polls this after each
 * turn to find out whether the background analyze+decide pipeline
 * produced a guidance signal it should honor.
 *
 * Behavior:
 *   - Feature flag (EMMA_DECISION_ENGINE_ENABLED='true') gates the
 *     entire route. Default OFF — the endpoint always returns
 *     { decision: null } so EmmaChat falls back to the existing flow
 *     and zero production behavior changes until Tim flips the flag.
 *   - Returns the most recent UNCONSUMED decision for this session
 *     (consumed_at IS NULL), excluding rows older than STALE_MS so a
 *     late pipeline can't revive a stale guidance.
 *   - On hit: marks consumed_at = NOW() so subsequent calls return
 *     null (one-shot consumption per turn).
 *   - Always returns 200 with { decision: <obj>|null, ...meta }; the
 *     consumer code in EmmaChat treats null as "use the existing path".
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

const STALE_MS = 60_000; // 60s — anything older is treated as missed-the-bus

function isEnabled() {
  return process.env.EMMA_DECISION_ENGINE_ENABLED === 'true';
}

export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId');
  if (!sessionId) {
    return Response.json({ decision: null, error: 'sessionId required' }, { status: 400 });
  }

  if (!isEnabled()) {
    return Response.json({ decision: null, skipped: 'feature flag off' });
  }

  const db = createDb();
  try {
    // Pick the freshest unconsumed row that's still within the stale
    // window. The partial index idx_emma_decisions_unconsumed makes
    // this O(1) per session.
    const res = await db.query(
      `SELECT id, turn_number, action, suggested_response, decision,
              analysis_ms, decision_ms, created_at
         FROM emma_decisions
        WHERE session_id = $1
          AND user_id    = $2
          AND consumed_at IS NULL
          AND created_at > NOW() - INTERVAL '${Math.round(STALE_MS / 1000)} seconds'
        ORDER BY created_at DESC
        LIMIT 1`,
      [sessionId, user.id]
    );
    const row = res.rows[0];
    if (!row) {
      return Response.json({ decision: null });
    }

    // One-shot consumption — mark immediately so a retry doesn't
    // double-fire the same suggestion.
    try {
      await db.query(
        `UPDATE emma_decisions SET consumed_at = NOW() WHERE id = $1 AND consumed_at IS NULL`,
        [row.id]
      );
    } catch (e) {
      console.warn('[next-response] mark-consumed failed:', e.message);
    }

    return Response.json({
      decision: row.decision,
      meta: {
        id: row.id,
        turn_number: row.turn_number,
        action: row.action,
        suggested_response: row.suggested_response,
        analysis_ms: row.analysis_ms,
        decision_ms: row.decision_ms,
        created_at: row.created_at,
      },
    });
  } catch (e) {
    // Never fail noisily — EmmaChat treats this as "no guidance" and
    // falls back to its existing path.
    console.warn('[next-response]', e?.message || e);
    return Response.json({ decision: null, error: 'lookup failed' });
  }
}
