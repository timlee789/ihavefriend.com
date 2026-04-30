/**
 * PATCH /api/admin/quota/[id]
 * Body: { tier?: 'free'|'premium'|'unlimited', free_token_limit?: number, sync?: boolean }
 *
 * Admin-only. Bumping `free_token_limit` clears `quota_blocked_at` so
 * a user who was blocked re-enters /chat on their very next attempt.
 * `sync: true` recomputes lifetime_tokens_used from api_usage_logs.
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';
import { syncLifetimeUsage } from '@/lib/quotaCheck';

const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || '2')
  .split(',')
  .map(s => Number(s.trim()))
  .filter(Number.isFinite);

const ALLOWED_TIERS = new Set(['free', 'premium', 'unlimited']);

function isAdmin(user) {
  return user.role === 'admin' || ADMIN_USER_IDS.includes(user.id);
}

export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  if (!isAdmin(user)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const userId = Number(id);
  if (!Number.isFinite(userId)) {
    return Response.json({ error: 'invalid id' }, { status: 400 });
  }

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  const db = createDb();

  try {
    // Optional: just resync the cache from api_usage_logs and exit.
    if (body?.sync === true) {
      const used = await syncLifetimeUsage(db, userId);
      return Response.json({ ok: true, lifetime_tokens_used: used });
    }

    const sets = [];
    const vals = [];
    let i = 1;

    if (typeof body?.tier === 'string' && ALLOWED_TIERS.has(body.tier)) {
      sets.push(`tier = $${i++}`);
      vals.push(body.tier);
      // Promoting to premium/unlimited also clears any active block.
      if (body.tier !== 'free') sets.push(`quota_blocked_at = NULL`);
    }
    if (body?.free_token_limit !== undefined) {
      const lim = Number(body.free_token_limit);
      if (!Number.isFinite(lim) || lim < 0) {
        return Response.json({ error: 'free_token_limit must be a non-negative number' }, { status: 400 });
      }
      sets.push(`free_token_limit = $${i++}`);
      vals.push(lim);
      // Bumping the limit lifts the block — see header.
      sets.push(`quota_blocked_at = NULL`);
    }

    if (sets.length === 0) {
      return Response.json({ error: 'no fields to update' }, { status: 400 });
    }

    vals.push(userId);
    const sql = `UPDATE "User" SET ${sets.join(', ')} WHERE id = $${i}
                 RETURNING id, tier, free_token_limit, lifetime_tokens_used, quota_blocked_at`;
    const r = await db.query(sql, vals);
    if (r.rows.length === 0) {
      return Response.json({ error: 'user not found' }, { status: 404 });
    }
    return Response.json({ ok: true, user: r.rows[0] });
  } catch (e) {
    console.error('[PATCH /api/admin/quota/[id]]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
