'use client';

/**
 * TrialBadge — Sprint 2j V2 (2026-05-11).
 *
 * Small pill rendered in the home top header when the signed-in user is
 * on the 'free' (Trial) tier. Shows daily minutes remaining + fragment
 * count progress so the senior sees "what's left" at a glance.
 *
 * Renders nothing for:
 *   - Anonymous users (plan === null)
 *   - Paid / Unlimited users (plan.isTrial === false)
 *   - Loading state
 *
 * Usage:
 *   import TrialBadge from '@/components/auth/TrialBadge';
 *   const { plan } = useUserPlan();
 *   {plan && plan.isTrial && <TrialBadge plan={plan} />}
 *
 * Multilingual: KO / EN / ES via the user's lang setting.
 */
import s from './TrialBadge.module.css';

const LABELS = {
  KO: {
    badge:      '🌱 Trial',
    minutesLeft: (n) => `${Math.round(n)}분 남음`,
    fragLabel:  (cur, max) => `이야기 ${cur}/${max}`,
  },
  EN: {
    badge:      '🌱 Trial',
    minutesLeft: (n) => `${Math.round(n)} min left`,
    fragLabel:  (cur, max) => `${cur}/${max} stories`,
  },
  ES: {
    badge:      '🌱 Trial',
    minutesLeft: (n) => `${Math.round(n)} min restantes`,
    fragLabel:  (cur, max) => `${cur}/${max} historias`,
  },
};

function getLang() {
  if (typeof window === 'undefined') return 'KO';
  const stored = (localStorage.getItem('lang') || 'ko').toUpperCase();
  return ['KO', 'EN', 'ES'].includes(stored) ? stored : 'KO';
}

export default function TrialBadge({ plan }) {
  if (!plan || !plan.isTrial) return null;

  const L = LABELS[getLang()] || LABELS.KO;
  const minLeft = plan.remaining.dailyMinutes;
  const fragCur = plan.counts.fragments || 0;
  const fragMax = plan.quotas.maxFragments || 0;

  return (
    <span className={s.badge} aria-label="Trial tier status">
      <span className={s.badgeLabel}>{L.badge}</span>
      <span className={s.dot}>·</span>
      <span className={s.metric}>{L.minutesLeft(minLeft)}</span>
      <span className={s.dot}>·</span>
      <span className={s.metric}>{L.fragLabel(fragCur, fragMax)}</span>
    </span>
  );
}
