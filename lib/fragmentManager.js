/**
 * Fragment Manager for sayandkeep.com
 *
 * Handles CRUD operations for Story Fragments,
 * tag-based clustering, and Story grouping suggestions.
 */

// ============================================================
// Fragment CRUD
// ============================================================

/**
 * Create a new Story Fragment.
 *
 * @param {Object} db - Database connection
 * @param {number} userId - User ID
 * @param {Object} fragmentData - Fragment content and metadata
 * @returns {Object} Created fragment
 */
async function createFragment(db, userId, fragmentData) {
  const {
    title,
    subtitle,
    content,
    content_raw,
    source_session_ids = [],
    source_memory_node_ids = [],
    source_conversation_date,
    tags_era = [],
    tags_people = [],
    tags_place = [],
    tags_theme = [],
    tags_emotion = [],
    voice_style = 'conversational',
    language = 'ko',
    generated_by,
    generation_prompt_hash,
  } = fragmentData;

  const wordCount = content.length; // For Korean, char count ≈ word count

  try {
    const result = await db.query(
      `INSERT INTO story_fragments (
        user_id, title, subtitle, content, content_raw,
        source_session_ids, source_memory_node_ids, source_conversation_date,
        tags_era, tags_people, tags_place, tags_theme, tags_emotion,
        word_count, language, voice_style,
        generated_by, generation_prompt_hash
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11, $12, $13,
        $14, $15, $16,
        $17, $18
      ) RETURNING *`,
      [
        userId, title, subtitle, content, content_raw,
        source_session_ids, source_memory_node_ids, source_conversation_date,
        tags_era, tags_people, tags_place, tags_theme, tags_emotion,
        wordCount, language, voice_style,
        generated_by, generation_prompt_hash,
      ]
    );

    // Link memory nodes to this fragment
    if (source_memory_node_ids.length > 0) {
      await db.query(
        `UPDATE memory_nodes
         SET story_fragment_id = $1
         WHERE id = ANY($2) AND user_id = $3`,
        [result.rows[0].id, source_memory_node_ids, userId]
      );
    }

    return result.rows[0];
  } catch (error) {
    console.error('Failed to create fragment:', error);
    throw error;
  }
}

/**
 * Get all fragments for a user.
 */
async function getFragments(db, userId, options = {}) {
  const {
    status = ['draft', 'confirmed'],
    limit = 50,
    offset = 0,
    sortBy = 'created_at',
    sortOrder = 'DESC',
    themeFilter = null,
  } = options;

  let query = `
    SELECT * FROM story_fragments
    WHERE user_id = $1 AND status = ANY($2)
  `;
  const params = [userId, status];

  if (themeFilter) {
    params.push([themeFilter]);
    query += ` AND tags_theme && $${params.length}`;
  }

  query += ` ORDER BY ${sortBy} ${sortOrder} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  try {
    const result = await db.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Failed to get fragments:', error);
    return [];
  }
}

/**
 * Update a fragment (user edit).
 */
async function updateFragment(db, userId, fragmentId, updates) {
  const allowed = ['title', 'subtitle', 'content', 'visibility', 'status', 'voice_style'];
  const setClauses = [];
  const params = [fragmentId, userId];

  for (const [key, value] of Object.entries(updates)) {
    if (allowed.includes(key)) {
      params.push(value);
      setClauses.push(`${key} = $${params.length}`);
    }
  }

  if (setClauses.length === 0) return null;

  // Track user edits
  setClauses.push('user_edited = true');
  setClauses.push('user_edited_at = NOW()');
  setClauses.push('edit_count = edit_count + 1');

  if (updates.content) {
    params.push(updates.content.length);
    setClauses.push(`word_count = $${params.length}`);
  }

  try {
    const result = await db.query(
      `UPDATE story_fragments
       SET ${setClauses.join(', ')}
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      params
    );
    return result.rows[0];
  } catch (error) {
    console.error('Failed to update fragment:', error);
    throw error;
  }
}

/**
 * Soft-delete a fragment.
 */
async function deleteFragment(db, userId, fragmentId) {
  try {
    await db.query(
      `UPDATE story_fragments
       SET status = 'deleted'
       WHERE id = $1 AND user_id = $2`,
      [fragmentId, userId]
    );
    return true;
  } catch (error) {
    console.error('Failed to delete fragment:', error);
    return false;
  }
}

// ============================================================
// Fragment Clustering & Story Suggestions
// ============================================================

/**
 * Find clusters of related fragments that could form a Story.
 *
 * @param {Object} db - Database connection
 * @param {number} userId - User ID
 * @param {number} minClusterSize - Minimum fragments for a suggestion
 * @returns {Array} Cluster suggestions
 */
async function findFragmentClusters(db, userId, minClusterSize = 3) {
  try {
    // Cluster by theme
    const themeClusters = await db.query(
      `SELECT theme, array_agg(id) as fragment_ids, COUNT(*) as count
       FROM (
         SELECT id, unnest(tags_theme) as theme
         FROM story_fragments
         WHERE user_id = $1
           AND status IN ('draft', 'confirmed')
           AND story_id IS NULL
       ) sub
       GROUP BY theme
       HAVING COUNT(*) >= $2
       ORDER BY count DESC`,
      [userId, minClusterSize]
    );

    // Cluster by people
    const peopleClusters = await db.query(
      `SELECT person, array_agg(id) as fragment_ids, COUNT(*) as count
       FROM (
         SELECT id, unnest(tags_people) as person
         FROM story_fragments
         WHERE user_id = $1
           AND status IN ('draft', 'confirmed')
           AND story_id IS NULL
       ) sub
       GROUP BY person
       HAVING COUNT(*) >= $2
       ORDER BY count DESC`,
      [userId, minClusterSize]
    );

    // Cluster by era
    const eraClusters = await db.query(
      `SELECT era, array_agg(id) as fragment_ids, COUNT(*) as count
       FROM (
         SELECT id, unnest(tags_era) as era
         FROM story_fragments
         WHERE user_id = $1
           AND status IN ('draft', 'confirmed')
           AND story_id IS NULL
       ) sub
       GROUP BY era
       HAVING COUNT(*) >= $2
       ORDER BY count DESC`,
      [userId, minClusterSize]
    );

    const suggestions = [];

    for (const row of themeClusters.rows) {
      suggestions.push({
        type: 'theme',
        label: row.theme,
        fragmentIds: row.fragment_ids,
        count: parseInt(row.count),
        suggestedTitle: generateSuggestionTitle('theme', row.theme),
      });
    }

    for (const row of peopleClusters.rows) {
      suggestions.push({
        type: 'people',
        label: row.person,
        fragmentIds: row.fragment_ids,
        count: parseInt(row.count),
        suggestedTitle: generateSuggestionTitle('people', row.person),
      });
    }

    for (const row of eraClusters.rows) {
      suggestions.push({
        type: 'era',
        label: row.era,
        fragmentIds: row.fragment_ids,
        count: parseInt(row.count),
        suggestedTitle: generateSuggestionTitle('era', row.era),
      });
    }

    // Sort by count descending, deduplicate overlapping fragments
    return suggestions.sort((a, b) => b.count - a.count);
  } catch (error) {
    console.error('Failed to find fragment clusters:', error);
    return [];
  }
}

/**
 * Generate a suggested title for a Story cluster.
 */
function generateSuggestionTitle(type, label) {
  const templates = {
    theme: {
      family: '나의 가족 이야기',
      love: '사랑에 대하여',
      loss: '잃어버린 것들',
      work: '일의 의미',
      faith: '나의 신앙 여정',
      challenge: '극복의 기록',
      growth: '성장의 순간들',
      friendship: '소중한 인연들',
      food: '맛의 기억',
      home: '집이라는 곳',
    },
    people: (name) => `${name}와의 이야기`,
    era: (era) => `${era}의 기억`,
  };

  if (type === 'theme') {
    return templates.theme[label] || `${label}에 대한 이야기`;
  } else if (type === 'people') {
    return templates.people(label);
  } else if (type === 'era') {
    return templates.era(label);
  }
  return `${label} 이야기`;
}

/**
 * Create a Story from a cluster of fragments.
 */
async function createStory(db, userId, storyData) {
  const {
    title,
    description,
    fragmentIds,
    chapterType = 'thematic',
  } = storyData;

  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Get fragments to aggregate tags
    const fragments = await client.query(
      `SELECT id, tags_theme, tags_era, word_count
       FROM story_fragments
       WHERE id = ANY($1) AND user_id = $2
       ORDER BY source_conversation_date ASC NULLS LAST, created_at ASC`,
      [fragmentIds, userId]
    );

    const allThemes = [...new Set(fragments.rows.flatMap(f => f.tags_theme || []))];
    const allEras = [...new Set(fragments.rows.flatMap(f => f.tags_era || []))];
    const totalWords = fragments.rows.reduce((sum, f) => sum + (f.word_count || 0), 0);

    // Create the story
    const storyResult = await client.query(
      `INSERT INTO stories (
        user_id, title, description, chapter_type,
        tags_theme, tags_era, fragment_count, total_word_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [userId, title, description, chapterType,
       allThemes, allEras, fragments.rows.length, totalWords]
    );

    const storyId = storyResult.rows[0].id;

    // Link fragments to story with order
    for (let i = 0; i < fragments.rows.length; i++) {
      await client.query(
        `UPDATE story_fragments
         SET story_id = $1, story_order = $2
         WHERE id = $3 AND user_id = $4`,
        [storyId, i + 1, fragments.rows[i].id, userId]
      );
    }

    await client.query('COMMIT');
    return storyResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to create story:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createFragment,
  getFragments,
  updateFragment,
  deleteFragment,
  findFragmentClusters,
  createStory,
};
