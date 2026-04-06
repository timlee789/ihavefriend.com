/**
 * Memory Extractor for ihavefriend.com
 * 
 * Extracts structured memories from conversation transcripts
 * using Gemini API. Supports 14 categories with multi-tagging.
 */

const EXTRACTION_PROMPT = `You are a memory extraction engine for an AI friend service.
From the conversation below, extract ALL memorable facts as a JSON array.

CATEGORIES (extract only if mentioned or clearly implied):
ALWAYS extract: people, health, emotion
EXTRACT IF detected: work_career, finance, hobbies, goals, social_life, life_story, living_situation
UPDATE IF changed: identity, routine, preferences, upcoming

For EACH memory extracted, return:
{
  "primary_category": "category_name",
  "secondary_categories": ["other", "relevant", "categories"],
  "label": "Short descriptive label (2-5 words)",
  "sub_type": "specific subcategory",
  "data": { category-specific structured data },
  "confidence": "high" | "medium" | "low",
  "emotional_weight": 1-5,
  "suggested_edges": [
    {"target_label": "existing node label", "relationship": "relationship_type", "weight": 0.1-1.0}
  ]
}

EDGE RELATIONSHIP TYPES:
family_of, triggers, comforted_by, related_to, leads_to,
happened_at, contrasts_with, reminds_of, works_with,
aspires_to, worried_about, enjoys_with

RULES:
- Extract IMPLICIT facts too ("my grandson" → user has a grandchild)
- Never fabricate — only extract what's stated or clearly implied
- One memory can belong to multiple categories (use secondary_categories)
- suggested_edges should reference labels of EXISTING memories when possible
- Keep labels short and unique per user
- emotional_weight: 1=trivial, 3=notable, 5=life-defining

EXISTING MEMORIES for this user (for edge detection):
{existing_memories}

CONVERSATION:
{transcript}

Respond with ONLY a JSON array. No explanation, no markdown.`;

/**
 * Extract memories from a conversation transcript.
 * 
 * @param {string} transcript - The conversation text
 * @param {Array} existingMemories - Current memory nodes for this user
 * @param {string} geminiApiKey - Gemini API key
 * @returns {Array} Extracted memory objects
 */
async function extractMemories(transcript, existingMemories, geminiApiKey) {
  // Format existing memories as simple list for the prompt
  const existingList = existingMemories.map(m => 
    `- [${m.node_type}] ${m.label} (weight: ${m.emotional_weight})`
  ).join('\n');

  const prompt = EXTRACTION_PROMPT
    .replace('{existing_memories}', existingList || 'None yet (new user)')
    .replace('{transcript}', transcript);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,  // Low temp for structured extraction
            maxOutputTokens: 2000,
          },
        }),
      }
    );

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    
    // Clean potential markdown wrappers
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const memories = JSON.parse(cleaned);
    return validateExtractedMemories(memories);
  } catch (error) {
    console.error('Memory extraction failed:', error);
    return [];
  }
}

/**
 * Validate and clean extracted memories.
 */
function validateExtractedMemories(memories) {
  if (!Array.isArray(memories)) return [];

  const validCategories = [
    'people', 'health', 'emotion', 'work_career', 'finance',
    'hobbies', 'goals', 'social_life', 'life_story',
    'living_situation', 'identity', 'routine', 'preferences', 'upcoming'
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
 * @param {Array} memories - Extracted memory objects
 * @param {string} geminiApiKey - For generating embeddings
 */
async function saveMemories(db, userId, memories, geminiApiKey) {
  const results = { created: 0, updated: 0, edges: 0 };

  for (const memory of memories) {
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
      memory.primary_category,
      `%${memory.label}%`,
      memory.label
    ]);

    let nodeId;

    if (existing.rows.length > 0) {
      // UPDATE existing memory
      const old = existing.rows[0];
      
      // Archive old version
      await db.query(`
        INSERT INTO memory_archive (original_id, user_id, node_type, label, data, reason)
        VALUES ($1, $2, $3, $4, $5, 'updated')
      `, [old.id, userId, memory.primary_category, old.label, old.data]);

      // Merge data (new data takes priority, keep old fields that aren't in new)
      const mergedData = { ...old.data, ...memory.data };

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
        memory.confidence,
        memory.secondary_categories || [],
        old.id
      ]);

      nodeId = old.id;
      results.updated++;
    } else {
      // CREATE new memory
      const recallPriority = getRecallPriority(memory.primary_category);
      
      const inserted = await db.query(`
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
        memory.primary_category,
        memory.secondary_categories || [],
        memory.emotional_weight,
        memory.confidence,
        recallPriority
      ]);

      nodeId = inserted.rows[0].id;
      results.created++;

      // Generate and store embedding
      try {
        const embeddingText = `${memory.label}: ${JSON.stringify(memory.data)}`;
        const embedding = await generateEmbedding(embeddingText, geminiApiKey);
        
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
 */
function getRecallPriority(category) {
  const map = {
    people: 'always', health: 'always', emotion: 'always',
    upcoming: 'proactive',
    identity: 'background', routine: 'background', preferences: 'background',
  };
  return map[category] || 'contextual';
}

/**
 * Generate embedding via Gemini text-embedding-004.
 */
async function generateEmbedding(text, apiKey) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: { parts: [{ text }] },
        }),
      }
    );
    const data = await response.json();
    return data.embedding?.values || null;
  } catch (error) {
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
