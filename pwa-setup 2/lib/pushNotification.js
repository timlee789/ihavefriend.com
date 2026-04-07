/**
 * Push Notification Service for ihavefriend.com
 * 
 * Sends reminders from Emma to users via Web Push API.
 * Used for: medication reminders, appointments, proactive check-ins.
 * 
 * Setup requires:
 * 1. Generate VAPID keys: npx web-push generate-vapid-keys
 * 2. Add to .env:
 *    VAPID_PUBLIC_KEY=your_public_key
 *    VAPID_PRIVATE_KEY=your_private_key
 *    VAPID_EMAIL=mailto:tim@ihavefriend.com
 * 3. npm install web-push
 */

const webpush = require('web-push');

// Configure VAPID (Voluntary Application Server Identification)
function initWebPush() {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:hello@ihavefriend.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// ============================================================
// Save user's push subscription to database
// ============================================================
async function saveSubscription(db, userId, subscription) {
  await db.query(`
    INSERT INTO push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth, created_at)
    VALUES ($1, $2, $3, $4, NOW())
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
}

// ============================================================
// Send a push notification to a user
// ============================================================
async function sendPushToUser(db, userId, notification) {
  const sub = await db.query(
    'SELECT endpoint, keys_p256dh, keys_auth FROM push_subscriptions WHERE user_id = $1',
    [userId]
  );

  if (sub.rows.length === 0) return { sent: false, reason: 'no_subscription' };

  const subscription = {
    endpoint: sub.rows[0].endpoint,
    keys: {
      p256dh: sub.rows[0].keys_p256dh,
      auth: sub.rows[0].keys_auth,
    },
  };

  const payload = JSON.stringify({
    title: notification.title || 'Emma',
    body: notification.body,
    tag: notification.tag || 'emma-reminder',
    url: notification.url || '/chat',
    type: notification.type || 'reminder',
  });

  try {
    await webpush.sendNotification(subscription, payload);
    return { sent: true };
  } catch (error) {
    if (error.statusCode === 410 || error.statusCode === 404) {
      // Subscription expired — remove it
      await db.query('DELETE FROM push_subscriptions WHERE user_id = $1', [userId]);
      return { sent: false, reason: 'subscription_expired' };
    }
    console.error('Push failed for user', userId, error);
    return { sent: false, reason: 'push_error' };
  }
}

// ============================================================
// Emma's Reminder Types
// ============================================================

/**
 * Send medication reminder.
 */
async function sendMedicationReminder(db, userId, medication) {
  return sendPushToUser(db, userId, {
    title: 'Emma',
    body: `Time to take your ${medication}. Don't forget!`,
    tag: `med-${Date.now()}`,
    type: 'medication',
  });
}

/**
 * Send appointment reminder.
 */
async function sendAppointmentReminder(db, userId, appointment) {
  return sendPushToUser(db, userId, {
    title: 'Emma',
    body: `Reminder: ${appointment.what} ${appointment.when}`,
    tag: `appt-${Date.now()}`,
    type: 'appointment',
  });
}

/**
 * Send check-in after absence (user hasn't visited in 2+ days).
 */
async function sendCheckIn(db, userId) {
  return sendPushToUser(db, userId, {
    title: 'Emma',
    body: `Haven't heard from you in a while. Everything okay? I'm here if you want to talk.`,
    tag: 'checkin',
    type: 'checkin',
  });
}

/**
 * Send proactive memory trigger (birthday, anniversary, etc).
 */
async function sendMemoryTrigger(db, userId, memory) {
  return sendPushToUser(db, userId, {
    title: 'Emma',
    body: memory.message,
    tag: `memory-${memory.id}`,
    type: 'memory',
  });
}

// ============================================================
// Scheduled Reminder Processor
// Run this via cron job or Vercel Cron every 15 minutes
// ============================================================
async function processScheduledReminders(db) {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const today = now.toISOString().split('T')[0];

  // 1. Medication reminders from Upcoming nodes
  const meds = await db.query(`
    SELECT mn.user_id, mn.data
    FROM memory_nodes mn
    WHERE mn.node_type = 'upcoming'
      AND mn.is_active = true
      AND mn.data->>'type' = 'medication'
      AND (mn.data->>'reminder_hour')::int = $1
      AND (mn.data->>'reminder_minute')::int BETWEEN $2 AND $3
  `, [currentHour, currentMinute - 7, currentMinute + 7]);

  for (const med of meds.rows) {
    await sendMedicationReminder(db, med.user_id, med.data.medication || 'your medication');
  }

  // 2. Appointment reminders (1 hour before)
  const appointments = await db.query(`
    SELECT mn.user_id, mn.data
    FROM memory_nodes mn
    WHERE mn.node_type = 'upcoming'
      AND mn.is_active = true
      AND mn.data->>'type' = 'appointment'
      AND mn.data->>'date' = $1
  `, [today]);

  for (const appt of appointments.rows) {
    const apptHour = parseInt(appt.data.hour || '0');
    if (apptHour - 1 === currentHour && currentMinute >= 50) {
      await sendAppointmentReminder(db, appt.user_id, {
        what: appt.data.what || 'your appointment',
        when: `today at ${appt.data.time || 'soon'}`,
      });
    }
  }

  // 3. Check-in for absent regular users
  if (currentHour === 18) { // 6 PM check
    const absent = await db.query(`
      SELECT u.id
      FROM "User" u
      LEFT JOIN chat_sessions cs ON cs.user_id = u.id 
        AND cs.started_at > NOW() - INTERVAL '2 days'
      WHERE cs.id IS NULL
        AND u.id IN (
          SELECT DISTINCT user_id FROM chat_sessions 
          WHERE started_at > NOW() - INTERVAL '30 days'
          GROUP BY user_id HAVING COUNT(*) >= 10
        )
    `);

    for (const user of absent.rows) {
      await sendCheckIn(db, user.id);
    }
  }

  // 4. Upcoming event reminders (birthdays, etc)
  const upcoming = await db.query(`
    SELECT mn.user_id, mn.id, mn.label, mn.data
    FROM memory_nodes mn
    WHERE mn.node_type = 'upcoming'
      AND mn.is_active = true
      AND mn.data->>'type' NOT IN ('medication', 'appointment')
      AND (mn.data->>'date')::date = CURRENT_DATE + INTERVAL '3 days'
  `);

  if (currentHour === 10) { // 10 AM for event reminders
    for (const event of upcoming.rows) {
      await sendMemoryTrigger(db, event.user_id, {
        id: event.id,
        message: `${event.label} is in 3 days. Want to talk about it?`,
      });
    }
  }

  return {
    processed: {
      medications: meds.rows.length,
      appointments: appointments.rows.length,
      checkins: absent?.rows?.length || 0,
      events: upcoming.rows.length,
    },
  };
}

module.exports = {
  initWebPush,
  saveSubscription,
  sendPushToUser,
  sendMedicationReminder,
  sendAppointmentReminder,
  sendCheckIn,
  sendMemoryTrigger,
  processScheduledReminders,
};
