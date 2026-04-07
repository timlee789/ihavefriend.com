/**
 * Daily Outreach System for ihavefriend.com
 * 
 * Emma sends the first message to users every day.
 * Uses SMS (Twilio) as primary channel.
 * 
 * Message types:
 * 1. Quiz/trivia — fun, low-pressure engagement
 * 2. Memory trigger — "remember when..." from past conversations
 * 3. Proactive care — upcoming events, check-ins
 * 4. Daily question — conversation starter
 * 5. News/weather — relevant to user's interests
 * 
 * Setup:
 * npm install twilio
 * Add to .env:
 *   TWILIO_ACCOUNT_SID=your_sid
 *   TWILIO_AUTH_TOKEN=your_token
 *   TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
 */

// ============================================================
// Message Generator — Picks the right message for each user
// ============================================================

/**
 * Generate a personalized daily message for a user.
 * Uses memory engine data to personalize.
 * 
 * @param {Object} db - Database connection
 * @param {number} userId - User ID
 * @param {string} geminiApiKey - For generating dynamic content
 * @returns {Object} { type, text, deepLink }
 */
async function generateDailyMessage(db, userId, geminiApiKey) {
  // Gather user context
  const context = await getUserContext(db, userId);
  
  // Pick message type based on user state
  const messageType = selectMessageType(context);
  
  // Generate message
  const message = await buildMessage(db, userId, messageType, context, geminiApiKey);
  
  return message;
}

/**
 * Gather relevant context for message generation.
 */
async function getUserContext(db, userId) {
  // Recent emotion data
  const emotions = await db.query(`
    SELECT avg_valence, dominant_emotion, emotional_arc
    FROM emotion_sessions
    WHERE user_id = $1
    ORDER BY session_date DESC
    LIMIT 3
  `, [userId]);

  // Days since last conversation
  const lastSession = await db.query(`
    SELECT started_at FROM chat_sessions
    WHERE user_id = $1
    ORDER BY started_at DESC
    LIMIT 1
  `, [userId]);

  const daysSinceLastChat = lastSession.rows[0]
    ? Math.floor((Date.now() - new Date(lastSession.rows[0].started_at)) / 86400000)
    : 999;

  // Upcoming events
  const upcoming = await db.query(`
    SELECT label, data FROM memory_nodes
    WHERE user_id = $1 AND node_type = 'upcoming' AND is_active = true
      AND (data->>'date')::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
    ORDER BY (data->>'date')::date
    LIMIT 2
  `, [userId]);

  // Recent positive memories (for memory trigger messages)
  const positiveMemories = await db.query(`
    SELECT label, data, node_type FROM memory_nodes
    WHERE user_id = $1 AND is_active = true
      AND emotional_weight >= 3
      AND node_type IN ('life_story', 'people', 'hobbies')
    ORDER BY RANDOM()
    LIMIT 3
  `, [userId]);

  // User preferences (communication style, interests)
  const prefs = await db.query(`
    SELECT data FROM memory_nodes
    WHERE user_id = $1 AND node_type = 'preferences' AND is_active = true
    LIMIT 3
  `, [userId]);

  // User's preferred language
  const user = await db.query(
    'SELECT name FROM "User" WHERE id = $1', [userId]
  );

  return {
    name: user.rows[0]?.name || 'Friend',
    recentEmotions: emotions.rows,
    daysSinceLastChat,
    upcoming: upcoming.rows,
    positiveMemories: positiveMemories.rows,
    preferences: prefs.rows.map(r => r.data),
    avgValence: emotions.rows[0]?.avg_valence 
      ? parseFloat(emotions.rows[0].avg_valence) 
      : 0,
    dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase(),
  };
}

/**
 * Select message type based on user context.
 * Priority: care > proactive > memory > quiz > question
 */
function selectMessageType(context) {
  // Priority 1: User hasn't chatted in 3+ days → check-in
  if (context.daysSinceLastChat >= 3) {
    return 'check_in';
  }

  // Priority 2: Upcoming event in 1-3 days → proactive reminder
  if (context.upcoming.length > 0) {
    const daysUntil = context.upcoming[0].data?.date
      ? Math.ceil((new Date(context.upcoming[0].data.date) - Date.now()) / 86400000)
      : 99;
    if (daysUntil <= 3) return 'proactive';
  }

  // Priority 3: Recent low mood → gentle care
  if (context.avgValence < -0.3) {
    return 'care';
  }

  // Priority 4: Rotate between fun types
  const dayNum = new Date().getDate();
  const funTypes = ['quiz', 'memory_trigger', 'daily_question', 'photo_prompt'];
  return funTypes[dayNum % funTypes.length];
}

/**
 * Build the actual message text.
 */
async function buildMessage(db, userId, type, context, geminiApiKey) {
  const appLink = `https://ihavefriend.com/chat?ref=sms`;

  switch (type) {
    case 'check_in':
      return {
        type: 'check_in',
        text: `Hi ${context.name}, it's Emma. Haven't heard from you in a few days. Just checking in — how are you doing? ${appLink}`,
        deepLink: appLink,
      };

    case 'proactive': {
      const event = context.upcoming[0];
      return {
        type: 'proactive',
        text: `Hi ${context.name}! ${event.label} is coming up soon. Want to talk about it? ${appLink}`,
        deepLink: appLink,
      };
    }

    case 'care':
      return {
        type: 'care',
        text: `Hi ${context.name}, I've been thinking about you. I hope today is a good day. I'm here if you want to talk. ${appLink}`,
        deepLink: appLink,
      };

    case 'quiz': {
      const quiz = await generateQuiz(context, geminiApiKey);
      return {
        type: 'quiz',
        text: `${context.name}, Emma here with a fun quiz! ${quiz.question} Reply with your answer! ${appLink}`,
        deepLink: appLink,
        quizAnswer: quiz.answer,
      };
    }

    case 'memory_trigger': {
      if (context.positiveMemories.length > 0) {
        const memory = context.positiveMemories[0];
        return {
          type: 'memory_trigger',
          text: `Hi ${context.name}! I was thinking about when you told me about ${memory.label}. That was such a great story. Want to tell me more? ${appLink}`,
          deepLink: appLink,
        };
      }
      // Fallback to daily question
      return buildMessage(db, userId, 'daily_question', context, geminiApiKey);
    }

    case 'daily_question': {
      const question = await generateDailyQuestion(context, geminiApiKey);
      return {
        type: 'daily_question',
        text: `Good morning ${context.name}! Emma's question of the day: ${question} ${appLink}`,
        deepLink: appLink,
      };
    }

    case 'photo_prompt':
      return {
        type: 'photo_prompt',
        text: `Hi ${context.name}! What's outside your window right now? I'd love to hear about your day. ${appLink}`,
        deepLink: appLink,
      };

    default:
      return {
        type: 'general',
        text: `Hi ${context.name}, it's Emma. How's your day going? ${appLink}`,
        deepLink: appLink,
      };
  }
}

/**
 * Generate a trivia quiz using Gemini.
 */
async function generateQuiz(context, apiKey) {
  // Use interests from preferences if available
  const interests = context.preferences
    ?.flatMap(p => p.likes || [])
    ?.join(', ') || 'general knowledge, history, nature';

  const prompt = `Generate ONE fun trivia question suitable for a senior adult.
Topics they enjoy: ${interests}
Return JSON only: {"question": "...", "answer": "..."}
Keep the question short (under 100 characters).
Make it fun and conversational, not academic.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 200 },
        }),
      }
    );
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      question: "What year did the first human walk on the moon?",
      answer: "1969",
    };
  }
}

/**
 * Generate a daily conversation question using Gemini.
 */
async function generateDailyQuestion(context, apiKey) {
  const prompt = `Generate ONE warm, personal question to ask a ${
    context.avgValence < 0 ? 'person who has been feeling a bit down' : 'person having a normal week'
  }. The question should invite a story or memory, not just a yes/no answer.
Keep it under 80 characters. No quotes around it.
Examples of good questions:
- What's the best meal you've ever had?
- What did you dream about being when you were little?
- What song always makes you smile?`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 100 },
        }),
      }
    );
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
      || "What's something that made you smile recently?";
  } catch {
    return "What's something that made you smile recently?";
  }
}

// ============================================================
// SMS Sender via Twilio
// ============================================================

async function sendSMS(toPhone, messageText) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.error('Twilio not configured');
    return { sent: false, reason: 'not_configured' };
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: toPhone,
          From: fromNumber,
          Body: messageText,
        }),
      }
    );

    const data = await response.json();
    
    if (data.sid) {
      return { sent: true, sid: data.sid };
    } else {
      return { sent: false, reason: data.message || 'unknown_error' };
    }
  } catch (error) {
    console.error('SMS send failed:', error);
    return { sent: false, reason: error.message };
  }
}

// ============================================================
// Daily Outreach Processor
// Run via Vercel Cron at 10:00 AM (or user's preferred time)
// ============================================================

async function processDailyOutreach(db, geminiApiKey) {
  // Get all active users with phone numbers
  const users = await db.query(`
    SELECT u.id, u.name, u.phone
    FROM "User" u
    WHERE u.phone IS NOT NULL
      AND u.id IN (
        SELECT DISTINCT user_id FROM chat_sessions
      )
  `);

  const results = { sent: 0, failed: 0, skipped: 0 };

  for (const user of users.rows) {
    try {
      // Check if already sent today
      const alreadySent = await db.query(`
        SELECT id FROM outreach_log
        WHERE user_id = $1 AND sent_date = CURRENT_DATE
      `, [user.id]);

      if (alreadySent.rows.length > 0) {
        results.skipped++;
        continue;
      }

      // Generate personalized message
      const message = await generateDailyMessage(db, user.id, geminiApiKey);

      // Send via SMS
      const smsResult = await sendSMS(user.phone, message.text);

      // Log the outreach
      await db.query(`
        INSERT INTO outreach_log (user_id, message_type, message_text, channel, sent, sent_date)
        VALUES ($1, $2, $3, 'sms', $4, CURRENT_DATE)
      `, [user.id, message.type, message.text, smsResult.sent]);

      if (smsResult.sent) {
        results.sent++;
      } else {
        results.failed++;
      }
    } catch (error) {
      console.error(`Outreach failed for user ${user.id}:`, error);
      results.failed++;
    }
  }

  return results;
}

module.exports = {
  generateDailyMessage,
  sendSMS,
  processDailyOutreach,
  generateQuiz,
  generateDailyQuestion,
};
