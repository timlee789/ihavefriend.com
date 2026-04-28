/**
 * Token Budget System for sayandkeep.com
 *
 * The gatekeeper that controls which memories get injected
 * into every Gemini conversation prompt.
 *
 * Budget: 800 tokens (configurable)
 * Phase 1 (31%): Always-on — people, health, emotion core
 * Phase 2 (44%): Context-matched — vector similarity + graph
 * Phase 3 (15%): Proactive — upcoming events, time-aware
 * Phase 4 (10%): Background — identity, preferences, routine
 *
 * 2026-04-23 v2 schema migration:
 *  - Only change: confidence != 'low' → parameterized + cast via enumMappers
 *  - node_type is VARCHAR(20), NOT an enum — no conversion needed for those queries
 *  - categoryPhaseMap and extractEssentials() switch are JS-only, not DB — untouched
 */

const {
  confidenceToDb,
} = require('./enumMappers');

// ============================================================
// Configuration
// ============================================================

// 🔥 Task 52 #4 (2026-04-28): cut total budget 800 → 400 tokens and
//   trim per-phase memory caps. Tim's first 4-turn beta test produced
//   a 11,128-character system prompt — memory + story context drowned
//   the personality so the new TYPE A/B rules were ignored. Halving
//   the memory injection brings the prompt back under ~7,000 chars
//   and lets the personality dominate. Memory still works; we just
//   stop pre-loading the model with 30 facts it might never use.
const BUDGET_CONFIG = {
  totalTokens: 400,
  phases: {
    alwaysOn:       { ratio: 0.31, maxMemories: 4  },
    contextual:     { ratio: 0.44, maxMemories: 3  },
    proactive:      { ratio: 0.15, maxMemories: 1  },
    background:     { ratio: 0.10, maxMemories: 2  },
  },
  // Categories mapped to phases
  categoryPhaseMap: {
    // Phase 1: Always-on
    people:           'alwaysOn',
    health:           'alwaysOn',
    emotion:          'alwaysOn',
    // Phase 2: Context-matched (selected dynamically)
    work_career:      'contextual',
    finance:          'contextual',
    hobbies:          'contextual',
    goals:            'contextual',
    social_life:      'contextual',
    life_story:       'contextual',
    living_situation: 'contextual',
    // Phase 3: Proactive
    upcoming:         'proactive',
    // Phase 4: Background
    identity:         'background',
    routine:          'background',
    preferences:      'background',
  },
};

// ============================================================
// Token Estimation
// ============================================================

/**
 * Estimate token count from text.
 * Rough but sufficient: ~4 chars per token for English,
 * ~2 chars per token for Korean/CJK.
 */
function estimateTokens(text) {
  if (!text) return 0;
  
  // Count CJK characters
  const cjkChars = (text.match(/[\u3000-\u9fff\uac00-\ud7af]/g) || []).length;
  const nonCjkChars = text.length - cjkChars;
  
  return Math.ceil(nonCjkChars / 4 + cjkChars / 2);
}

/**
 * Compress a memory node into a concise text representation.
 * This is what actually gets injected into the prompt.
 */
function compressMemory(node) {
  const { label, node_type, data, emotional_weight, mention_count } = node;
  
  // Extract only the most important fields from data
  const essentials = extractEssentials(node_type, data);
  
  return `[${node_type}] ${label}: ${essentials}`;
}

/**
 * Extract essential info per category to minimize tokens.
 * Each category has different "must-have" fields.
 */
function extractEssentials(nodeType, data) {
  switch (nodeType) {
    case 'people':
      return [
        data.relationship,
        data.name || 'name unknown',
        data.traits?.join(', '),
        data.last_topic,
      ].filter(Boolean).join(' — ');

    case 'health':
      return [
        data.condition,
        data.severity && `(${data.severity})`,
        data.medications?.join(', '),
        data.affects_daily && 'affects daily life',
      ].filter(Boolean).join(' — ');

    case 'emotion':
      return [
        data.dominant_mood || data.sub_type,
        data.trigger,
        data.recurring && 'recurring pattern',
        data.intensity && `intensity ${data.intensity}/5`,
      ].filter(Boolean).join(' — ');

    case 'work_career':
      return [
        data.occupation || data.status,
        data.career_anxiety,
        data.side_hustle,
      ].filter(Boolean).join(' — ');

    case 'finance':
      return [
        data.primary_concern,
        data.stress_level && `stress ${data.stress_level}/5`,
        data.saving_goals?.slice(0, 2).join(', '),
      ].filter(Boolean).join(' — ');

    case 'hobbies':
      return [
        data.activity,
        data.skill_level,
        data.dream_project,
        data.motivation,
      ].filter(Boolean).join(' — ');

    case 'goals':
      return [
        data.goal,
        data.progress,
        data.blockers?.join(', '),
        data.accountability_wanted && 'wants check-ins',
      ].filter(Boolean).join(' — ');

    case 'social_life':
      return [
        data.social_frequency,
        data.dating_status,
        data.social_barriers?.join(', '),
      ].filter(Boolean).join(' — ');

    case 'life_story':
      return [
        data.event || data.sub_type,
        data.cherished_memory,
        data.emotional_weight && `weight ${data.emotional_weight}/5`,
      ].filter(Boolean).join(' — ');

    case 'upcoming':
      return [
        data.what || data.whose,
        data.date,
        data.plans,
        data.anxiety,
      ].filter(Boolean).join(' — ');

    case 'identity':
      return [
        data.religion,
        data.importance && `importance ${data.importance}/5`,
        data.comfort_source && 'source of comfort',
      ].filter(Boolean).join(' — ');

    case 'routine':
      return [
        data.daily,
        data.notable_patterns,
      ].filter(Boolean).join(' — ');

    case 'preferences':
      return [
        data.likes?.slice(0, 3).join(', '),
        data.dislikes?.slice(0, 2).map(d => `avoid: ${d}`).join(', '),
        data.communication_style,
      ].filter(Boolean).join(' — ');

    case 'living_situation':
      return [
        data.type,
        data.pets?.map(p => `${p.type} ${p.name}`).join(', '),
        data.feels_about_space,
      ].filter(Boolean).join(' — ');

    default:
      return JSON.stringify(data).slice(0, 100);
  }
}

// ============================================================
// Phase 1: Always-On Memories
// ============================================================

/**
 * Get memories that are ALWAYS included regardless of conversation topic.
 * These define who the user IS to the AI friend.
 * 
 * Selection: emotional_weight >= 3 OR mention_count >= 5
 * Categories: people, health, emotion
 */
async function getAlwaysOnMemories(db, userId, budget) {
  const rows = await db.query(`
    SELECT 
      id, label, node_type, data, 
      emotional_weight, mention_count, last_mentioned
    FROM memory_nodes
    WHERE user_id = $1
      AND node_type IN ('people', 'health', 'emotion')
      AND is_active = true
      AND (emotional_weight >= 3 OR mention_count >= 5)
    ORDER BY 
      emotional_weight DESC,
      mention_count DESC,
      last_mentioned DESC
    LIMIT $2
  `, [userId, BUDGET_CONFIG.phases.alwaysOn.maxMemories]);

  return selectWithinBudget(rows.rows, budget);
}

// ============================================================
// Phase 2: Context-Matched Memories
// ============================================================

/**
 * Get memories relevant to the CURRENT conversation message.
 * Uses two strategies and merges results:
 * 
 * Strategy A: Vector similarity search (semantic match)
 * Strategy B: Graph traversal (follow edges from anchor nodes)
 */
async function getContextualMemories(db, userId, currentMessage, budget) {
  // Strategy A: Vector similarity
  const vectorResults = await vectorSimilaritySearch(
    db, userId, currentMessage, 5
  );

  // Strategy B: Find anchor nodes in message, then traverse graph
  const anchorNodes = await findAnchorsInMessage(db, userId, currentMessage);
  const graphResults = await traverseGraph(db, userId, anchorNodes, 2); // 2-hop

  // Merge and deduplicate, keeping highest score
  const merged = mergeAndRank(vectorResults, graphResults);

  // Filter out always-on categories (already included in Phase 1)
  const filtered = merged.filter(m => 
    !['people', 'health', 'emotion'].includes(m.node_type) ||
    m.emotional_weight < 3 // Include low-weight people/health if relevant
  );

  return selectWithinBudget(filtered, budget);
}

/**
 * Vector similarity search using pgvector.
 * Finds memories semantically similar to current message.
 */
async function vectorSimilaritySearch(db, userId, message, limit) {
  try {
    const embedding = await getEmbedding(message);

    // Skip vector search if placeholder (all zeros) — no real embedding available
    const isPlaceholder = embedding.every(v => v === 0);
    if (isPlaceholder) return [];

    // pgvector requires format: '[0.1,0.2,...]'
    const vectorLiteral = `[${embedding.join(',')}]`;

    const rows = await db.query(`
      SELECT
        mn.id, mn.label, mn.node_type, mn.data,
        mn.emotional_weight, mn.mention_count,
        1 - (me.embedding <=> $2::vector) AS similarity
      FROM memory_embeddings me
      JOIN memory_nodes mn ON mn.id = me.memory_id
      WHERE me.user_id = $1
        AND mn.is_active = true
      ORDER BY me.embedding <=> $2::vector
      LIMIT $3
    `, [userId, vectorLiteral, limit]);

    return rows.rows.map(r => ({
      ...r,
      relevance_score: r.similarity * (1 + r.emotional_weight * 0.2),
      source: 'vector',
    }));
  } catch (e) {
    console.error('[vectorSimilaritySearch] skipped:', e.message);
    return [];
  }
}

/**
 * Find nodes mentioned or implied in the current message.
 * Uses simple keyword matching + fuzzy matching.
 */
async function findAnchorsInMessage(db, userId, message) {
  const messageLower = message.toLowerCase();
  
  const rows = await db.query(`
    SELECT id, label, node_type, emotional_weight
    FROM memory_nodes
    WHERE user_id = $1 AND is_active = true
  `, [userId]);

  return rows.rows.filter(node => {
    const labelLower = node.label.toLowerCase();
    // Direct mention
    if (messageLower.includes(labelLower)) return true;
    // Check data fields for names/keywords
    // (In production, use Gemini to extract entities first)
    return false;
  });
}

/**
 * Traverse memory graph from anchor nodes.
 * Follows edges up to maxHops, weighted by edge strength.
 */
async function traverseGraph(db, userId, anchorNodes, maxHops = 2) {
  if (anchorNodes.length === 0) return [];

  const anchorIds = anchorNodes.map(n => n.id);
  const visited = new Set(anchorIds);
  let currentLayer = anchorIds;
  const results = [];

  for (let hop = 0; hop < maxHops; hop++) {
    if (currentLayer.length === 0) break;

    const neighbors = await db.query(`
      SELECT 
        mn.id, mn.label, mn.node_type, mn.data,
        mn.emotional_weight, mn.mention_count,
        me.weight AS edge_weight,
        me.relationship
      FROM memory_edges me
      JOIN memory_nodes mn ON mn.id = me.target_node
      WHERE me.source_node = ANY($1)
        AND me.user_id = $2
        AND mn.is_active = true
        AND me.weight > 0.2
      ORDER BY me.weight DESC
    `, [currentLayer, userId]);

    const nextLayer = [];
    for (const neighbor of neighbors.rows) {
      if (!visited.has(neighbor.id)) {
        visited.add(neighbor.id);
        // Score decays with each hop
        const hopDecay = 1 / (hop + 1);
        results.push({
          ...neighbor,
          relevance_score: neighbor.edge_weight * neighbor.emotional_weight * hopDecay,
          source: 'graph',
          hop: hop + 1,
        });
        nextLayer.push(neighbor.id);
      }
    }
    currentLayer = nextLayer;
  }

  return results.sort((a, b) => b.relevance_score - a.relevance_score);
}

// ============================================================
// Phase 3: Proactive (Time-Triggered) Memories
// ============================================================

/**
 * Get upcoming events and time-relevant memories.
 * "Jake's birthday in 3 days" or "choir practice tonight"
 */
async function getProactiveMemories(db, userId, budget) {
  const now = new Date();
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const hour = now.getHours();

  // Upcoming events within 7 days
  const upcoming = await db.query(`
    SELECT 
      id, label, node_type, data, emotional_weight
    FROM memory_nodes
    WHERE user_id = $1
      AND node_type = 'upcoming'
      AND is_active = true
      AND (data->>'date')::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
    ORDER BY (data->>'date')::date ASC
    LIMIT 3
  `, [userId]);

  // Current time-slot routine matches
  const routine = await db.query(`
    SELECT 
      id, label, node_type, data, emotional_weight
    FROM memory_nodes
    WHERE user_id = $1
      AND node_type = 'routine'
      AND is_active = true
      AND (
        data->>'daily' IS NOT NULL
        OR data->>$2 IS NOT NULL
      )
    LIMIT 2
  `, [userId, dayOfWeek]);

  // Calculate days until event for urgency scoring
  const scored = [...upcoming.rows, ...routine.rows].map(node => {
    let urgency = 1;
    if (node.node_type === 'upcoming' && node.data.date) {
      const daysUntil = Math.ceil(
        (new Date(node.data.date) - now) / (1000 * 60 * 60 * 24)
      );
      urgency = daysUntil <= 1 ? 5 : daysUntil <= 3 ? 3 : 1;
    }
    return {
      ...node,
      relevance_score: urgency * (node.emotional_weight || 1),
      source: 'proactive',
    };
  });

  return selectWithinBudget(
    scored.sort((a, b) => b.relevance_score - a.relevance_score),
    budget
  );
}

// ============================================================
// Phase 4: Background Enrichment
// ============================================================

/**
 * Get identity/preferences/living info for tone calibration.
 * Only included if budget remains after phases 1-3.
 */
async function getBackgroundMemories(db, userId, budget) {
  if (budget < 30) return { memories: [], tokensUsed: 0 };

  const rows = await db.query(`
    SELECT
      id, label, node_type, data, emotional_weight
    FROM memory_nodes
    WHERE user_id = $1
      AND node_type IN ('identity', 'preferences', 'living_situation')
      AND is_active = true
      AND confidence != $3::"Confidence"
    ORDER BY emotional_weight DESC, last_mentioned DESC
    LIMIT $2
  `, [
    userId,
    BUDGET_CONFIG.phases.background.maxMemories,
    confidenceToDb('low'),  // 'LOW'
  ]);

  return selectWithinBudget(rows.rows, budget);
}

// ============================================================
// Budget Controller — The Main Orchestrator
// ============================================================

/**
 * Build the complete memory context for a Gemini prompt.
 * This is the main entry point called before every AI response.
 * 
 * @param {Object} db - Database connection
 * @param {string} userId - User ID
 * @param {string} currentMessage - User's current message
 * @param {Object} emotionContext - Latest emotion data (from emotion tracker)
 * @returns {Object} { promptText, debugInfo }
 */
async function buildMemoryContext(db, userId, currentMessage, emotionContext = null) {
  const totalBudget = BUDGET_CONFIG.totalTokens;
  const debugInfo = { phases: [], totalTokensUsed: 0 };
  
  // Calculate phase budgets
  const budgets = {};
  for (const [phase, config] of Object.entries(BUDGET_CONFIG.phases)) {
    budgets[phase] = Math.floor(totalBudget * config.ratio);
  }

  // ---- Phase 1: Always-On ----
  const phase1 = await getAlwaysOnMemories(db, userId, budgets.alwaysOn);
  debugInfo.phases.push({
    name: 'always_on',
    budget: budgets.alwaysOn,
    used: phase1.tokensUsed,
    count: phase1.memories.length,
  });

  // ---- Phase 2: Context-Matched ----
  // Give phase 2 any surplus from phase 1
  const phase2Budget = budgets.contextual + (budgets.alwaysOn - phase1.tokensUsed);
  const phase2 = await getContextualMemories(
    db, userId, currentMessage, phase2Budget
  );
  debugInfo.phases.push({
    name: 'contextual',
    budget: phase2Budget,
    used: phase2.tokensUsed,
    count: phase2.memories.length,
  });

  // ---- Phase 3: Proactive ----
  const phase3Budget = budgets.proactive + (phase2Budget - phase2.tokensUsed);
  const phase3 = await getProactiveMemories(db, userId, phase3Budget);
  debugInfo.phases.push({
    name: 'proactive',
    budget: phase3Budget,
    used: phase3.tokensUsed,
    count: phase3.memories.length,
  });

  // ---- Phase 4: Background ----
  const phase4Budget = budgets.background + (phase3Budget - phase3.tokensUsed);
  const phase4 = await getBackgroundMemories(db, userId, phase4Budget);
  debugInfo.phases.push({
    name: 'background',
    budget: phase4Budget,
    used: phase4.tokensUsed,
    count: phase4.memories.length,
  });

  // ---- Emotion Context (separate, not counted in budget) ----
  const emotionBlock = emotionContext
    ? formatEmotionContext(emotionContext)
    : '';

  // ---- Assemble Final Prompt ----
  const promptText = assemblePrompt(
    phase1.memories,
    phase2.memories,
    phase3.memories,
    phase4.memories,
    emotionBlock
  );

  debugInfo.totalTokensUsed = 
    phase1.tokensUsed + phase2.tokensUsed + 
    phase3.tokensUsed + phase4.tokensUsed;

  return { promptText, debugInfo };
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Select memories that fit within a token budget.
 * Greedily adds memories in order until budget exhausted.
 */
function selectWithinBudget(memories, budget) {
  const selected = [];
  let tokensUsed = 0;

  for (const memory of memories) {
    const compressed = compressMemory(memory);
    const tokens = estimateTokens(compressed);

    if (tokensUsed + tokens <= budget) {
      selected.push({ ...memory, _compressed: compressed, _tokens: tokens });
      tokensUsed += tokens;
    }
  }

  return { memories: selected, tokensUsed };
}

/**
 * Merge vector search and graph traversal results.
 * Deduplicates by node ID, keeps the higher relevance score.
 */
function mergeAndRank(vectorResults, graphResults) {
  const map = new Map();

  for (const r of [...vectorResults, ...graphResults]) {
    const existing = map.get(r.id);
    if (!existing || r.relevance_score > existing.relevance_score) {
      map.set(r.id, r);
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.relevance_score - a.relevance_score);
}

/**
 * Format emotion context for prompt injection.
 */
function formatEmotionContext(ctx) {
  const lines = ['=== Emotional state ==='];
  
  if (ctx.recentSessions) {
    const scores = ctx.recentSessions.map(s => s.avg_valence.toFixed(1));
    lines.push(`Recent mood: ${scores.join(' → ')} (${ctx.trend || 'stable'})`);
  }
  if (ctx.dominantEmotion) {
    lines.push(`Dominant: ${ctx.dominantEmotion}`);
  }
  if (ctx.triggers && ctx.triggers.length > 0) {
    lines.push(`Triggers: ${ctx.triggers.join(', ')}`);
  }
  if (ctx.positiveAnchors && ctx.positiveAnchors.length > 0) {
    lines.push(`Comfort topics: ${ctx.positiveAnchors.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Assemble the final memory block for Gemini system prompt.
 */
function assemblePrompt(alwaysOn, contextual, proactive, background, emotionBlock) {
  const sections = [];

  if (alwaysOn.length > 0) {
    sections.push(
      '=== Core memories ===',
      ...alwaysOn.map(m => `- ${m._compressed}`)
    );
  }

  if (contextual.length > 0) {
    sections.push(
      '',
      '=== Relevant to current topic ===',
      ...contextual.map(m => `- ${m._compressed}`)
    );
  }

  if (proactive.length > 0) {
    sections.push(
      '',
      '=== Coming up soon ===',
      ...proactive.map(m => `- ${m._compressed}`)
    );
  }

  if (background.length > 0) {
    sections.push(
      '',
      '=== About this person ===',
      ...background.map(m => `- ${m._compressed}`)
    );
  }

  if (emotionBlock) {
    sections.push('', emotionBlock);
  }

  sections.push(
    '',
    '=== Instructions ===',
    'Use these memories NATURALLY in conversation.',
    'Never list or recite them. Never say "I remember that..."',
    'Instead, weave them into responses as a close friend would.',
  );

  return sections.join('\n');
}

/**
 * Get embedding from Gemini text-embedding-004.
 * Called server-side only (setup API route), so process.env is available.
 * Returns all-zeros on failure so the caller can skip vector search gracefully.
 */
async function getEmbedding(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return new Array(768).fill(0);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: { parts: [{ text }] } }),
      }
    );
    const data = await response.json();
    return data.embedding?.values || new Array(768).fill(0);
  } catch (e) {
    console.error('[getEmbedding] error:', e.message);
    return new Array(768).fill(0);
  }
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  buildMemoryContext,
  estimateTokens,
  compressMemory,
  BUDGET_CONFIG,
  // Exported for testing
  getAlwaysOnMemories,
  getContextualMemories,
  getProactiveMemories,
  getBackgroundMemories,
  selectWithinBudget,
};
