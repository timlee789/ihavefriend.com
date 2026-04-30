/**
 * lib/quotaCheck.js — Token Quota gate (Task 66).
 *
 * The Prisma "User" table now carries 4 quota columns:
 *   tier                  : 'free' | 'premium' | 'unlimited' (default 'free')
 *   free_token_limit      : BIGINT (default 100000, admin-tunable)
 *   lifetime_tokens_used  : BIGINT (cache, kept in sync by apiUsage.logApiUsage)
 *   quota_blocked_at      : TIMESTAMPTZ — first time the user crossed the limit
 *
 * checkQuota(db, userId)  →  { tier, used, limit, remaining, blocked, response? }
 *
 * Call from every LLM-touching entrypoint right after requireAuth():
 *
 *   const { user, error } = await requireAuth(request);
 *   if (error) return error;
 *   const db = createDb();
 *   const quota = await checkQuota(db, user.id);
 *   if (quota.blocked) return Response.json(quota.response, { status: 402 });
 *
 * Decisions baked in (Tim 2026-04-29):
 *   • Lifetime quota — no monthly reset.
 *   • Senior never sees the limit number; the block message is framed
 *     as "service launching soon" so it feels intentional, not a
 *     rationing error.
 *   • If the SELECT itself fails we fail OPEN (allow the request) so
 *     a transient DB blip never traps a paying senior mid-conversation.
 */

const TAG = '[quota]';

const DEFAULT_FREE_LIMIT = parseInt(process.env.FREE_TOKEN_LIMIT || '100000', 10);

async function checkQuota(db, userId) {
  if (!userId) {
    return { blocked: false, tier: 'free', used: 0, limit: DEFAULT_FREE_LIMIT, remaining: DEFAULT_FREE_LIMIT };
  }
  try {
    const result = await db.query(
      `SELECT tier, free_token_limit, lifetime_tokens_used, quota_blocked_at
         FROM "User" WHERE id = $1`,
      [userId]
    );
    if (result.rows.length === 0) {
      return { blocked: false, tier: 'free', used: 0, limit: DEFAULT_FREE_LIMIT, remaining: DEFAULT_FREE_LIMIT };
    }
    const row = result.rows[0];
    const tier  = row.tier || 'free';
    const limit = Number(row.free_token_limit ?? DEFAULT_FREE_LIMIT);
    const used  = Number(row.lifetime_tokens_used ?? 0);

    if (tier === 'unlimited' || tier === 'premium') {
      return { blocked: false, tier, used, limit, remaining: -1 };
    }

    const remaining = Math.max(0, limit - used);
    if (used >= limit) {
      // Stamp the first-block timestamp once; admin "limit bump" path
      // clears it (see app/api/admin/quota/[id]/route.js).
      if (!row.quota_blocked_at) {
        try {
          await db.query(`UPDATE "User" SET quota_blocked_at = NOW() WHERE id = $1`, [userId]);
        } catch (e) {
          console.warn(`${TAG} stamp quota_blocked_at failed:`, e?.message);
        }
      }
      console.log(`${TAG} BLOCKED user=${userId} used=${used} limit=${limit}`);
      return {
        blocked: true,
        tier,
        used,
        limit,
        remaining: 0,
        response: {
          error: 'quota_exceeded',
          launching_soon: true,
          message_ko: '체험 사용량을 다 쓰셨어요. 정식 서비스가 곧 출시될 예정이에요.',
          message_en: 'You have used your trial allowance. The full service is launching soon.',
          message_es: 'Has usado tu cuota de prueba. El servicio completo se lanza pronto.',
        },
      };
    }
    return { blocked: false, tier, used, limit, remaining };
  } catch (e) {
    // Fail open — see file header.
    console.error(`${TAG} check failed user=${userId}:`, e?.message);
    return { blocked: false, tier: 'free', used: 0, limit: DEFAULT_FREE_LIMIT, remaining: DEFAULT_FREE_LIMIT, error: e?.message };
  }
}

/**
 * Recompute lifetime_tokens_used from api_usage_logs SUM. Used by the
 * admin page's "Sync" affordance and by the one-shot migration script.
 */
async function syncLifetimeUsage(db, userId) {
  try {
    const result = await db.query(
      `UPDATE "User"
          SET lifetime_tokens_used = COALESCE((
            SELECT SUM(total_tokens) FROM api_usage_logs WHERE user_id = $1
          ), 0)
        WHERE id = $1
        RETURNING lifetime_tokens_used`,
      [userId]
    );
    return Number(result.rows[0]?.lifetime_tokens_used || 0);
  } catch (e) {
    console.error(`${TAG} sync failed user=${userId}:`, e?.message);
    return null;
  }
}

module.exports = { checkQuota, syncLifetimeUsage, DEFAULT_FREE_LIMIT };
