/**
 * API Route: POST /api/push/subscribe
 * 
 * Saves user's push notification subscription.
 * Place this in: app/api/push/subscribe/route.js
 */

import { NextResponse } from 'next/server';
// Import your database connection
// import { db } from '@/lib/db';

export async function POST(request) {
  try {
    const { userId, subscription } = await request.json();

    if (!userId || !subscription?.endpoint) {
      return NextResponse.json(
        { error: 'Missing userId or subscription' },
        { status: 400 }
      );
    }

    // Save subscription to database
    await db.query(`
      INSERT INTO push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id)
      DO UPDATE SET
        endpoint = $2,
        keys_p256dh = $3,
        keys_auth = $4,
        created_at = NOW()
    `, [
      userId,
      subscription.endpoint,
      subscription.keys.p256dh,
      subscription.keys.auth,
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Push subscribe error:', error);
    return NextResponse.json(
      { error: 'Failed to save subscription' },
      { status: 500 }
    );
  }
}
