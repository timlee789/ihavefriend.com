/**
 * lib/stripeClient.js — Browser-side Stripe.js loader (Sprint 2W, 2026-05-13).
 *
 * Lazy promise singleton — loadStripe() loads the Stripe.js script into the
 * page once and caches the Stripe instance. All subsequent calls return the
 * same promise (no duplicate script tags).
 *
 * Usage (client component):
 *   'use client';
 *   import { getStripePromise } from '@/lib/stripeClient';
 *
 *   async function startCheckout() {
 *     const stripe = await getStripePromise();
 *     await stripe.redirectToCheckout({ sessionId: '...' });
 *   }
 *
 * 🔒 Security: Uses NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (browser-safe).
 *   Secret key (STRIPE_SECRET_KEY) stays server-only in lib/stripe.js.
 *
 * Returns null if env var missing (gracefull degradation — pricing page
 * still renders, CTA stays disabled until env is set). Sprint 2X 부터
 * 활성 CTA 가 이 promise 를 await.
 */
import { loadStripe } from '@stripe/stripe-js';

let stripePromise = null;

export function getStripePromise() {
  if (stripePromise) return stripePromise;

  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) {
    // Don't throw — let the caller decide UX (e.g. show "Coming Soon").
    // Sprint 2W initial state: env not set → promise resolves to null.
    console.warn(
      '[stripeClient] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY not set. ' +
      'Stripe.redirectToCheckout will be a no-op.'
    );
    stripePromise = Promise.resolve(null);
    return stripePromise;
  }

  stripePromise = loadStripe(key);
  return stripePromise;
}
