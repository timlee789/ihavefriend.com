/**
 * PATCH /api/admin/tier-defaults/[tier]  (Sprint 2j V2, 2026-05-11)
 *
 * Admin-only — update the per-tier default quotas (table tier_defaults).
 * Every quota field is independently optional. Update takes effect
 * immediately for all users on that tier who don't have a personal
 * override (NULL on user_limits) for that field.
 *
 * Body shape (all optional):
 *   {
 *     daily_minutes?: number,
 *     monthly_minutes?: number,
 *     max_fragments?: number,
 *     max_photos?: number,
 *     max_books?: number,
 *     allow_pdf?: boolean,
 *     allow_audio_qr?: boolean,
 *     allow_sharing?: boolean,
 *     data_retention_days?: number,
 *   }
 *
 * Auth: same admin gate as /api/admin/quota (role='admin' or ADMIN_USER_IDS).
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

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

  const { tier } = await params;
  if (!ALLOWED_TIERS.has(tier)) {
    return Response.json({ error: 'invalid tier' }, { status: 400 });
  }

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  const NUMERIC = [
    'daily_minutes', 'monthly_minutes',
    'max_fragments', 'max_photos', 'max_books',
    'data_retention_days',
  ];
  const BOOL = ['allow_pdf', 'allow_audio_qr', 'allow_sharing'];

  const sets = [];
  const vals = [];
  let i = 1;

  for (const key of NUMERIC) {
    if (!(key in (body || {}))) continue;
    const val = Number(body[key]);
    if (!Number.isFinite(val) || val < 0) {
      return Response.json({ error: `${key} must be non-negative number` }, { status: 400 });
    }
    sets.push(`${key} = $${i++}`);
    vals.push(val);
  }
  for (const key of BOOL) {
    if (!(key in (body || {}))) continue;
    sets.push(`${key} = $${i++}`);
    vals.push(Boolean(body[key]));
  }

  if (sets.length === 0) {
    return Response.json({ error: 'no fields to update' }, { status: 400 });
  }

  sets.push(`updated_at = NOW()`);
  vals.push(tier);

  const db = createDb();
  try {
    const r = await db.query(
      `UPDATE tier_defaults SET ${sets.join(', ')} WHERE tier = $${i} RETURNING *`,
      vals
    );
    if (r.rows.length === 0) {
      return Response.json({ error: 'tier_defaults row not found — run apply-tier-defaults.js first' }, { status: 404 });
    }
    console.log(`[PATCH /api/admin/tier-defaults/${tier}] admin=${user.id} updated [${Object.keys(body).join(',')}]`);
    return Response.json({ ok: true, tier_defaults: r.rows[0] });
  } catch (e) {
    console.error(`[PATCH /api/admin/tier-defaults/${tier}]`, e?.message);
    return Response.json({ error: e?.message }, { status: 500 });
  }
}
