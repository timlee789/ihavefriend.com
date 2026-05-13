/**
 * PATCH /api/admin/quota/[id]
 * Body: {
 *   tier?: 'free'|'premium'|'unlimited',
 *   free_token_limit?: number,
 *   sync?: boolean,
 *   // 🔥 Sprint 2j V2 (2026-05-11) — per-user overrides on user_limits.
 *   //   Pass null to clear (revert to tier default), omit to leave alone.
 *   daily_minutes?: number|null,
 *   monthly_minutes?: number|null,
 *   max_fragments?: number|null,
 *   max_photos?: number|null,
 *   max_books?: number|null,
 *   allow_pdf?: boolean|null,
 *   allow_audio_qr?: boolean|null,
 *   allow_sharing?: boolean|null,
 *   data_retention_days?: number|null,
 * }
 *
 * Admin-only. Bumping `free_token_limit` clears `quota_blocked_at` so
 * a user who was blocked re-enters /chat on their very next attempt.
 * `sync: true` recomputes lifetime_tokens_used from api_usage_logs.
 *
 * tier + free_token_limit live on User table (existing).
 * Sprint 2j overrides live on user_limits table (new columns).
 * Both updated in one transaction if both present.
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

    // 🔥 Sprint 2j V2 — per-user overrides on user_limits. Each field is
    //   independently optional (omit = leave alone, explicit null = clear
    //   override → fall back to tier default). Upsert pattern because
    //   user_limits row may not exist for newly-signed-up users.
    const NUMERIC_OVERRIDES = [
      'daily_minutes', 'monthly_minutes',
      'max_fragments', 'max_photos', 'max_books',
      'data_retention_days',
    ];
    // Sprint 2V — allow_book_print 추가 (Lulu 인쇄 발주 gate).
    const BOOL_OVERRIDES = ['allow_pdf', 'allow_audio_qr', 'allow_sharing', 'allow_book_print'];

    const overrideSets = [];
    const overrideVals = [];
    const insertColumns = [];
    const insertVals = [];
    let oi = 1;
    for (const key of NUMERIC_OVERRIDES) {
      if (!(key in (body || {}))) continue;
      const raw = body[key];
      const val = raw === null || raw === '' ? null : Number(raw);
      if (val !== null && (!Number.isFinite(val) || val < 0)) {
        return Response.json({ error: `${key} must be non-negative number or null` }, { status: 400 });
      }
      overrideSets.push(`${key} = $${oi}`);
      overrideVals.push(val);
      insertColumns.push(key);
      insertVals.push(`$${oi}`);
      oi++;
    }
    for (const key of BOOL_OVERRIDES) {
      if (!(key in (body || {}))) continue;
      const raw = body[key];
      const val = raw === null ? null : Boolean(raw);
      overrideSets.push(`${key} = $${oi}`);
      overrideVals.push(val);
      insertColumns.push(key);
      insertVals.push(`$${oi}`);
      oi++;
    }

    if (sets.length === 0 && overrideSets.length === 0) {
      return Response.json({ error: 'no fields to update' }, { status: 400 });
    }

    let userRow = null;
    if (sets.length > 0) {
      vals.push(userId);
      const sql = `UPDATE "User" SET ${sets.join(', ')} WHERE id = $${i}
                   RETURNING id, tier, free_token_limit, lifetime_tokens_used, quota_blocked_at`;
      const r = await db.query(sql, vals);
      if (r.rows.length === 0) {
        return Response.json({ error: 'user not found' }, { status: 404 });
      }
      userRow = r.rows[0];
    }

    let limitsRow = null;
    if (overrideSets.length > 0) {
      // Upsert: INSERT … ON CONFLICT (user_id) DO UPDATE.
      //   user_limits.user_id is PK so this is straightforward.
      //   On INSERT (new row), only the supplied columns get values; rest
      //   take their schema defaults (existing daily_minutes default 30 etc.)
      //   or NULL (new override columns).
      overrideVals.push(userId);
      const upsertSql = `
        INSERT INTO user_limits (user_id, ${insertColumns.join(', ')})
        VALUES ($${oi}, ${insertVals.join(', ')})
        ON CONFLICT (user_id) DO UPDATE SET ${overrideSets.join(', ')}
        RETURNING user_id, daily_minutes, monthly_minutes,
                  max_fragments, max_photos, max_books,
                  allow_pdf, allow_audio_qr, allow_sharing, allow_book_print,
                  data_retention_days
      `;
      const r = await db.query(upsertSql, overrideVals);
      limitsRow = r.rows[0] || null;
    }

    return Response.json({ ok: true, user: userRow, limits: limitsRow });
  } catch (e) {
    console.error('[PATCH /api/admin/quota/[id]]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
