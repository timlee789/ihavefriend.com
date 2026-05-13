/**
 * lib/stripe.js — Server-side Stripe SDK instance (Sprint 2W, 2026-05-13).
 *
 * Lazy singleton. Reads STRIPE_SECRET_KEY from env at first access; throws
 * early with a clear message if missing (avoids cryptic Stripe errors).
 *
 * Usage (server-side, e.g. /api/checkout/create-session):
 *   import { getStripe } from '@/lib/stripe';
 *   const stripe = getStripe();
 *   const session = await stripe.checkout.sessions.create({ ... });
 *
 * API version pinned to '2024-12-18.acacia' (strategy doc decision) for
 * consistent behavior across SDK upgrades. Stripe maintains backward
 * compatibility — webhook payload shape stays stable per version.
 *
 * 🔒 Security: Secret key NEVER returned. Only the Stripe SDK instance.
 *   Public key (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) lives in lib/stripeClient.js
 *   for browser-side use.
 */
import Stripe from 'stripe';

let stripeInstance = null;

export function getStripe() {
  if (stripeInstance) return stripeInstance;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      'STRIPE_SECRET_KEY not set. Add it to .env (test: sk_test_..., live: sk_live_...). ' +
      'See STRATEGY-stripe-integration-V1-2026-05-13.md for setup.'
    );
  }

  stripeInstance = new Stripe(key, {
    apiVersion: '2024-12-18.acacia',
    // typescript: false (default for plain JS — no type imports).
    // appInfo helps Stripe attribute API calls in their dashboard analytics.
    appInfo: {
      name: 'SayAndKeep',
      version: '2W',
    },
  });

  return stripeInstance;
}
