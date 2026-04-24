/**
 * Memory Extractor for sayandkeep.com
 *
 * Extracts structured memories from conversation transcripts
 * using Gemini API. Supports 17 categories with multi-tagging.
 *
 * 2026-04-23 v2 schema migration:
 *  - All enum writes go through lib/enumMappers.js
 *    (code uses snake_case, DB uses SCREAMING_CASE)
 *  - validCategories expanded from 14 → 17 (turning_point/value/other added)
 *  - primary_category, confidence, recall_priority are now PG enums
 */

const {
  memoryCategoryToDb,
  memoryCategoriesToDb,
  confidenceToDb,
  recallPriorityToDb,
} = require('./enumMappers');
const { logApiUsage } = require('./apiUsage');

const EXTRACTION_PROMPT = `You are a memory extraction engine for an AI friend service.
Extract only facts EXPLICITLY stated by the USER (not the AI assistant) in the conversation below.

STRICT RULES:
- Only extract what the USER directly said — do NOT infer or assume
- Skip anything the AI (Emma) said
- Minimum confidence: only extract "high" or "medium" confidence facts
- Max 6 memories per conversation — pick the most important ones
- Do NOT extract: greetings, small talk, generic feelings ("I feel good")
- DO extract: names, relationships, health issues, job/projects, hobbies, goals, upcoming events, turning points, core values

CATEGORIES (use only if clearly stated):
people, health, emotion, work_career, finance, hobbies, goals,
social_life, life_story, living_situation, identity, routine, preferences, upcoming,
turning_point, value, other

CATEGORY GUIDANCE:
- turning_point: life-changing moments (marriage, loss, career pivot, relocation)
- value: deeply held beliefs or principles the user articulates
- other: important fact that doesn't cleanly fit any other category (use sparingly)

For EACH memory, return:
{
  "primary_category": "category_name",
  "secondary_categories": [],
  "label": "Short label (2-5 words)",
  "sub_type": "specific subcategory",
  "data": { relevant structured fields },
  "confidence": "high" | "medium",
  "emotional_weight": 1-5,
  "suggested_edges": []
}

emotional_weight: 1=trivial, 3=notable, 5=life-defining

EXISTING MEMORIES (for deduplication — skip if already saved):
{existing_memories}

USER CONVERSATION:
{transcript}

Return ONLY a JSON array. If nothing worth saving, return [].`;

/**
 * Extract memories from a conversation transcript.
 * 
 * @param {string} transcript - The conversation text
 * @param {Array} existingMemories - Current memory nodes for this user
 * @param {string} geminiApiKey - Gemini API key
 * @returns {Array} Extracted memory objects
 */
async function extractMemories(transcript, existingMemories, geminiApiKey, opts = {}) {
  const { db = null, userId = null, sessionId = null } = opts;

  // Format existing memories as simple list for the prompt
  const existingList = existingMemories.map(m =>
    `- [${m.node_type}] ${m.label} (weight: ${m.emotional_weight})`
  ).join('\n');

  // Truncate very long transcripts to avoid hitting input token limits
  const truncatedTranscript = transcript.length > 8000
    ? transcript.slice(-8000)
    : transcript;

  const prompt = EXTRACTION_PROMPT
    .replace('{existing_memories}', existingList || 'None yet (new user)')
    .replace('{transcript}', truncatedTranscript);

  const t0 = Date.now();
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,             // Increased: enough for full JSON array
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    const data = await response.json();

    // 🆕 Log API usage (non-fatal)
    if (db && userId) {
      await logApiUsage(db, {
        userId, sessionId,
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        operation: 'memory_extract',
        usageMetadata: data.usageMetadata,
        latencyMs: Date.now() - t0,
        success: !data.error,
        errorCode: data.error ? String(data.error.code || 'api_error').slice(0, 50) : null,
      });
    }

    // Check for finish reason truncation
    const finishReason = data.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
      console.warn('[extractMemories] Gemini stopped early:', finishReason);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const memories = safeParseJson(text);
    return validateExtractedMemories(memories);
  } catch (error) {
    // 🆕 Log failure
    if (db && userId) {
      await logApiUsage(db, {
        userId, sessionId,
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        operation: 'memory_extract',
        latencyMs: Date.now() - t0,
        success: false,
        errorCode: error.message?.slice(0, 50),
      });
    }
    console.error('Memory extraction failed:', error);
    return [];
  }
}

/**
 * Robustly parse JSON from Gemini response.
 * Handles: markdown wrappers, trailing commas, single quotes, BOM, etc.
 */
function safeParseJson(text) {
  if (!text) return [];

  // 1. Strip markdown code fences
  let cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  // 2. Try direct parse first
  try { return JSON.parse(cleaned); } catch (_) {}

  // 3. Extract first JSON array from text
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try { return JSON.parse(arrayMatch[0]); } catch (_) {}

    // 4. Remove trailing commas before ] or }
    const fixedCommas = arrayMatch[0]
      .replace(/,\s*([}\]])/g, '$1');
    try { return JSON.parse(fixedCommas); } catch (_) {}
  }

  // 5. Nothing worked
  console.error('safeParseJson: could not parse response:', cleaned.slice(0, 200));
  return [];
}

/**
 * Validate and clean extracted memories.
 *
 * 2026-04-23 v2: expanded from 14 → 17 categories.
 * Values stay in snake_case here; conversion to DB Enum happens in saveMemories()
 * via enumMappers. This keeps the biz-logic layer unchanged.
 */
function validateExtractedMemories(memories) {
  if (!Array.isArray(memories)) return [];

  const validCategories = [
    'people', 'health', 'emotion', 'work_career', 'finance',
    'hobbies', 'goals', 'social_life', 'life_story',
    'living_situation', 'identity', 'routine', 'preferences', 'upcoming',
    // v2 additions
    'turning_point', 'value', 'other',
  ];

  return memories.filter(m => {
    if (!m.primary_category || !validCategories.includes(m.primary_category)) return false;
    if (!m.label || m.label.length > 100) return false;
    if (!m.data || typeof m.data !== 'object') return false;
    
    // Clamp values
    m.emotional_weight = Math.max(1, Math.min(5, m.emotional_weight || 1));
    m.confidence = ['high', 'medium', 'low'].includes(m.confidence) ? m.confidence : 'medium';
    m.secondary_categories = (m.secondary_categories || []).filter(c => validCategories.includes(c));
    m.suggested_edges = (m.suggested_edges || []).filter(e => e.target_label && e.relationship);
    
    return true;
  });
}

/**
 * Save extracted memories to database.
 * Handles deduplication and edge creation.
 *
 * @param {Object} db - Database connection (Neon)
 * @param {string} userId - User ID
 * @param {Array} memories - Extracted memory objects (snake_case category values)
 * @param {string} geminiApiKey - For generating embeddings
 *
 * 2026-04-23 v2: all enum-typed columns written via enumMappers.
 * Biz-logic still receives snake_case; DB stores SCREAMING_CASE.
 */
async function saveMemories(db, userId, memories, geminiApiKey) {
  const results = { created: 0, updated: 0, edges: 0 };

  for (const memory of memories) {
    // Convert category once; used in multiple queries below
    const primaryCategoryDb = memoryCategoryToDb(memory.primary_category);
    const secondaryCategoriesDb = memoryCategoriesToDb(memory.secondary_categories || []);
    const confidenceDb = confidenceToDb(memory.confidence);

    // Check for existing similar memory
    const existing = await db.query(`
      SELECT id, label, data, mention_count, emotional_weight
      FROM memory_nodes
      WHERE user_id = $1
        AND primary_category = $2
        AND (label ILIKE $3 OR label ILIKE $4)
        AND is_active = true
      LIMIT 1
    `, [
      userId,
      primaryCategoryDb,           // v2: was memory.primary_category (snake)
      `%${memory.label}%`,
      memory.label
    ]);

    let nodeId;

    if (existing.rows.length > 0) {
      // UPDATE existing memory
      const old = existing.rows[0];

      // Archive old version
      // Note: memory_archive.node_type is VARCHAR(20), NOT an enum — no conversion needed.
      // We keep the snake_case value here so archive data stays human-readable.
      await db.query(`
        INSERT INTO memory_archive (original_id, user_id, node_type, label, data, reason)
        VALUES ($1, $2, $3, $4, $5, 'updated')
      `, [old.id, userId, memory.primary_category, old.label, old.data]);

      // Merge data (new data takes priority, keep old fields that aren't in new)
      const mergedData = { ...old.data, ...memory.data };

      // Base update (always-present columns)
      await db.query(`
        UPDATE memory_nodes SET
          data = $1,
          mention_count = mention_count + 1,
          emotional_weight = GREATEST(emotional_weight, $2),
          confidence = $3,
          secondary_categories = $4,
          last_mentioned = NOW()
        WHERE id = $5
      `, [
        mergedData,
        memory.emotional_weight,
        confidenceDb,               // v2: was memory.confidence (snake)
        secondaryCategoriesDb,       // v2: was memory.secondary_categories (snake array)
        old.id
      ]);

      // Track discussion_depth and times_discussed.
      // v2: these columns are now guaranteed present in schema.prisma,
      // but we keep the try/catch for defense-in-depth (future-proof).
      try {
        // discussion_depth: increases only when new data fields are added (depth of info)
        const newFieldCount = Object.keys(memory.data || {}).length;
        const oldFieldCount = Object.keys(old.data || {}).length;
        const depthDelta = newFieldCount > oldFieldCount ? 1 : 0;

        await db.query(`
          UPDATE memory_nodes SET
            times_discussed = COALESCE(times_discussed, 0) + 1,
            discussion_depth = COALESCE(discussion_depth, 0) + $1
          WHERE id = $2
        `, [depthDelta, old.id]);
      } catch (e) {
        // Columns may not exist yet — silently skip
        if (!e.message?.includes('column') && !e.message?.includes('does not exist')) {
          console.warn('[saveMemories] discussion_depth update error:', e.message);
        }
      }

      nodeId = old.id;
      results.updated++;
    } else {
      // CREATE new memory
      const recallPriorityDb = recallPriorityToDb(getRecallPriority(memory.primary_category));

      // v2: discussion_depth / times_discussed columns are guaranteed in schema.prisma.
      // We still wrap in try/catch for defense-in-depth during the transition.
      let inserted;
      try {
        inserted = await db.query(`
          INSERT INTO memory_nodes
            (user_id, node_type, label, data, primary_category, secondary_categories,
             emotional_weight, confidence, recall_priority, times_discussed, discussion_depth)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, 1)
          RETURNING id
        `, [
          userId,
          memory.primary_category,    // node_type (VARCHAR, not enum) — keep snake_case
          memory.label,
          memory.data,
          primaryCategoryDb,          // v2 enum
          secondaryCategoriesDb,      // v2 enum array (tagged as text[] in schema)
          memory.emotional_weight,
          confidenceDb,               // v2 enum
          recallPriorityDb,           // v2 enum
        ]);
      } catch (e) {
        if (e.message?.includes('column') || e.message?.includes('does not exist')) {
          // Columns not yet added — insert without them (transitional fallback)
          inserted = await db.query(`
            INSERT INTO memory_nodes
              (user_id, node_type, label, data, primary_category, secondary_categories,
               emotional_weight, confidence, recall_priority)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id
          `, [
            userId,
            memory.primary_category,
            memory.label,
            memory.data,
            primaryCategoryDb,
            secondaryCategoriesDb,
            memory.emotional_weight,
            confidenceDb,
            recallPriorityDb,
          ]);
        } else {
          throw e;
        }
      }

      nodeId = inserted.rows[0].id;
      results.created++;

      // Generate and store embedding
      try {
        const embeddingText = `${memory.label}: ${JSON.stringify(memory.data)}`;
        const embedding = await generateEmbedding(embeddingText, geminiApiKey, { db, userId });
        
        if (embedding) {
          await db.query(`
            INSERT INTO memory_embeddings (user_id, memory_id, content_text, embedding)
            VALUES ($1, $2, $3, $4)
          `, [userId, nodeId, embeddingText, JSON.stringify(embedding)]);
        }
      } catch (e) {
        console.error('Embedding generation failed for:', memory.label, e);
      }
    }

    // Create edges from suggested_edges
    // Note: memory_edges.relationship is VARCHAR(30), NOT an enum — no conversion needed.
    for (const edge of (memory.suggested_edges || [])) {
      const targetNode = await db.query(`
        SELECT id FROM memory_nodes
        WHERE user_id = $1 AND label ILIKE $2 AND is_active = true
        LIMIT 1
      `, [userId, `%${edge.target_label}%`]);

      if (targetNode.rows.length > 0) {
        await db.query(`
          INSERT INTO memory_edges (user_id, source_node, target_node, relationship, weight)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (source_node, target_node, relationship) 
          DO UPDATE SET
            co_occurrence = memory_edges.co_occurrence + 1,
            weight = LEAST(1.0, memory_edges.weight + 0.05),
            last_reinforced = NOW()
        `, [userId, nodeId, targetNode.rows[0].id, edge.relationship, edge.weight || 0.5]);
        
        results.edges++;
      }
    }
  }

  return results;
}

/**
 * Determine recall priority based on category.
 * Returns snake_case; convert to DB enum via recallPriorityToDb() at call site.
 *
 * v2: expanded to cover new categories (turning_point, value, other).
 */
function getRecallPriority(category) {
  const map = {
    // High-recall categories (always injected in Phase 1)
    people: 'always', health: 'always', emotion: 'always',
    // Time-sensitive (Phase 3)
    upcoming: 'proactive',
    // Background (Phase 4)
    identity: 'background', routine: 'background', preferences: 'background',
    // Emotionally significant but not always-on — treat as contextual
    turning_point: 'always',   // turning points are identity-defining → always recall
    value: 'background',       // values rarely change, surface as background
    // Everything else falls through to default
  };
  return map[category] || 'contextual';
}

/**
 * Generate embedding via Gemini gemini-embedding-001.
 *
 * 2026-04-24: text-embedding-004 was removed from v1beta (returns 404).
 * Migrated to gemini-embedding-001, which defaults to 3072-dim but supports
 * outputDimensionality=768 for our existing VECTOR(768) schema.
 */
const EMBEDDING_MODEL = 'gemini-embedding-001';

async function generateEmbedding(text, apiKey, opts = {}) {
  const { db = null, userId = null, sessionId = null } = opts;
  const t0 = Date.now();
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: { parts: [{ text }] },
          outputDimensionality: 768,  // match pgvector VECTOR(768) column
        }),
      }
    );
    const data = await response.json();

    const values = Array.isArray(data.embedding?.values) ? data.embedding.values : null;

    // 🆕 Log usage (embedding API has no native usageMetadata → estimate from text)
    if (db && userId) {
      await logApiUsage(db, {
        userId, sessionId,
        provider: 'gemini',
        model: EMBEDDING_MODEL,
        operation: 'embedding',
        fallbackTextForEstimate: text,
        latencyMs: Date.now() - t0,
        success: !!(values && values.length > 0),
        errorCode: data.error ? String(data.error.code || 'api_error').slice(0, 50) : null,
      });
    }

    return values;
  } catch (error) {
    if (db && userId) {
      await logApiUsage(db, {
        userId, sessionId,
        provider: 'gemini',
        model: EMBEDDING_MODEL,
        operation: 'embedding',
        fallbackTextForEstimate: text,
        latencyMs: Date.now() - t0,
        success: false,
        errorCode: error.message?.slice(0, 50),
      });
    }
    console.error('Embedding API error:', error);
    return null;
  }
}

module.exports = {
  extractMemories,
  saveMemories,
  generateEmbedding,
  validateExtractedMemories,
};
