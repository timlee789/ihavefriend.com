'use client';

/**
 * useUserPlan — Sprint 2j V2 (2026-05-11).
 *
 * Single hook for any frontend surface that needs to know the user's
 * tier + effective quotas + current counts. Returns null while loading
 * (so callers can gate UI behind ready state) and a `refresh()` callback
 * for explicit reloads after a mutation.
 *
 * Calls GET /api/user/quotas — that endpoint resolves overrides + tier
 * defaults via lib/quotas.js (single source of truth).
 *
 * Returns:
 *   {
 *     loading: boolean,
 *     plan: {
 *       tier,                              // 'free' | 'premium' | 'unlimited'
 *       isTrial,                           // tier === 'free'
 *       isPaid,                            // tier === 'premium' || 'unlimited'
 *       quotas: { maxFragments, ... },     // from /api/user/quotas
 *       counts: { fragments, photos, ... },// current values
 *       remaining: {                       // computed: limit - count, or Infinity for unlimited tier
 *         fragments, photos,
 *         memoirBooks, photobooks,
 *         dailyMinutes, monthlyMinutes,
 *       },
 *       quotaReached: {                    // booleans for trigger logic
 *         fragments, photos,
 *         memoirBooks, photobooks,
 *         dailyMinutes, monthlyMinutes,
 *       },
 *     } | null,
 *     refresh: () => Promise<void>,
 *   }
 *
 * Anonymous users (no token) return { loading: false, plan: null }. Each
 * caller decides what to render in that case (TrialBadge hides itself).
 */
import { useCallback, useEffect, useState } from 'react';

function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

export function useUserPlan() {
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState(null);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setPlan(null);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/user/quotas', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setPlan(null);
        setLoading(false);
        return;
      }
      const data = await res.json();
      const tier = data.tier || 'free';
      const quotas = data.quotas || {};
      const counts = data.counts || {};

      const remaining = {
        fragments:      Math.max(0, (quotas.maxFragments   || 0) - (counts.fragments    || 0)),
        photos:         Math.max(0, (quotas.maxPhotos      || 0) - (counts.photos       || 0)),
        memoirBooks:    Math.max(0, (quotas.maxBooks       || 0) - (counts.memoirBooks  || 0)),
        photobooks:     Math.max(0, (quotas.maxBooks       || 0) - (counts.photobooks   || 0)),
        dailyMinutes:   Math.max(0, (quotas.dailyMinutes   || 0) - (counts.todayMinutes || 0)),
        monthlyMinutes: Math.max(0, (quotas.monthlyMinutes || 0) - (counts.monthMinutes || 0)),
      };
      const quotaReached = {
        fragments:      (counts.fragments    || 0) >= (quotas.maxFragments   || 0),
        photos:         (counts.photos       || 0) >= (quotas.maxPhotos      || 0),
        memoirBooks:    (counts.memoirBooks  || 0) >= (quotas.maxBooks       || 0),
        photobooks:     (counts.photobooks   || 0) >= (quotas.maxBooks       || 0),
        dailyMinutes:   (counts.todayMinutes || 0) >= (quotas.dailyMinutes   || 0),
        monthlyMinutes: (counts.monthMinutes || 0) >= (quotas.monthlyMinutes || 0),
      };

      setPlan({
        tier,
        isTrial: tier === 'free',
        isPaid:  tier === 'premium' || tier === 'unlimited',
        quotas,
        counts,
        remaining,
        quotaReached,
      });
    } catch (e) {
      console.error('[useUserPlan] load failed:', e?.message);
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { loading, plan, refresh: load };
}
