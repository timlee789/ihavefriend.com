/**
 * Fragment Manager for sayandkeep.com
 *
 * Handles CRUD operations for Story Fragments,
 * tag-based clustering, and Story grouping suggestions.
 *
 * 2026-04-23 v2 schema migration:
 *  - FragmentStatus, Visibility, VoiceStyle writes go through enumMappers
 *  - status IN (...) queries converted to ANY($::"FragmentStatus"[])
 *  - SELECT results converted back to snake_case via storyFragmentFromDb
 *  - createStory: removed db.connect() transaction (Neon serverless incompat);
 *    now uses sequential execution. See note in function body.
 */

const {
  fragmentStatusToDb,
  fragmentStatusFromDb,
  fragmentStatusesToDb,
  visibilityToDb,
  voiceStyleToDb,
  storyFragmentFromDb,
} = require('./enumMappers');

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
    // Optional: set true when the source Gemini response hit MAX_TOKENS and
    // this fragment was recovered from a partial JSON payload. Defaults to
    // false for every other code path (manual creation, local LLM, etc.).
    truncated = false,
    // 🆕 Task 94 — typed-continuation support. When set, this row is
    //   inserted as a child of the parent fragment (same shape as the
    //   voice-continuation path in chat/end). thread_order is computed
    //   here so callers don't need to pre-fetch MAX. Parent ownership
    //   is verified — a userId mismatch silently drops the parent ref
    //   so the row becomes a top-level fragment instead of corrupting
    //   another user's thread.
    parent_fragment_id = null,
  } = fragmentData;

  const wordCount = content.length; // For Korean, char count ≈ word count
  const voiceStyleDb = voiceStyleToDb(voice_style); // v2: VoiceStyle enum

  // Resolve continuation parent + next thread_order.
  let parentId = null;
  let threadOrder = null;
  if (parent_fragment_id) {
    try {
      const parentRow = await db.query(
        `SELECT id FROM story_fragments WHERE id = $1 AND user_id = $2`,
        [parent_fragment_id, userId]
      );
      if (parentRow.rows.length > 0) {
        parentId = parent_fragment_id;
        const orderRes = await db.query(
          `SELECT COALESCE(MAX(thread_order), 0) + 1 AS next_order
             FROM story_fragments
            WHERE parent_fragment_id = $1`,
          [parentId]
        );
        threadOrder = orderRes.rows[0]?.next_order || 1;
      } else {
        console.warn(
          `[createFragment] parent_fragment_id=${parent_fragment_id} not owned by user=${userId}; saving as top-level`
        );
      }
    } catch (e) {
      console.warn('[createFragment] parent lookup failed (saving as top-level):', e.message);
    }
  }

  try {
    const result = await db.query(
      `INSERT INTO story_fragments (
        user_id, title, subtitle, content, content_raw,
        source_session_ids, source_memory_node_ids, source_conversation_date,
        tags_era, tags_people, tags_place, tags_theme, tags_emotion,
        word_count, language, voice_style,
        generated_by, generation_prompt_hash, truncated,
        parent_fragment_id, thread_order
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11, $12, $13,
        $14, $15, $16,
        $17, $18, $19,
        $20, $21
      ) RETURNING *`,
      [
        userId, title, subtitle, content, content_raw,
        source_session_ids, source_memory_node_ids, source_conversation_date,
        tags_era, tags_people, tags_place, tags_theme, tags_emotion,
        wordCount, language, voiceStyleDb,
        generated_by, generation_prompt_hash, Boolean(truncated),
        parentId, threadOrder,
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

    return storyFragmentFromDb(result.rows[0]);
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

  // v2: Enum array requires explicit ::"FragmentStatus"[] cast
  // 🆕 2026-04-25: Continuation Thread — list returns ROOT fragments only.
  //               Continuations (parent_fragment_id NOT NULL) are nested under their parent.
  //               continuation_count is included so UI can show "+N continuations".
  // 🔥 Task 75: photos pulled via a correlated json_agg subquery so
  // we don't have to rewrite the SELECT into GROUP BY mode (would
  // break the existing storyFragmentFromDb mapper that relies on
  // f.* spreading every column). Empty fragment → empty array.
  let query = `
    SELECT
      f.*,
      (SELECT COUNT(*)::int FROM story_fragments c
         WHERE c.parent_fragment_id = f.id) AS continuation_count,
      COALESCE((
        SELECT json_agg(
                 json_build_object(
                   'id',            p.id,
                   'blob_url',      p.blob_url,
                   'width',         p.width,
                   'height',        p.height,
                   'display_order', p.display_order,
                   'caption',       p.caption
                 ) ORDER BY p.display_order
               )
          FROM fragment_photos p
         WHERE p.fragment_id = f.id
      ), '[]'::json) AS photos
    FROM story_fragments f
    WHERE f.user_id = $1
      AND f.status = ANY($2::"FragmentStatus"[])
      AND f.parent_fragment_id IS NULL
  `;
  const params = [userId, fragmentStatusesToDb(status)];

  if (themeFilter) {
    params.push([themeFilter]);
    query += ` AND f.tags_theme && $${params.length}`;
  }

  query += ` ORDER BY f.${sortBy} ${sortOrder} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  try {
    const result = await db.query(query, params);
    return result.rows.map(storyFragmentFromDb);
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
      // v2: Enum fields need mapper conversion before INSERT
      let dbValue = value;
      if (key === 'status') dbValue = fragmentStatusToDb(value);
      else if (key === 'visibility') dbValue = visibilityToDb(value);
      else if (key === 'voice_style') dbValue = voiceStyleToDb(value);

      params.push(dbValue);
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
    return storyFragmentFromDb(result.rows[0]);
  } catch (error) {
    console.error('Failed to update fragment:', error);
    throw error;
  }
}

/**
 * Soft-delete a fragment AND scrub it out of any user_book_responses
 * that referenced it (Task 92 — Tim's "deleted fragment still shows up
 * on the question page" bug).
 *
 * Sequence:
 *   1. Flip story_fragments.status to DELETED (existing behavior).
 *   2. Find every user_book_response row owned by this user that
 *      references the fragment in fragment_ids OR imported_fragment_ids.
 *   3. array_remove the dead UUID from both arrays + NULL out
 *      selected_fragment_id / selected_imported_id when they pointed
 *      at the now-deleted fragment.
 *   4. If a response row's arrays are now both empty AND its status was
 *      'complete', demote it to 'empty' so the chapter / book overview
 *      stop counting it as answered.
 *   5. Recompute user_books.completed_questions for every book that
 *      had a response touched in step 3-4.
 *
 * All four follow-up steps are scoped through user_books.user_id, so
 * a malicious fragmentId belonging to a different user can never
 * mutate someone else's book responses.
 */
async function deleteFragment(db, userId, fragmentId) {
  try {
    // 1. Soft-delete the fragment row.
    await db.query(
      `UPDATE story_fragments
          SET status = $3
        WHERE id = $1 AND user_id = $2`,
      [fragmentId, userId, fragmentStatusToDb('deleted')]
    );

    // 2. Find affected book_ids upfront so step 5 only touches them.
    const affected = await db.query(
      `SELECT DISTINCT r.book_id
         FROM user_book_responses r
         JOIN user_books b ON b.id = r.book_id
        WHERE b.user_id = $1
          AND ($2::uuid = ANY(r.fragment_ids)
               OR $2::uuid = ANY(r.imported_fragment_ids))`,
      [userId, fragmentId]
    );

    if (affected.rows.length > 0) {
      // 3. Scrub the UUID from arrays + NULL out selected pointers.
      await db.query(
        `UPDATE user_book_responses r
            SET fragment_ids          = array_remove(r.fragment_ids, $2::uuid),
                imported_fragment_ids = array_remove(r.imported_fragment_ids, $2::uuid),
                selected_fragment_id  = CASE WHEN r.selected_fragment_id = $2::uuid THEN NULL ELSE r.selected_fragment_id END,
                selected_imported_id  = CASE WHEN r.selected_imported_id = $2::uuid THEN NULL ELSE r.selected_imported_id END,
                last_updated_at       = NOW()
           FROM user_books b
          WHERE r.book_id = b.id
            AND b.user_id = $1
            AND ($2::uuid = ANY(r.fragment_ids)
                 OR $2::uuid = ANY(r.imported_fragment_ids))`,
        [userId, fragmentId]
      );

      // 4. Demote status if no fragments remain on the response row.
      await db.query(
        `UPDATE user_book_responses r
            SET status = 'empty'
           FROM user_books b
          WHERE r.book_id = b.id
            AND b.user_id = $1
            AND r.status = 'complete'
            AND COALESCE(array_length(r.fragment_ids, 1), 0) = 0
            AND COALESCE(array_length(r.imported_fragment_ids, 1), 0) = 0`,
        [userId]
      );

      // 5. Recompute the parent book(s) completed_questions counter.
      const bookIds = affected.rows.map(r => r.book_id);
      await db.query(
        `UPDATE user_books b
            SET completed_questions = (
                  SELECT COUNT(*) FROM user_book_responses
                   WHERE book_id = b.id AND status = 'complete'
                ),
                last_active_at = NOW()
          WHERE b.user_id = $1
            AND b.id = ANY($2::uuid[])`,
        [userId, bookIds]
      );
    }

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
  // v2: Convert lowercase status list to Enum values once, reuse across queries
  const activeStatuses = fragmentStatusesToDb(['draft', 'confirmed']);

  try {
    // Cluster by theme
    const themeClusters = await db.query(
      `SELECT theme, array_agg(id) as fragment_ids, COUNT(*) as count
       FROM (
         SELECT id, unnest(tags_theme) as theme
         FROM story_fragments
         WHERE user_id = $1
           AND status = ANY($3::"FragmentStatus"[])
           AND story_id IS NULL
       ) sub
       GROUP BY theme
       HAVING COUNT(*) >= $2
       ORDER BY count DESC`,
      [userId, minClusterSize, activeStatuses]
    );

    // Cluster by people
    const peopleClusters = await db.query(
      `SELECT person, array_agg(id) as fragment_ids, COUNT(*) as count
       FROM (
         SELECT id, unnest(tags_people) as person
         FROM story_fragments
         WHERE user_id = $1
           AND status = ANY($3::"FragmentStatus"[])
           AND story_id IS NULL
       ) sub
       GROUP BY person
       HAVING COUNT(*) >= $2
       ORDER BY count DESC`,
      [userId, minClusterSize, activeStatuses]
    );

    // Cluster by era
    const eraClusters = await db.query(
      `SELECT era, array_agg(id) as fragment_ids, COUNT(*) as count
       FROM (
         SELECT id, unnest(tags_era) as era
         FROM story_fragments
         WHERE user_id = $1
           AND status = ANY($3::"FragmentStatus"[])
           AND story_id IS NULL
       ) sub
       GROUP BY era
       HAVING COUNT(*) >= $2
       ORDER BY count DESC`,
      [userId, minClusterSize, activeStatuses]
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

  // v2 fix: Neon serverless driver does not support db.connect() / explicit
  // BEGIN-COMMIT transactions. Previously this function threw on every call.
  // We now run queries sequentially; on partial failure, manual cleanup of
  // the orphan `stories` row may be required. SayAndKeep's volume makes this
  // acceptable; upgrade to pg.Pool or neon-serverless sql.transaction() when
  // atomicity is needed.
  try {
    // Get fragments to aggregate tags
    const fragments = await db.query(
      `SELECT id, tags_theme, tags_era, word_count
       FROM story_fragments
       WHERE id = ANY($1) AND user_id = $2
       ORDER BY source_conversation_date ASC NULLS LAST, created_at ASC`,
      [fragmentIds, userId]
    );

    const allThemes = [...new Set(fragments.rows.flatMap(f => f.tags_theme || []))];
    const allEras = [...new Set(fragments.rows.flatMap(f => f.tags_era || []))];
    const totalWords = fragments.rows.reduce((sum, f) => sum + (f.word_count || 0), 0);

    // Create the story (stories.status is varchar(20), no enum mapper)
    const storyResult = await db.query(
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
      await db.query(
        `UPDATE story_fragments
         SET story_id = $1, story_order = $2
         WHERE id = $3 AND user_id = $4`,
        [storyId, i + 1, fragments.rows[i].id, userId]
      );
    }

    return storyResult.rows[0];
  } catch (error) {
    console.error('Failed to create story:', error);
    throw error;
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
