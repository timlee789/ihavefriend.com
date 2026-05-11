/**
 * GET /api/user/quotas  (Sprint 2j V2, 2026-05-11)
 *
 * Returns the authenticated user's effective quotas + current counts.
 * Used by the Frontend TrialBadge / QuotaModal / useUserPlan hook to
 * show "🌱 Trial — 7분 남음 · 이야기 2/5" etc.
 *
 * Response shape:
 *   {
 *     tier: 'free' | 'premium' | 'unlimited',
 *     quotas: { dailyMinutes, monthlyMinutes, maxFragments, maxPhotos,
 *               maxBooks, allowPdf, allowAudioQr, allowSharing,
 *               dataRetentionDays },
 *     counts: { fragments, photos, memoirBooks, photobooks,
 *               todayMinutes, monthMinutes }
 *   }
 *
 * Note: counts are owner-scoped (user_id = current user). Raw SQL via
 * createDb() to match the rest of the quota infra.
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';
import { getUserQuotas } from '@/lib/quotas';

export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const db = createDb();

  try {
    const quotas = await getUserQuotas(user.id);

    // Today's date in YYYY-MM-DD (UsageLog.session_date matches this format).
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm   = String(today.getMonth() + 1).padStart(2, '0');
    const dd   = String(today.getDate()).padStart(2, '0');
    const todayStr  = `${yyyy}-${mm}-${dd}`;
    const monthPref = `${yyyy}-${mm}-%`;

    // Single round-trip — six counts in parallel via Promise.all.
    const [fragRes, photoRes, memoirRes, photobookRes, todayMinRes, monthMinRes] =
      await Promise.all([
        // Root fragments only (continuations don't count).
        db.query(
          `SELECT COUNT(*)::int AS n FROM story_fragments
            WHERE user_id = $1 AND parent_fragment_id IS NULL`,
          [user.id]
        ),
        db.query(
          `SELECT COUNT(*)::int AS n
             FROM photobook_photos pp
             JOIN photobook_pages  pg ON pg.id = pp.page_id
             JOIN user_books       ub ON ub.id = pg.book_id
            WHERE ub.user_id = $1`,
          [user.id]
        ),
        db.query(
          `SELECT COUNT(*)::int AS n FROM user_books
            WHERE user_id = $1 AND template_category = 'memoir'`,
          [user.id]
        ),
        db.query(
          `SELECT COUNT(*)::int AS n FROM user_books
            WHERE user_id = $1 AND book_type = 'photobook'`,
          [user.id]
        ),
        db.query(
          `SELECT COALESCE(SUM("minutesUsed"), 0)::float AS m FROM "UsageLog"
            WHERE "userId" = $1 AND "sessionDate" = $2`,
          [user.id, todayStr]
        ),
        db.query(
          `SELECT COALESCE(SUM("minutesUsed"), 0)::float AS m FROM "UsageLog"
            WHERE "userId" = $1 AND "sessionDate" LIKE $2`,
          [user.id, monthPref]
        ),
      ]);

    return Response.json({
      tier: quotas.tier,
      quotas,
      counts: {
        fragments:    fragRes.rows[0]?.n || 0,
        photos:       photoRes.rows[0]?.n || 0,
        memoirBooks:  memoirRes.rows[0]?.n || 0,
        photobooks:   photobookRes.rows[0]?.n || 0,
        todayMinutes: todayMinRes.rows[0]?.m || 0,
        monthMinutes: monthMinRes.rows[0]?.m || 0,
      },
    });
  } catch (e) {
    console.error('[GET /api/user/quotas]', e?.message);
    return Response.json(
      { error: 'failed to load quotas', detail: e?.message },
      { status: 500 }
    );
  }
}
