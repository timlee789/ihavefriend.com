/**
 * lib/quotas.js — Quota resolution + check helpers (Sprint 2j V2, 2026-05-11).
 *
 * Single source of truth for user-facing quotas. Every API endpoint that
 * enforces a limit calls getUserQuotas(userId) to resolve the effective
 * value (user override > tier default > fallback).
 *
 * Pattern: raw SQL via createDb() (matches existing apply-quota-schema.js
 * + admin/quota route convention — production tier infra was added via
 * raw SQL script, not Prisma migrate).
 *
 * Resolution order:
 *   1. user_limits override (per-user, nullable column)
 *   2. tier_defaults (per-tier, seeded)
 *   3. FALLBACK_DEFAULTS (hard-coded safety net)
 *
 * Quotas tracked:
 *   - dailyMinutes / monthlyMinutes (AI chat minutes — UsageLog)
 *   - maxFragments / maxPhotos / maxBooks (count limits)
 *   - allowPdf / allowAudioQr / allowSharing (feature gates)
 *   - dataRetentionDays (Phase 3 — not enforced yet)
 *
 * Migration prerequisite: scripts/apply-tier-defaults.js applied.
 */
import { createDb } from './db';

// Last-resort defaults if both tier_defaults row + user override missing.
// Match the seed values in scripts/apply-tier-defaults.js.
//
// 🔥 Sprint 2V (2026-05-13) — Tim 결정 (Pricing V4):
//   - free: dailyMinutes 10 → 5 (5분 × 6일 → 월 30분 균형, 결정 7-B).
//   - premium: maxFragments 200 → 100, maxPhotos 100 → 50 (UI 일관, 결정 8-A).
//   - premium: maxBooks 3 → 1 (인쇄 발주 limit, 결정 3-B).
//   - allowBookPrint NEW: Lulu 인쇄 발주 gate (결정 9-B). Trial 은
//     자서전/이야기책 작성 가능 (maxBooks 1 유지) — 인쇄만 X.
//     Option A 채택: maxBooks 의미 그대로 (entity creation), allowBookPrint
//     이 print order endpoint (/api/photobooks/[id]/print-request) gate.
const FALLBACK_DEFAULTS = {
  free: {
    dailyMinutes: 5, monthlyMinutes: 30,
    maxFragments: 5, maxPhotos: 3, maxBooks: 1,
    allowPdf: false, allowAudioQr: false, allowSharing: false,
    allowBookPrint: false,
    dataRetentionDays: 30,
  },
  premium: {
    dailyMinutes: 60, monthlyMinutes: 1800,
    maxFragments: 100, maxPhotos: 50, maxBooks: 1,
    allowPdf: true, allowAudioQr: true, allowSharing: true,
    allowBookPrint: true,
    dataRetentionDays: 99999,
  },
  unlimited: {
    dailyMinutes: 9999, monthlyMinutes: 99999,
    maxFragments: 9999, maxPhotos: 9999, maxBooks: 9999,
    allowPdf: true, allowAudioQr: true, allowSharing: true,
    allowBookPrint: true,
    dataRetentionDays: 99999,
  },
};

/**
 * Resolve effective quotas for a user.
 *
 * Returns:
 *   {
 *     tier: 'free' | 'premium' | 'unlimited',
 *     dailyMinutes, monthlyMinutes,
 *     maxFragments, maxPhotos, maxBooks,
 *     allowPdf, allowAudioQr, allowSharing,
 *     dataRetentionDays,
 *   }
 */
export async function getUserQuotas(userId) {
  const db = createDb();

  // Single JOIN query: pull tier from User, override row from user_limits,
  // tier defaults — all at once.
  //
  // 🔥 Sprint 2V (2026-05-13) — allow_book_print column added to both
  //   user_limits + tier_defaults via apply-tier-defaults.js migration.
  //   Prerequisite: 이 코드 deploy 전에 production DB 에서 migration 실행.
  //   Migration 안 됐으면 SELECT 가 throw → catch 가 fallback 반환.
  const result = await db.query(
    `SELECT
       COALESCE(u.tier, 'free') AS tier,
       ul.daily_minutes        AS ul_daily_minutes,
       ul.monthly_minutes      AS ul_monthly_minutes,
       ul.max_fragments        AS ul_max_fragments,
       ul.max_photos           AS ul_max_photos,
       ul.max_books            AS ul_max_books,
       ul.allow_pdf            AS ul_allow_pdf,
       ul.allow_audio_qr       AS ul_allow_audio_qr,
       ul.allow_sharing        AS ul_allow_sharing,
       ul.allow_book_print     AS ul_allow_book_print,
       ul.data_retention_days  AS ul_data_retention_days,
       td.daily_minutes        AS td_daily_minutes,
       td.monthly_minutes      AS td_monthly_minutes,
       td.max_fragments        AS td_max_fragments,
       td.max_photos           AS td_max_photos,
       td.max_books            AS td_max_books,
       td.allow_pdf            AS td_allow_pdf,
       td.allow_audio_qr       AS td_allow_audio_qr,
       td.allow_sharing        AS td_allow_sharing,
       td.allow_book_print     AS td_allow_book_print,
       td.data_retention_days  AS td_data_retention_days
     FROM "User" u
     LEFT JOIN user_limits   ul ON ul.user_id = u.id
     LEFT JOIN tier_defaults td ON td.tier    = COALESCE(u.tier, 'free')
     WHERE u.id = $1`,
    [userId]
  ).catch(e => {
    // Migration 안 됐을 때 graceful fallback — getUserQuotas 호출자가 항상
    // 결과 받도록. 실패는 console 만, FALLBACK_DEFAULTS 그대로 사용.
    console.warn('[getUserQuotas] DB query failed, using fallback:', e?.message);
    return { rows: [] };
  });

  if (result.rows.length === 0) {
    // User not found — return free fallback (safe default).
    return { tier: 'free', ...FALLBACK_DEFAULTS.free };
  }

  const row = result.rows[0];
  const tier = row.tier || 'free';
  const fallback = FALLBACK_DEFAULTS[tier] || FALLBACK_DEFAULTS.free;

  // pick(ulVal, tdVal, fbVal) — first non-null wins.
  // ?? not used because Postgres returns null for missing columns; for
  // booleans, false is a valid override (shouldn't fall through to tier).
  const pick = (ulVal, tdVal, fbVal) => {
    if (ulVal !== null && ulVal !== undefined) return ulVal;
    if (tdVal !== null && tdVal !== undefined) return tdVal;
    return fbVal;
  };

  return {
    tier,
    dailyMinutes:      pick(row.ul_daily_minutes,       row.td_daily_minutes,       fallback.dailyMinutes),
    monthlyMinutes:    pick(row.ul_monthly_minutes,     row.td_monthly_minutes,     fallback.monthlyMinutes),
    maxFragments:      pick(row.ul_max_fragments,       row.td_max_fragments,       fallback.maxFragments),
    maxPhotos:         pick(row.ul_max_photos,          row.td_max_photos,          fallback.maxPhotos),
    maxBooks:          pick(row.ul_max_books,           row.td_max_books,           fallback.maxBooks),
    allowPdf:          pick(row.ul_allow_pdf,           row.td_allow_pdf,           fallback.allowPdf),
    allowAudioQr:      pick(row.ul_allow_audio_qr,      row.td_allow_audio_qr,      fallback.allowAudioQr),
    allowSharing:      pick(row.ul_allow_sharing,       row.td_allow_sharing,       fallback.allowSharing),
    allowBookPrint:    pick(row.ul_allow_book_print,    row.td_allow_book_print,    fallback.allowBookPrint),
    dataRetentionDays: pick(row.ul_data_retention_days, row.td_data_retention_days, fallback.dataRetentionDays),
  };
}

/**
 * Check whether the user can perform an action that consumes a count-based
 * quota. Returns { ok: true, quotas } if under limit, or { ok: false, error }
 * with a Response.json-compatible payload if at/over.
 *
 * Usage:
 *   const count = await db.query('SELECT COUNT(*) FROM ...');
 *   const check = await checkQuotaOrError(userId, 'maxFragments', count);
 *   if (!check.ok) return Response.json(check.error, { status: 403 });
 */
export async function checkQuotaOrError(userId, quotaType, currentCount) {
  const quotas = await getUserQuotas(userId);
  const limit = quotas[quotaType];

  if (typeof limit !== 'number') {
    // Misuse safeguard — quotaType doesn't map to a number.
    console.warn(`[checkQuotaOrError] unknown numeric quotaType: ${quotaType}`);
    return { ok: true, quotas };
  }

  if (currentCount >= limit) {
    const code = `${quotaType.replace(/[A-Z]/g, m => '_' + m.toLowerCase()).toUpperCase()}_LIMIT`;
    return {
      ok: false,
      error: {
        error: 'quota_exceeded',
        code,                // e.g. 'MAX_FRAGMENTS_LIMIT'
        quotaType,           // e.g. 'maxFragments'
        message: `${quotaType} 한도 (${limit}) 에 도달했어요.`,
        currentCount,
        limit,
        tier: quotas.tier,
      },
    };
  }

  return { ok: true, quotas };
}

/**
 * Check a boolean feature gate (allowPdf / allowAudioQr / allowSharing).
 * Returns { ok: true, quotas } if allowed, or { ok: false, error } if not.
 *
 * Usage:
 *   const check = await checkFeatureOrError(userId, 'allowPdf');
 *   if (!check.ok) return Response.json(check.error, { status: 403 });
 */
export async function checkFeatureOrError(userId, featureKey) {
  const quotas = await getUserQuotas(userId);
  if (quotas[featureKey] === true) {
    return { ok: true, quotas };
  }
  const code = `${featureKey.replace(/[A-Z]/g, m => '_' + m.toLowerCase()).toUpperCase()}_NOT_ALLOWED`;
  return {
    ok: false,
    error: {
      error: 'feature_not_allowed',
      code,                // e.g. 'ALLOW_PDF_NOT_ALLOWED'
      featureKey,
      message: `${featureKey} 기능은 정식 등록 후 가능해요.`,
      tier: quotas.tier,
    },
  };
}
