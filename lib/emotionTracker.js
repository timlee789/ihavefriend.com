/**
 * Emotion Tracker for sayandkeep.com
 *
 * Detects emotions in real-time during conversations
 * and summarizes emotional patterns per session.
 *
 * 2026-04-23 v2 schema migration:
 *  - emotion_sessions.emotional_arc is EmotionalArc enum → use emotionalArcToDb at INSERT
 *  - emotion_alerts.severity is AlertSeverity enum → use alertSeverityToDb at INSERT
 *  - emotion_turns.dominant_emotion is VARCHAR(30), NOT an enum → no mapper
 */

const {
  emotionalArcToDb,
  alertSeverityToDb,
} = require('./enumMappers');

/**
 * Parse emotion data from Gemini's response.
 * The Gemini prompt is configured to append an <emotion_analysis> block.
 * 
 * @param {string} rawResponse - Gemini's full response text
 * @returns {{ cleanResponse: string, emotion: Object|null }}
 */
function parseEmotionFromResponse(rawResponse) {
  const emotionMatch = rawResponse.match(/<emotion_analysis>([\s\S]*?)<\/emotion_analysis>/);
  
  if (!emotionMatch) {
    return { cleanResponse: rawResponse, emotion: null };
  }

  const cleanResponse = rawResponse.replace(/<emotion_analysis>[\s\S]*?<\/emotion_analysis>/, '').trim();
  
  try {
    const emotion = JSON.parse(emotionMatch[1].trim());
    return { cleanResponse, emotion: validateEmotion(emotion) };
  } catch {
    return { cleanResponse, emotion: null };
  }
}

/**
 * Validate and clamp emotion values.
 */
function validateEmotion(emotion) {
  return {
    detected_emotions: Array.isArray(emotion.detected_emotions) ? emotion.detected_emotions : [],
    valence: Math.max(-1, Math.min(1, parseFloat(emotion.valence) || 0)),
    arousal: Math.max(0, Math.min(1, parseFloat(emotion.arousal) || 0.5)),
    dominant: emotion.dominant || 'neutral',
    trigger: emotion.trigger || null,
    concern_level: Math.max(0, Math.min(2, parseInt(emotion.concern_level) || 0)),
    topic_sensitivity: emotion.topic_sensitivity || null,
  };
}

/**
 * Save a single turn's emotion data.
 * Call this after every user message + AI response.
 */
async function saveEmotionTurn(db, userId, sessionId, turnNumber, userMessage, emotion) {
  if (!emotion) return;

  await db.query(`
    INSERT INTO emotion_turns 
      (user_id, session_id, turn_number, user_message_preview,
       valence, arousal, emotions, dominant_emotion, 
       trigger_topic, concern_level)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `, [
    userId, sessionId, turnNumber,
    userMessage.substring(0, 100),  // Privacy: only first 100 chars
    emotion.valence,
    emotion.arousal,
    emotion.detected_emotions,
    emotion.dominant,
    emotion.trigger,
    emotion.concern_level,
  ]);
}

/**
 * Summarize emotions for a completed session.
 * Call this when a conversation ends.
 */
async function summarizeSessionEmotions(db, userId, sessionId) {
  // Get all emotion turns for this session
  const turns = await db.query(`
    SELECT valence, arousal, dominant_emotion, trigger_topic, concern_level
    FROM emotion_turns
    WHERE session_id = $1
    ORDER BY turn_number
  `, [sessionId]);

  if (turns.rows.length === 0) return null;

  const rows = turns.rows;
  const valences = rows.map(r => parseFloat(r.valence)).filter(v => !isNaN(v));
  const arousals = rows.map(r => parseFloat(r.arousal)).filter(a => !isNaN(a));

  // Calculate aggregates
  const avgValence = valences.reduce((a, b) => a + b, 0) / valences.length;
  const minValence = Math.min(...valences);
  const maxValence = Math.max(...valences);
  const avgArousal = arousals.reduce((a, b) => a + b, 0) / arousals.length;

  // Emotion distribution
  const emotionCounts = {};
  rows.forEach(r => {
    if (r.dominant_emotion) {
      emotionCounts[r.dominant_emotion] = (emotionCounts[r.dominant_emotion] || 0) + 1;
    }
  });

  // Find dominant emotion (most frequent)
  const dominantEmotion = Object.entries(emotionCounts)
    .sort(([, a], [, b]) => b - a)[0]?.[0] || 'neutral';

  // Determine emotional arc
  const arc = determineArc(valences);

  // Key triggers (unique)
  const triggers = [...new Set(rows.map(r => r.trigger_topic).filter(Boolean))];

  // Positive moments (turns with valence > 0.3)
  const positives = rows
    .filter(r => parseFloat(r.valence) > 0.3 && r.trigger_topic)
    .map(r => r.trigger_topic);

  // Concern events (turns with concern_level > 0)
  const concerns = rows
    .filter(r => r.concern_level > 0 && r.trigger_topic)
    .map(r => r.trigger_topic);

  const maxConcern = Math.max(...rows.map(r => r.concern_level || 0));

  // Calculate session duration
  const sessionInfo = await db.query(
    'SELECT started_at FROM chat_sessions WHERE id = $1', [sessionId]
  );
  const durationMin = sessionInfo.rows[0]?.started_at
    ? Math.round((Date.now() - new Date(sessionInfo.rows[0].started_at).getTime()) / 60000)
    : null;

  // Save session summary
  await db.query(`
    INSERT INTO emotion_sessions
      (user_id, session_id, avg_valence, min_valence, max_valence, avg_arousal,
       emotion_counts, dominant_emotion, emotional_arc,
       key_triggers, positive_moments, concern_events,
       total_turns, session_duration_min, max_concern_level)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
  `, [
    userId, sessionId,
    avgValence.toFixed(3), minValence.toFixed(3), maxValence.toFixed(3), avgArousal.toFixed(3),
    emotionCounts, dominantEmotion, emotionalArcToDb(arc),
    triggers, [...new Set(positives)], [...new Set(concerns)],
    rows.length, durationMin, maxConcern,
  ]);

  // Check alert conditions
  await checkAlertConditions(db, userId);

  return { arc, dominantEmotion, avgValence, maxConcern };
}

/**
 * Determine the emotional arc of a session.
 */
function determineArc(valences) {
  if (valences.length < 3) return 'stable';

  const mid = Math.floor(valences.length / 2);
  const firstHalf = valences.slice(0, mid);
  const secondHalf = valences.slice(mid);

  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  
  const variance = valences.reduce((sum, v) => {
    const mean = valences.reduce((a, b) => a + b, 0) / valences.length;
    return sum + Math.pow(v - mean, 2);
  }, 0) / valences.length;

  if (variance > 0.15) return 'volatile';
  if (avgSecond - avgFirst > 0.15) return 'improving';
  if (avgFirst - avgSecond > 0.15) return 'declining';
  return 'stable';
}

/**
 * Check for alert conditions based on recent emotion data.
 */
async function checkAlertConditions(db, userId) {
  const recent = await db.query(`
    SELECT session_date, avg_valence, dominant_emotion, max_concern_level, key_triggers
    FROM emotion_sessions
    WHERE user_id = $1
    ORDER BY session_date DESC
    LIMIT 7
  `, [userId]);

  if (recent.rows.length < 2) return;

  const rows = recent.rows;

  // Alert 1: Sustained low mood (3+ days with valence < -0.3)
  const recentThree = rows.slice(0, 3);
  if (recentThree.length >= 3 && recentThree.every(r => parseFloat(r.avg_valence) < -0.3)) {
    await createAlert(db, userId, {
      type: 'sustained_low_mood',
      severity: 'warning',
      message: 'Mood has been consistently low for 3 consecutive sessions',
      data: { sessions: recentThree.map(r => ({ date: r.session_date, valence: r.avg_valence })) },
    });
  }

  // Alert 2: Sudden drop (valence drops > 0.5 from previous)
  if (rows.length >= 2) {
    const today = parseFloat(rows[0].avg_valence);
    const yesterday = parseFloat(rows[1].avg_valence);
    if (yesterday - today > 0.5) {
      await createAlert(db, userId, {
        type: 'sudden_drop',
        severity: 'urgent',
        message: 'Significant mood drop detected',
        data: { from: yesterday, to: today, date: rows[0].session_date },
      });
    }
  }

  // Alert 3: Recurring concern topic (3+ times in a week)
  const allTriggers = rows.flatMap(r => r.key_triggers || []);
  const triggerCounts = {};
  allTriggers.forEach(t => { triggerCounts[t] = (triggerCounts[t] || 0) + 1; });
  
  for (const [trigger, count] of Object.entries(triggerCounts)) {
    if (count >= 3) {
      await createAlert(db, userId, {
        type: 'recurring_concern',
        severity: 'monitor',
        message: `"${trigger}" has been mentioned ${count} times this week`,
        data: { trigger, count },
      });
    }
  }
}

/**
 * Create an alert (avoiding duplicates within 24 hours).
 */
async function createAlert(db, userId, alert) {
  // Check for recent duplicate
  const existing = await db.query(`
    SELECT id FROM emotion_alerts
    WHERE user_id = $1 AND alert_type = $2
      AND created_at > NOW() - INTERVAL '24 hours'
      AND resolved = false
    LIMIT 1
  `, [userId, alert.type]);

  if (existing.rows.length > 0) return; // Already alerted recently

  await db.query(`
    INSERT INTO emotion_alerts (user_id, alert_type, severity, message, data)
    VALUES ($1, $2, $3, $4, $5)
  `, [userId, alert.type, alertSeverityToDb(alert.severity), alert.message, alert.data]);
}

module.exports = {
  parseEmotionFromResponse,
  saveEmotionTurn,
  summarizeSessionEmotions,
  checkAlertConditions,
};
