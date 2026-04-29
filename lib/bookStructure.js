/**
 * lib/bookStructure.js
 *
 * Tiny helpers shared across the customisation API endpoints. Lives
 * outside the route files so each route stays focused on its own
 * payload + db calls.
 */

/**
 * Generate a per-instance custom id like `q-custom-l5x3a-2k4f`.
 * Server-side only. The base36 timestamp keeps the ids roughly
 * sorted by creation time; the random tail prevents collisions
 * inside the same millisecond.
 */
function genId(prefix = 'custom') {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${ts}-${rand}`;
}

/**
 * Count active (chapter.is_active !== false AND question.is_active
 * !== false) questions in a structure JSON. Used to refresh
 * user_books.total_questions whenever the structure changes.
 */
function countActiveQuestions(structure) {
  if (!structure || !Array.isArray(structure.chapters)) return 0;
  let n = 0;
  for (const ch of structure.chapters) {
    if (ch.is_active === false) continue;
    for (const q of ch.questions || []) {
      if (q.is_active !== false) n++;
    }
  }
  return n;
}

module.exports = { genId, countActiveQuestions };
