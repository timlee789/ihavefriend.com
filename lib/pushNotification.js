/**
 * Server-side push notification sender
 * Uses: medication reminders, appointments, proactive check-ins
 */

import webpush from 'web-push';
import { neon } from '@neondatabase/serverless';

function getDb() {
  return neon(process.env.DATABASE_URL);
}

function initWebPush() {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:hello@sayandkeep.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// ── Save push subscription ────────────────────────────────────
export async function saveSubscription(userId, subscription) {
  const sql = getDb();
  await sql`
    INSERT INTO push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth)
    VALUES (${userId}, ${subscription.endpoint}, ${subscription.keys.p256dh}, ${subscription.keys.auth})
    ON CONFLICT (user_id)
    DO UPDATE SET
      endpoint    = ${subscription.endpoint},
      keys_p256dh = ${subscription.keys.p256dh},
      keys_auth   = ${subscription.keys.auth},
      created_at  = NOW()
  `;
}

// ── Send to one user ──────────────────────────────────────────
export async function sendPushToUser(userId, notification) {
  initWebPush();
  const sql = getDb();
  const rows = await sql`
    SELECT endpoint, keys_p256dh, keys_auth
    FROM push_subscriptions WHERE user_id = ${userId}
  `;
  if (rows.length === 0) return { sent: false, reason: 'no_subscription' };

  const sub = {
    endpoint: rows[0].endpoint,
    keys: { p256dh: rows[0].keys_p256dh, auth: rows[0].keys_auth },
  };

  const payload = JSON.stringify({
    title: notification.title || 'Emma',
    body:  notification.body,
    tag:   notification.tag  || 'emma-reminder',
    url:   notification.url  || '/chat',
    type:  notification.type || 'reminder',
  });

  try {
    await webpush.sendNotification(sub, payload);
    return { sent: true };
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      await sql`DELETE FROM push_subscriptions WHERE user_id = ${userId}`;
      return { sent: false, reason: 'subscription_expired' };
    }
    console.error('Push failed for user', userId, err.message);
    return { sent: false, reason: 'push_error' };
  }
}

// ── Reminder helpers ──────────────────────────────────────────
export function sendMedicationReminder(userId, medication) {
  return sendPushToUser(userId, {
    title: 'Emma 💊',
    body:  `Time to take your ${medication}.`,
    tag:   `med-${Date.now()}`,
    type:  'medication',
  });
}

export function sendAppointmentReminder(userId, appointment) {
  return sendPushToUser(userId, {
    title: 'Emma 📅',
    body:  `Reminder: ${appointment.what} ${appointment.when}`,
    tag:   `appt-${Date.now()}`,
    type:  'appointment',
  });
}

export function sendCheckIn(userId) {
  return sendPushToUser(userId, {
    title: 'Emma 💙',
    body:  "Haven't heard from you in a while. Everything okay? I'm here.",
    tag:   'checkin',
    type:  'checkin',
  });
}

// ── Cron: process scheduled reminders (every 15 min) ─────────
export async function processScheduledReminders() {
  const sql = getDb();
  const now = new Date();
  const h = now.getHours(), m = now.getMinutes();
  const today = now.toISOString().split('T')[0];

  // 1. Medication reminders
  const meds = await sql`
    SELECT user_id, data FROM memory_nodes
    WHERE node_type = 'upcoming' AND is_active = true
      AND data->>'type' = 'medication'
      AND (data->>'reminder_hour')::int = ${h}
      AND (data->>'reminder_minute')::int BETWEEN ${m - 7} AND ${m + 7}
  `;
  for (const row of meds) {
    await sendMedicationReminder(row.user_id, row.data.medication || 'your medication');
  }

  // 2. Appointment reminders (1 hour ahead)
  const appts = await sql`
    SELECT user_id, data FROM memory_nodes
    WHERE node_type = 'upcoming' AND is_active = true
      AND data->>'type' = 'appointment'
      AND data->>'date' = ${today}
  `;
  for (const row of appts) {
    const apptHour = parseInt(row.data.hour || '0');
    if (apptHour - 1 === h && m >= 50) {
      await sendAppointmentReminder(row.user_id, {
        what: row.data.what || 'your appointment',
        when: `today at ${row.data.time || 'soon'}`,
      });
    }
  }

  // 3. Check-in at 6 PM for users absent 2+ days
  let checkins = 0;
  if (h === 18 && m < 15) {
    const absent = await sql`
      SELECT u.id FROM "User" u
      LEFT JOIN chat_sessions cs
        ON cs.user_id = u.id AND cs.started_at > NOW() - INTERVAL '2 days'
      WHERE cs.id IS NULL
        AND u.id IN (
          SELECT DISTINCT user_id FROM chat_sessions
          WHERE started_at > NOW() - INTERVAL '30 days'
          GROUP BY user_id HAVING COUNT(*) >= 10
        )
    `;
    for (const row of absent) {
      await sendCheckIn(row.id);
      checkins++;
    }
  }

  // 4. Upcoming event reminders at 10 AM (3 days ahead)
  const events = await sql`
    SELECT user_id, id, label FROM memory_nodes
    WHERE node_type = 'upcoming' AND is_active = true
      AND data->>'type' NOT IN ('medication', 'appointment')
      AND (data->>'date')::date = CURRENT_DATE + INTERVAL '3 days'
  `;
  if (h === 10 && m < 15) {
    for (const row of events) {
      await sendPushToUser(row.user_id, {
        title: 'Emma 🗓️',
        body:  `${row.label} is in 3 days. Want to talk about it?`,
        tag:   `event-${row.id}`,
        type:  'event',
      });
    }
  }

  return {
    medications: meds.length,
    appointments: appts.length,
    checkins,
    events: h === 10 ? events.length : 0,
  };
}
