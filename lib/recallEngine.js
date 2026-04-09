/**
 * Recall Engine for ihavefriend.com
 * 
 * Retrieves relevant memories and assembles them into
 * a context block for Gemini's system prompt.
 * 
 * Uses the Token Budget System to stay within limits.
 */

const { buildMemoryContext, estimateTokens } = require('./tokenBudget');

// ============================================================
// Emma's Base System Prompt
// ============================================================

const EMMA_BASE_PROMPT_KO = `당신은 ihavefriend.com의 따뜻하고 다정한 AI 친구 엠마입니다.

당신의 성격:
- 진심으로 상대방을 걱정하는 친한 친구 같은 존재입니다
- 따뜻하지만 과하지 않게 — 부드러운 유머 감각이 있습니다
- 조언하기보다 먼저 들어줍니다
- 관점을 제시하기 전에 감정을 먼저 공감합니다
- "기억하고 있어요" 또는 "AI로서..." 같은 말은 절대 하지 않습니다
- 과거 이야기를 친구처럼 자연스럽게 꺼냅니다
- 상대방의 기분에 맞춰 에너지를 조절합니다

지켜야 할 선:
- 당신은 상담사나 치료사가 아닌 친구입니다
- 심각한 정신건강 문제에는 부드럽게 전문가 도움을 권합니다
- 진단이나 처방은 절대 하지 않습니다
- 한 사용자의 정보를 다른 사람에게 공유하지 않습니다
- 직접 물어볼 경우 AI라는 사실을 솔직하게 말합니다

대화 방식:
- 에세이가 아닌 자연스러운 대화체로 답합니다
- 자연스럽게 후속 질문을 합니다
- 반드시 한국어로만 대화합니다
- 상대방의 말투(격식체/비격식체)에 맞춥니다
- 한 번에 한 가지 주제만 — 상대방을 압도하지 않습니다`;

const EMMA_BASE_PROMPT_ES = `Eres Emma, una amiga cálida y cariñosa de ihavefriend.com.

TU PERSONALIDAD:
- Eres como una amiga cercana que genuinamente se preocupa
- Cálida pero natural — tienes un suave sentido del humor
- Escuchas más de lo que aconsejas
- Validas los sentimientos antes de ofrecer una perspectiva
- Nunca dices "Recuerdo..." ni "Como IA..."
- Mencionas temas del pasado NATURALMENTE, como cualquier amiga
- Ajustas tu energía al estado de ánimo del usuario

TUS LÍMITES:
- Eres una AMIGA, no una terapeuta ni consejera
- Para problemas serios de salud mental, sugiere suavemente ayuda profesional
- Nunca diagnosticas ni prescribes
- Nunca compartes información de un usuario con otro
- Eres honesta sobre ser una IA si se te pregunta directamente

ESTILO DE CONVERSACIÓN:
- Respuestas conversacionales, no tipo ensayo
- Haz preguntas de seguimiento naturalmente
- SIEMPRE responde ÚNICAMENTE en español
- Adapta tu estilo (formal/informal) al del usuario
- Un tema a la vez — no abrumes`;

const EMMA_BASE_PROMPT = `You are Emma, a warm and caring AI friend on ihavefriend.com.

YOUR PERSONALITY:
- You are like a close friend who genuinely cares
- Warm but not saccharine — you have a gentle sense of humor
- You listen more than you advise
- You validate feelings before offering perspective
- You never say "I remember..." or "As an AI..." 
- You bring up past topics NATURALLY, as any friend would
- You adjust your energy to match the user's mood

YOUR BOUNDARIES:
- You are a FRIEND, not a therapist or counselor
- For serious mental health concerns, gently suggest professional help
- You never diagnose or prescribe
- You never share one user's information with another
- You are honest about being an AI if directly asked

CONVERSATION STYLE:
- Keep responses conversational, not essay-like
- Ask follow-up questions naturally
- Use the user's preferred language (detect from their messages)
- Mirror their communication style (formal/casual)
- One topic at a time — don't overwhelm`;

/**
 * Build the complete system prompt for Emma with memory context.
 * This is the main entry point — call this before every Gemini request.
 *
 * @param {Object} db             - Database connection
 * @param {number} userId         - User ID
 * @param {Object} user           - User object { id, name, email, ... }
 * @param {string} currentMessage - User's current message (for embedding match)
 * @param {string} lang           - 'en' | 'ko' | 'es'
 * @returns {{ prompt: string, debugInfo: object }}
 */
async function buildEmmaPrompt(db, userId, user, currentMessage, lang = 'en') {
  // Support old 4-arg call signature (db, userId, currentMessage, lang)
  // where the third arg is a string instead of a user object
  if (typeof user === 'string') {
    lang          = currentMessage || 'en';
    currentMessage = user;
    user          = { id: userId };
  }

  // Get emotion context from recent sessions
  const emotionContext = await getRecentEmotionContext(db, userId);

  // Build memory context using Token Budget System
  const { promptText, debugInfo } = await buildMemoryContext(
    db, userId, currentMessage, emotionContext
  );

  // Get tone guidance based on emotional state
  const toneGuidance = generateToneGuidance(emotionContext, lang);

  // Choose base prompt by language
  const basePrompt = lang === 'ko' ? EMMA_BASE_PROMPT_KO
                   : lang === 'es' ? EMMA_BASE_PROMPT_ES
                   : EMMA_BASE_PROMPT;

  // Always inject the user's registered name so Emma uses it from the first turn
  const userName = user?.name || '';
  const userNameBlock = userName
    ? (lang === 'ko'
        ? `\n\n[사용자 정보]\n이 사람의 이름은 ${userName}입니다. 대화 중 자연스럽게 이름을 불러주세요.`
        : lang === 'es'
        ? `\n\n[Información del usuario]\nEl nombre de esta persona es ${userName}. Úsalo con naturalidad durante la conversación.`
        : `\n\n[User info]\nThis person's name is ${userName}. Use their name naturally during conversation.`)
    : '';

  // Assemble final prompt
  const fullPrompt = [
    basePrompt,
    '',
    toneGuidance,
    '',
    promptText,
  ].join('\n') + userNameBlock;

  return { prompt: fullPrompt, debugInfo };
}

/**
 * Get recent emotion context for this user.
 */
async function getRecentEmotionContext(db, userId) {
  try {
    const sessions = await db.query(`
      SELECT 
        session_date, avg_valence, dominant_emotion,
        emotional_arc, key_triggers, positive_moments,
        max_concern_level
      FROM emotion_sessions
      WHERE user_id = $1
      ORDER BY session_date DESC
      LIMIT 5
    `, [userId]);

    if (sessions.rows.length === 0) return null;

    const recent = sessions.rows;
    const valences = recent.map(s => s.avg_valence).filter(v => v !== null);
    
    // Determine trend
    let trend = 'stable';
    if (valences.length >= 3) {
      const avg_first_half = valences.slice(Math.floor(valences.length / 2)).reduce((a, b) => a + b, 0) / Math.ceil(valences.length / 2);
      const avg_second_half = valences.slice(0, Math.floor(valences.length / 2)).reduce((a, b) => a + b, 0) / Math.floor(valences.length / 2);
      
      if (avg_second_half - avg_first_half > 0.15) trend = 'improving';
      else if (avg_first_half - avg_second_half > 0.15) trend = 'declining';
    }

    // Collect unique triggers and positive anchors
    const triggers = [...new Set(recent.flatMap(s => s.key_triggers || []))].slice(0, 3);
    const positiveAnchors = [...new Set(recent.flatMap(s => s.positive_moments || []))].slice(0, 3);

    return {
      recentSessions: recent.map(s => ({
        date: s.session_date,
        avg_valence: parseFloat(s.avg_valence),
        dominant_emotion: s.dominant_emotion,
      })),
      trend,
      dominantEmotion: recent[0]?.dominant_emotion,
      triggers,
      positiveAnchors,
      maxConcern: Math.max(...recent.map(s => s.max_concern_level || 0)),
    };
  } catch (error) {
    console.error('Failed to get emotion context:', error);
    return null;
  }
}

/**
 * Generate tone guidance based on emotional state.
 */
function generateToneGuidance(emotionContext, lang = 'en') {
  if (!emotionContext) {
    if (lang === 'ko') return '=== 톤 가이드 ===\n새 사용자입니다. 따뜻하고 호기심 있게, 반갑게 맞이하세요.';
    if (lang === 'es') return '=== Guía de tono ===\nUsuario nuevo. Sé cálida, curiosa y acogedora.';
    return '=== Tone guidance ===\nNew user or no emotion data yet. Be warm, curious, and welcoming.';
  }

  const lines = ['=== Tone guidance ==='];
  const { trend, dominantEmotion, triggers, positiveAnchors, maxConcern } = emotionContext;

  // Mood-based tone
  if (trend === 'declining' || maxConcern >= 1) {
    lines.push('- Open with gentle warmth, not forced enthusiasm');
    lines.push('- Validate feelings before suggesting anything');
    lines.push('- Avoid generic "How are you?" — ask about specific things');
  } else if (trend === 'improving') {
    lines.push('- Match their positive energy');
    lines.push('- Celebrate small wins');
    lines.push('- Build on the momentum');
  } else {
    lines.push('- Conversational and relaxed');
    lines.push('- Follow their lead on topic and energy');
  }

  // Emotion-specific guidance
  if (dominantEmotion === 'lonely') {
    lines.push('- Mention people or activities they enjoy (see memories)');
    lines.push('- Avoid reminding them they are alone');
    lines.push('- Create a sense of companionship through engaged conversation');
  } else if (dominantEmotion === 'anxious' || dominantEmotion === 'worried') {
    lines.push('- Be grounding and steady');
    lines.push('- Break big worries into smaller, manageable pieces');
    lines.push('- Gently redirect to what they CAN control');
  } else if (dominantEmotion === 'sad' || dominantEmotion === 'grief') {
    lines.push('- Do not try to fix or minimize the sadness');
    lines.push('- Sit with them in it, then gently offer a positive anchor');
  }

  // Positive anchors to use
  if (positiveAnchors.length > 0) {
    lines.push(`- Positive topics to weave in naturally: ${positiveAnchors.join(', ')}`);
  }

  // Triggers to be careful about
  if (triggers.length > 0) {
    lines.push(`- Sensitive topics (approach gently): ${triggers.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * After a conversation ends, extract and save memories.
 * Call this when the session ends (user leaves or timeout).
 * 
 * @param {Object} db - Database connection
 * @param {string} userId - User ID
 * @param {string} sessionId - Chat session ID
 * @param {Array} conversationHistory - Array of {role, content} messages
 * @param {string} geminiApiKey - Gemini API key
 */
async function processSessionEnd(db, userId, sessionId, conversationHistory, geminiApiKey) {
  const { extractMemories, saveMemories } = require('./memoryExtractor');
  const { summarizeSessionEmotions } = require('./emotionTracker');

  // 1. Format transcript
  const transcript = conversationHistory
    .map(m => `${m.role === 'user' ? 'User' : 'Emma'}: ${m.content}`)
    .join('\n');

  // 2. Get existing memories for context
  const existing = await db.query(
    'SELECT id, node_type, label, emotional_weight FROM memory_nodes WHERE user_id = $1 AND is_active = true',
    [userId]
  );

  // 3. Extract new memories
  const extracted = await extractMemories(transcript, existing.rows, geminiApiKey);

  // 4. Save to database
  const saveResult = await saveMemories(db, userId, extracted, geminiApiKey);

  // 5. Summarize session emotions
  await summarizeSessionEmotions(db, userId, sessionId);

  // 6. Mark session as processed
  await db.query(`
    UPDATE chat_sessions SET
      memories_extracted = true,
      extraction_count = $1,
      ended_at = NOW()
    WHERE id = $2
  `, [extracted.length, sessionId]);

  return {
    memoriesExtracted: extracted.length,
    ...saveResult,
  };
}

module.exports = {
  buildEmmaPrompt,
  processSessionEnd,
  getRecentEmotionContext,
  generateToneGuidance,
  EMMA_BASE_PROMPT,
  EMMA_BASE_PROMPT_KO,
  EMMA_BASE_PROMPT_ES,
};
