/**
 * Story Prompt Builder for ihavefriend.com
 *
 * Extends the existing recallEngine.buildEmmaPrompt() to include
 * Story Fragment detection, deepening questions, and gap analysis.
 *
 * Integration: Call buildStoryContext() and append its output
 * to the existing prompt assembled by recallEngine.
 */

const fs = require('fs');
const path = require('path');

// Load prompt templates at startup
const PROMPTS_DIR = path.join(__dirname, 'prompts');

const STORY_DETECTION_PROMPT = fs.readFileSync(
  path.join(PROMPTS_DIR, 'emma-story-detection.txt'), 'utf-8'
);
const GAP_QUESTIONS_PROMPT = fs.readFileSync(
  path.join(PROMPTS_DIR, 'emma-gap-questions.txt'), 'utf-8'
);
const ANALYSIS_REQUEST_PROMPT = fs.readFileSync(
  path.join(PROMPTS_DIR, 'emma-analysis-request.txt'), 'utf-8'
);

// ============================================================
// Coverage areas for gap analysis
// ============================================================
const COVERAGE_AREAS = [
  'childhood',
  'school',
  'first_love',
  'career_beginning',
  'marriage',
  'children',
  'faith',
  'transitions',
  'proudest_moment',
  'biggest_challenge',
  'current_chapter',
];

/**
 * Build story-related context to append to Emma's prompt.
 *
 * @param {Object} db - Database connection (pg Pool)
 * @param {number} userId - User ID
 * @returns {Object} { storyPrompt, storyProgress, gapSuggestion }
 */
async function buildStoryContext(db, userId) {
  const [progress, gaps, lastQuestion] = await Promise.all([
    getStoryProgress(db, userId),
    getCoverageGaps(db, userId),
    getLastStoryQuestion(db, userId),
  ]);

  // Build story progress context block
  const progressBlock = buildProgressBlock(progress, lastQuestion);

  // Build gap suggestion (only if there are gaps)
  const gapBlock = gaps.length > 0
    ? buildGapBlock(gaps[0])
    : '';

  // Combine all story-related prompts
  const storyPrompt = [
    STORY_DETECTION_PROMPT,
    '',
    progressBlock,
    gapBlock,
    '',
    ANALYSIS_REQUEST_PROMPT,
  ].filter(Boolean).join('\n');

  return {
    storyPrompt,
    storyProgress: progress,
    gapSuggestion: gaps[0] || null,
  };
}

/**
 * Get current story collection progress for a user.
 */
async function getStoryProgress(db, userId) {
  try {
    // Total fragments
    const countResult = await db.query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed
       FROM story_fragments
       WHERE user_id = $1 AND status != 'deleted'`,
      [userId]
    );

    // Recent fragment titles
    const recentResult = await db.query(
      `SELECT title, created_at
       FROM story_fragments
       WHERE user_id = $1 AND status != 'deleted'
       ORDER BY created_at DESC
       LIMIT 3`,
      [userId]
    );

    return {
      totalFragments: parseInt(countResult.rows[0]?.total || 0),
      confirmedFragments: parseInt(countResult.rows[0]?.confirmed || 0),
      recentTitles: recentResult.rows.map(r => r.title),
    };
  } catch (error) {
    console.error('Failed to get story progress:', error);
    return { totalFragments: 0, confirmedFragments: 0, recentTitles: [] };
  }
}

/**
 * Analyze which life areas have been covered and find gaps.
 */
async function getCoverageGaps(db, userId) {
  try {
    // Get all themes from confirmed/draft fragments
    const result = await db.query(
      `SELECT DISTINCT unnest(tags_theme) as theme
       FROM story_fragments
       WHERE user_id = $1 AND status IN ('draft', 'confirmed')`,
      [userId]
    );

    const coveredThemes = new Set(result.rows.map(r => r.theme));

    // Map coverage areas to themes
    const areaThemeMap = {
      childhood: ['family', 'home', 'education'],
      school: ['education', 'friendship', 'growth'],
      first_love: ['love'],
      career_beginning: ['work', 'challenge'],
      marriage: ['love', 'family'],
      children: ['family', 'growth'],
      faith: ['faith'],
      transitions: ['challenge', 'growth', 'migration'],
      proudest_moment: ['gratitude', 'growth'],
      biggest_challenge: ['challenge', 'loss'],
      current_chapter: ['identity', 'dream'],
    };

    // Find uncovered areas
    const gaps = COVERAGE_AREAS.filter(area => {
      const themes = areaThemeMap[area] || [];
      return !themes.some(t => coveredThemes.has(t));
    });

    // Check skip count (don't suggest areas that were already skipped twice)
    const skipResult = await db.query(
      `SELECT input_data->>'gap_area' as area, COUNT(*) as attempts
       FROM fragment_generation_queue
       WHERE user_id = $1
         AND job_type = 'cluster_fragments'
         AND input_data->>'type' = 'gap_attempt'
       GROUP BY input_data->>'gap_area'
       HAVING COUNT(*) >= 2`,
      [userId]
    );

    const skippedAreas = new Set(skipResult.rows.map(r => r.area));
    return gaps.filter(g => !skippedAreas.has(g));
  } catch (error) {
    console.error('Failed to get coverage gaps:', error);
    return COVERAGE_AREAS; // Return all as gaps if query fails
  }
}

/**
 * Get when the last story-related question was asked.
 */
async function getLastStoryQuestion(db, userId) {
  try {
    const result = await db.query(
      `SELECT started_at, fragment_elements
       FROM chat_sessions
       WHERE user_id = $1
         AND fragment_elements->>'deepening_question_asked' = 'true'
       ORDER BY started_at DESC
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) return null;

    return {
      date: result.rows[0].started_at,
      topic: result.rows[0].fragment_elements?.deepening_topic,
    };
  } catch (error) {
    console.error('Failed to get last story question:', error);
    return null;
  }
}

/**
 * Build the story progress context block.
 */
function buildProgressBlock(progress, lastQuestion) {
  const lines = ['=== Story progress for this user ==='];
  lines.push(`Total fragments: ${progress.totalFragments}`);

  if (progress.recentTitles.length > 0) {
    lines.push(`Recent fragments: ${progress.recentTitles.join(', ')}`);
  } else {
    lines.push('No fragments created yet — this is a new user for story collection.');
  }

  if (lastQuestion) {
    const daysAgo = Math.floor(
      (Date.now() - new Date(lastQuestion.date).getTime()) / (1000 * 60 * 60 * 24)
    );
    lines.push(`Last story question: ${daysAgo} days ago (topic: ${lastQuestion.topic || 'general'})`);
  } else {
    lines.push('No story questions asked yet.');
  }

  return lines.join('\n');
}

/**
 * Build the gap suggestion block.
 */
function buildGapBlock(gapArea) {
  const gapLabels = {
    childhood: 'Childhood & family origin',
    school: 'School years',
    first_love: 'First love / significant relationships',
    career_beginning: 'Career beginnings',
    marriage: 'Marriage / partnership',
    children: 'Children & parenting',
    faith: 'Faith & spiritual journey',
    transitions: 'Major life transitions',
    proudest_moment: 'Proudest moments',
    biggest_challenge: 'Biggest challenges overcome',
    current_chapter: 'Current chapter of life',
  };

  return [
    '',
    '=== Suggested gap to explore (if natural opportunity arises) ===',
    `Uncovered area: ${gapLabels[gapArea] || gapArea}`,
    'Only ask about this if the conversation naturally touches this topic.',
    'Do NOT force it.',
  ].join('\n');
}

/**
 * Parse Emma's analysis block from her response.
 *
 * @param {string} rawResponse - Emma's full response including <emma_analysis>
 * @returns {Object} { cleanResponse, emotion, fragment }
 */
function parseEmmaAnalysis(rawResponse) {
  const analysisMatch = rawResponse.match(
    /<emma_analysis>\s*([\s\S]*?)\s*<\/emma_analysis>/
  );

  if (!analysisMatch) {
    return {
      cleanResponse: rawResponse,
      emotion: null,
      fragment: null,
    };
  }

  const cleanResponse = rawResponse
    .replace(/<emma_analysis>[\s\S]*?<\/emma_analysis>/, '')
    .trim();

  try {
    const analysis = JSON.parse(analysisMatch[1]);
    return {
      cleanResponse,
      emotion: analysis.emotion || null,
      fragment: analysis.fragment || null,
    };
  } catch (error) {
    console.error('Failed to parse emma_analysis JSON:', error);
    return {
      cleanResponse,
      emotion: null,
      fragment: null,
    };
  }
}

/**
 * Save fragment detection data to chat_sessions.
 *
 * @param {Object} db - Database connection
 * @param {string} sessionId - Chat session UUID
 * @param {Object} fragmentData - Parsed fragment data from emma_analysis
 */
async function saveFragmentDetection(db, sessionId, fragmentData) {
  if (!fragmentData || !fragmentData.detected) return;

  try {
    await db.query(
      `UPDATE chat_sessions
       SET fragment_candidate = true,
           fragment_elements = $1
       WHERE id = $2`,
      [JSON.stringify(fragmentData), sessionId]
    );
  } catch (error) {
    console.error('Failed to save fragment detection:', error);
  }
}

/**
 * Queue a fragment generation job after a conversation ends.
 *
 * @param {Object} db - Database connection
 * @param {number} userId - User ID
 * @param {string} sessionId - Chat session UUID
 */
async function queueFragmentGeneration(db, userId, sessionId) {
  try {
    // Check if this session has fragment candidates
    const session = await db.query(
      `SELECT id, fragment_candidate, fragment_elements
       FROM chat_sessions
       WHERE id = $1 AND user_id = $2 AND fragment_candidate = true`,
      [sessionId, userId]
    );

    if (session.rows.length === 0) return null;

    const elements = session.rows[0].fragment_elements;
    const completeness = elements?.completeness || 0;

    // Only queue if we have enough elements (3+)
    if (completeness < 3) return null;

    // Get related memory nodes for this session
    const memories = await db.query(
      `SELECT id FROM memory_nodes
       WHERE user_id = $1
         AND last_mentioned >= (
           SELECT started_at FROM chat_sessions WHERE id = $2
         )
         AND narrative_relevance >= 3
       ORDER BY narrative_relevance DESC
       LIMIT 10`,
      [userId, sessionId]
    );

    const jobData = {
      session_ids: [sessionId],
      memory_node_ids: memories.rows.map(r => r.id),
      elements: elements,
    };

    // Insert into generation queue
    const result = await db.query(
      `INSERT INTO fragment_generation_queue
         (user_id, job_type, input_data, priority)
       VALUES ($1, 'generate_fragment', $2, 8)
       RETURNING id`,
      [userId, JSON.stringify(jobData)]
    );

    return result.rows[0]?.id;
  } catch (error) {
    console.error('Failed to queue fragment generation:', error);
    return null;
  }
}

module.exports = {
  buildStoryContext,
  parseEmmaAnalysis,
  saveFragmentDetection,
  queueFragmentGeneration,
  getStoryProgress,
  getCoverageGaps,
};
