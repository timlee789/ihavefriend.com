/**
 * lib/enumMappers.js
 *
 * Bidirectional conversion between existing code values (snake_case / lowercase)
 * and v2 schema Prisma Enum values (SCREAMING_CASE).
 *
 * Usage pattern:
 *   INSERT/UPDATE: use xxxToDb()   (to convert code value → DB enum)
 *   SELECT → biz: use xxxFromDb()  (to convert DB enum → code value)
 *
 * All functions are null-safe and include fallback values.
 *
 * Generated: 2026-04-23
 * Based on: wiki/projects/sayandkeep/experiments/10-schema-prisma-v2-design.md
 *           wiki/projects/sayandkeep/experiments/13-enum-mapper-design.md
 */

// ════════════════════════════════════════════════════════════════
// 1. MemoryCategory  (17 values)
// ════════════════════════════════════════════════════════════════

const MEMORY_CATEGORY_TO_DB = {
  'emotion':           'EMOTION',
  'work_career':       'WORK_CAREER',
  'social_life':       'SOCIAL_LIFE',
  'routine':           'ROUTINE',
  'identity':          'IDENTITY',
  'preferences':       'PREFERENCES',
  'goals':             'GOALS',
  'life_story':        'LIFE_STORY',
  'upcoming':          'UPCOMING',
  'health':            'HEALTH',
  'hobbies':           'HOBBIES',
  'people':            'PEOPLE',
  'living_situation':  'LIVING_SITUATION',
  'finance':           'FINANCE',
  'turning_point':     'TURNING_POINT',
  'value':             'VALUE',
  'other':             'OTHER',
};

const MEMORY_CATEGORY_FROM_DB = Object.fromEntries(
  Object.entries(MEMORY_CATEGORY_TO_DB).map(([k, v]) => [v, k])
);

function memoryCategoryToDb(value) {
  if (value == null) return null;
  const mapped = MEMORY_CATEGORY_TO_DB[value];
  if (mapped == null) {
    // Accept already-uppercase values (idempotent)
    if (MEMORY_CATEGORY_FROM_DB[value]) return value;
    console.warn(`[enumMappers] Unknown MemoryCategory: "${value}" — using OTHER`);
    return 'OTHER';
  }
  return mapped;
}

function memoryCategoryFromDb(value) {
  if (value == null) return null;
  return MEMORY_CATEGORY_FROM_DB[value] || value;
}

function memoryCategoriesToDb(values) {
  if (!Array.isArray(values)) return [];
  return values.map(memoryCategoryToDb).filter(Boolean);
}

function memoryCategoriesFromDb(values) {
  if (!Array.isArray(values)) return [];
  return values.map(memoryCategoryFromDb).filter(Boolean);
}

// ════════════════════════════════════════════════════════════════
// 2. Confidence  (3 values)
// ════════════════════════════════════════════════════════════════

const CONFIDENCE_TO_DB = {
  'high':   'HIGH',
  'medium': 'MEDIUM',
  'low':    'LOW',
};

const CONFIDENCE_FROM_DB = Object.fromEntries(
  Object.entries(CONFIDENCE_TO_DB).map(([k, v]) => [v, k])
);

function confidenceToDb(value) {
  if (value == null) return null;
  const mapped = CONFIDENCE_TO_DB[value];
  if (mapped == null) {
    if (CONFIDENCE_FROM_DB[value]) return value;
    console.warn(`[enumMappers] Unknown Confidence: "${value}" — using MEDIUM`);
    return 'MEDIUM';
  }
  return mapped;
}

function confidenceFromDb(value) {
  if (value == null) return null;
  return CONFIDENCE_FROM_DB[value] || value;
}

// ════════════════════════════════════════════════════════════════
// 3. RecallPriority  (4 values)
// ════════════════════════════════════════════════════════════════

const RECALL_PRIORITY_TO_DB = {
  'always':     'ALWAYS',
  'contextual': 'CONTEXTUAL',
  'proactive':  'PROACTIVE',
  'background': 'BACKGROUND',
};

const RECALL_PRIORITY_FROM_DB = Object.fromEntries(
  Object.entries(RECALL_PRIORITY_TO_DB).map(([k, v]) => [v, k])
);

function recallPriorityToDb(value) {
  if (value == null) return null;
  const mapped = RECALL_PRIORITY_TO_DB[value];
  if (mapped == null) {
    if (RECALL_PRIORITY_FROM_DB[value]) return value;
    console.warn(`[enumMappers] Unknown RecallPriority: "${value}" — using CONTEXTUAL`);
    return 'CONTEXTUAL';
  }
  return mapped;
}

function recallPriorityFromDb(value) {
  if (value == null) return null;
  return RECALL_PRIORITY_FROM_DB[value] || value;
}

// ════════════════════════════════════════════════════════════════
// 4. AlertSeverity  (3 values)
// ════════════════════════════════════════════════════════════════

const ALERT_SEVERITY_TO_DB = {
  'monitor': 'MONITOR',
  'warning': 'WARNING',
  'urgent':  'URGENT',
};

const ALERT_SEVERITY_FROM_DB = Object.fromEntries(
  Object.entries(ALERT_SEVERITY_TO_DB).map(([k, v]) => [v, k])
);

function alertSeverityToDb(value) {
  if (value == null) return null;
  const mapped = ALERT_SEVERITY_TO_DB[value];
  if (mapped == null) {
    if (ALERT_SEVERITY_FROM_DB[value]) return value;
    console.warn(`[enumMappers] Unknown AlertSeverity: "${value}" — using MONITOR`);
    return 'MONITOR';
  }
  return mapped;
}

function alertSeverityFromDb(value) {
  if (value == null) return null;
  return ALERT_SEVERITY_FROM_DB[value] || value;
}

// ════════════════════════════════════════════════════════════════
// 5. EmotionalArc  (4 values)
// ════════════════════════════════════════════════════════════════

const EMOTIONAL_ARC_TO_DB = {
  'improving': 'IMPROVING',
  'declining': 'DECLINING',
  'stable':    'STABLE',
  'volatile':  'VOLATILE',
};

const EMOTIONAL_ARC_FROM_DB = Object.fromEntries(
  Object.entries(EMOTIONAL_ARC_TO_DB).map(([k, v]) => [v, k])
);

function emotionalArcToDb(value) {
  if (value == null) return null;
  const mapped = EMOTIONAL_ARC_TO_DB[value];
  if (mapped == null) {
    if (EMOTIONAL_ARC_FROM_DB[value]) return value;
    console.warn(`[enumMappers] Unknown EmotionalArc: "${value}" — using STABLE`);
    return 'STABLE';
  }
  return mapped;
}

function emotionalArcFromDb(value) {
  if (value == null) return null;
  return EMOTIONAL_ARC_FROM_DB[value] || value;
}

// ════════════════════════════════════════════════════════════════
// 6. FragmentStatus  (4 values)
// ════════════════════════════════════════════════════════════════

const FRAGMENT_STATUS_TO_DB = {
  'draft':     'DRAFT',
  'confirmed': 'CONFIRMED',
  'archived':  'ARCHIVED',
  'deleted':   'DELETED',
};

const FRAGMENT_STATUS_FROM_DB = Object.fromEntries(
  Object.entries(FRAGMENT_STATUS_TO_DB).map(([k, v]) => [v, k])
);

function fragmentStatusToDb(value) {
  if (value == null) return null;
  const mapped = FRAGMENT_STATUS_TO_DB[value];
  if (mapped == null) {
    if (FRAGMENT_STATUS_FROM_DB[value]) return value;
    console.warn(`[enumMappers] Unknown FragmentStatus: "${value}" — using DRAFT`);
    return 'DRAFT';
  }
  return mapped;
}

function fragmentStatusFromDb(value) {
  if (value == null) return null;
  return FRAGMENT_STATUS_FROM_DB[value] || value;
}

function fragmentStatusesToDb(values) {
  if (!Array.isArray(values)) return [];
  return values.map(fragmentStatusToDb).filter(Boolean);
}

function fragmentStatusesFromDb(values) {
  if (!Array.isArray(values)) return [];
  return values.map(fragmentStatusFromDb).filter(Boolean);
}

// ════════════════════════════════════════════════════════════════
// 7. Visibility  (5 values — v2 extended)
// ════════════════════════════════════════════════════════════════

const VISIBILITY_TO_DB = {
  'private':            'PRIVATE',
  'private_to_person':  'PRIVATE_TO_PERSON',
  'family':             'FAMILY',
  'close_friends':      'CLOSE_FRIENDS',
  'public':             'PUBLIC',
  // Legacy 'shared' mapped to FAMILY (safest interpretation for SayAndKeep)
  'shared':             'FAMILY',
};

const VISIBILITY_FROM_DB = {
  'PRIVATE':            'private',
  'PRIVATE_TO_PERSON':  'private_to_person',
  'FAMILY':             'family',
  'CLOSE_FRIENDS':      'close_friends',
  'PUBLIC':             'public',
};

function visibilityToDb(value) {
  if (value == null) return null;
  const mapped = VISIBILITY_TO_DB[value];
  if (mapped == null) {
    if (VISIBILITY_FROM_DB[value]) return value;
    console.warn(`[enumMappers] Unknown Visibility: "${value}" — using PRIVATE`);
    return 'PRIVATE';
  }
  return mapped;
}

function visibilityFromDb(value) {
  if (value == null) return null;
  return VISIBILITY_FROM_DB[value] || value;
}

// ════════════════════════════════════════════════════════════════
// 8. VoiceStyle  (3 values)
// ════════════════════════════════════════════════════════════════

const VOICE_STYLE_TO_DB = {
  'conversational': 'CONVERSATIONAL',
  'narrative':      'NARRATIVE',
  'letter':         'LETTER',
};

const VOICE_STYLE_FROM_DB = Object.fromEntries(
  Object.entries(VOICE_STYLE_TO_DB).map(([k, v]) => [v, k])
);

function voiceStyleToDb(value) {
  if (value == null) return null;
  const mapped = VOICE_STYLE_TO_DB[value];
  if (mapped == null) {
    if (VOICE_STYLE_FROM_DB[value]) return value;
    console.warn(`[enumMappers] Unknown VoiceStyle: "${value}" — using CONVERSATIONAL`);
    return 'CONVERSATIONAL';
  }
  return mapped;
}

function voiceStyleFromDb(value) {
  if (value == null) return null;
  return VOICE_STYLE_FROM_DB[value] || value;
}

// ════════════════════════════════════════════════════════════════
// 9. BookStatus  (6 values)
// ════════════════════════════════════════════════════════════════

const BOOK_STATUS_TO_DB = {
  'draft':      'DRAFT',
  'pending':    'PENDING',
  'generating': 'GENERATING',
  'review':     'REVIEW',
  'completed':  'COMPLETED',
  'published':  'PUBLISHED',
};

const BOOK_STATUS_FROM_DB = Object.fromEntries(
  Object.entries(BOOK_STATUS_TO_DB).map(([k, v]) => [v, k])
);

function bookStatusToDb(value) {
  if (value == null) return null;
  const mapped = BOOK_STATUS_TO_DB[value];
  if (mapped == null) {
    if (BOOK_STATUS_FROM_DB[value]) return value;
    console.warn(`[enumMappers] Unknown BookStatus: "${value}" — using DRAFT`);
    return 'DRAFT';
  }
  return mapped;
}

function bookStatusFromDb(value) {
  if (value == null) return null;
  return BOOK_STATUS_FROM_DB[value] || value;
}

// ════════════════════════════════════════════════════════════════
// 10. BookFormat  (3 values)
// ════════════════════════════════════════════════════════════════

const BOOK_FORMAT_TO_DB = {
  'web':   'WEB',
  'pdf':   'PDF',
  'print': 'PRINT',
};

const BOOK_FORMAT_FROM_DB = Object.fromEntries(
  Object.entries(BOOK_FORMAT_TO_DB).map(([k, v]) => [v, k])
);

function bookFormatToDb(value) {
  if (value == null) return null;
  const mapped = BOOK_FORMAT_TO_DB[value];
  if (mapped == null) {
    if (BOOK_FORMAT_FROM_DB[value]) return value;
    console.warn(`[enumMappers] Unknown BookFormat: "${value}" — using WEB`);
    return 'WEB';
  }
  return mapped;
}

function bookFormatFromDb(value) {
  if (value == null) return null;
  return BOOK_FORMAT_FROM_DB[value] || value;
}

// ════════════════════════════════════════════════════════════════
// 11. PipelineVersion  (2 values: A / B)
// ════════════════════════════════════════════════════════════════
// Accepts both lowercase 'a' / 'b' and uppercase (idempotent).

function pipelineVersionToDb(value) {
  if (value == null) return null;
  const upper = String(value).toUpperCase();
  if (upper === 'A' || upper === 'B') return upper;
  console.warn(`[enumMappers] Unknown PipelineVersion: "${value}" — using A`);
  return 'A';
}

function pipelineVersionFromDb(value) {
  if (value == null) return null;
  const upper = String(value).toUpperCase();
  return (upper === 'A' || upper === 'B') ? upper : null;
}

// ════════════════════════════════════════════════════════════════
// 12. VerificationVerdict  (3 values)
// ════════════════════════════════════════════════════════════════

const VERIFICATION_VERDICT_TO_DB = {
  'pass':   'PASS',
  'revise': 'REVISE',
  'reject': 'REJECT',
};

const VERIFICATION_VERDICT_FROM_DB = Object.fromEntries(
  Object.entries(VERIFICATION_VERDICT_TO_DB).map(([k, v]) => [v, k])
);

function verificationVerdictToDb(value) {
  if (value == null) return null;
  const mapped = VERIFICATION_VERDICT_TO_DB[value];
  if (mapped == null) {
    if (VERIFICATION_VERDICT_FROM_DB[value]) return value;
    console.warn(`[enumMappers] Unknown VerificationVerdict: "${value}" — using null`);
    return null;
  }
  return mapped;
}

function verificationVerdictFromDb(value) {
  if (value == null) return null;
  return VERIFICATION_VERDICT_FROM_DB[value] || value;
}

// ════════════════════════════════════════════════════════════════
// 13. IntendedAudience  (8 values — array in DB)
// ════════════════════════════════════════════════════════════════

const INTENDED_AUDIENCE_TO_DB = {
  'myself':               'MYSELF',
  'spouse':               'SPOUSE',
  'children':             'CHILDREN',
  'daughter':             'DAUGHTER',
  'son':                  'SON',
  'future_grandchildren': 'FUTURE_GRANDCHILDREN',
  'friends':              'FRIENDS',
  'public_readers':       'PUBLIC_READERS',
};

const INTENDED_AUDIENCE_FROM_DB = Object.fromEntries(
  Object.entries(INTENDED_AUDIENCE_TO_DB).map(([k, v]) => [v, k])
);

function intendedAudienceToDb(value) {
  if (value == null) return null;
  const mapped = INTENDED_AUDIENCE_TO_DB[value];
  if (mapped == null) {
    if (INTENDED_AUDIENCE_FROM_DB[value]) return value;
    console.warn(`[enumMappers] Unknown IntendedAudience: "${value}" — dropping`);
    return null;
  }
  return mapped;
}

function intendedAudienceFromDb(value) {
  if (value == null) return null;
  return INTENDED_AUDIENCE_FROM_DB[value] || value;
}

function intendedAudiencesToDb(values) {
  if (!Array.isArray(values)) return [];
  return values.map(intendedAudienceToDb).filter(Boolean);
}

function intendedAudiencesFromDb(values) {
  if (!Array.isArray(values)) return [];
  return values.map(intendedAudienceFromDb).filter(Boolean);
}

// ════════════════════════════════════════════════════════════════
// 14. StoryRelationshipType  (5 values)
// ════════════════════════════════════════════════════════════════

const STORY_RELATIONSHIP_TYPE_TO_DB = {
  'follows':   'FOLLOWS',
  'contrasts': 'CONTRASTS',
  'expands':   'EXPANDS',
  'echoes':    'ECHOES',
  'caused_by': 'CAUSED_BY',
};

const STORY_RELATIONSHIP_TYPE_FROM_DB = Object.fromEntries(
  Object.entries(STORY_RELATIONSHIP_TYPE_TO_DB).map(([k, v]) => [v, k])
);

function storyRelationshipTypeToDb(value) {
  if (value == null) return null;
  const mapped = STORY_RELATIONSHIP_TYPE_TO_DB[value];
  if (mapped == null) {
    if (STORY_RELATIONSHIP_TYPE_FROM_DB[value]) return value;
    console.warn(`[enumMappers] Unknown StoryRelationshipType: "${value}" — using null`);
    return null;
  }
  return mapped;
}

function storyRelationshipTypeFromDb(value) {
  if (value == null) return null;
  return STORY_RELATIONSHIP_TYPE_FROM_DB[value] || value;
}

// ════════════════════════════════════════════════════════════════
// 15. ConversationMode  (3 values)
// ════════════════════════════════════════════════════════════════

const CONVERSATION_MODE_TO_DB = {
  'auto':      'AUTO',
  'companion': 'COMPANION',
  'story':     'STORY',
};

const CONVERSATION_MODE_FROM_DB = Object.fromEntries(
  Object.entries(CONVERSATION_MODE_TO_DB).map(([k, v]) => [v, k])
);

function conversationModeToDb(value) {
  if (value == null) return null;
  const mapped = CONVERSATION_MODE_TO_DB[value];
  if (mapped == null) {
    if (CONVERSATION_MODE_FROM_DB[value]) return value;
    console.warn(`[enumMappers] Unknown ConversationMode: "${value}" — using AUTO`);
    return 'AUTO';
  }
  return mapped;
}

function conversationModeFromDb(value) {
  if (value == null) return null;
  return CONVERSATION_MODE_FROM_DB[value] || value;
}

// ════════════════════════════════════════════════════════════════
// ROW-LEVEL HELPERS — convert all enum fields of a single DB row
// ════════════════════════════════════════════════════════════════

/**
 * memory_nodes row → biz-logic-compatible (snake/lowercase)
 */
function memoryNodeFromDb(row) {
  if (!row) return row;
  return {
    ...row,
    primary_category:     memoryCategoryFromDb(row.primary_category),
    secondary_categories: memoryCategoriesFromDb(row.secondary_categories),
    confidence:           confidenceFromDb(row.confidence),
    recall_priority:      recallPriorityFromDb(row.recall_priority),
  };
}

/**
 * story_fragments row → biz-logic-compatible
 */
function storyFragmentFromDb(row) {
  if (!row) return row;
  return {
    ...row,
    status:                fragmentStatusFromDb(row.status),
    visibility:            visibilityFromDb(row.visibility),
    voice_style:           voiceStyleFromDb(row.voice_style),
    pipeline_version:      pipelineVersionFromDb(row.pipeline_version),
    verification_verdict:  verificationVerdictFromDb(row.verification_verdict),
    intended_audience:     intendedAudiencesFromDb(row.intended_audience),
  };
}

/**
 * books row → biz-logic-compatible
 */
function bookFromDb(row) {
  if (!row) return row;
  return {
    ...row,
    status:            bookStatusFromDb(row.status),
    format:            bookFormatFromDb(row.format),
    pipeline_version:  pipelineVersionFromDb(row.pipeline_version),
  };
}

/**
 * emotion_sessions row → biz-logic-compatible
 */
function emotionSessionFromDb(row) {
  if (!row) return row;
  return {
    ...row,
    emotional_arc: emotionalArcFromDb(row.emotional_arc),
  };
}

/**
 * emotion_alerts row → biz-logic-compatible
 */
function emotionAlertFromDb(row) {
  if (!row) return row;
  return {
    ...row,
    severity: alertSeverityFromDb(row.severity),
  };
}

/**
 * chat_sessions row → biz-logic-compatible
 */
function chatSessionFromDb(row) {
  if (!row) return row;
  return {
    ...row,
    conversation_mode: conversationModeFromDb(row.conversation_mode),
  };
}

/**
 * emma_reflections row → biz-logic-compatible (uses Confidence)
 */
function emmaReflectionFromDb(row) {
  if (!row) return row;
  return {
    ...row,
    confidence: confidenceFromDb(row.confidence),
  };
}

/**
 * story_relationships row → biz-logic-compatible
 */
function storyRelationshipFromDb(row) {
  if (!row) return row;
  return {
    ...row,
    relationship: storyRelationshipTypeFromDb(row.relationship),
  };
}

/**
 * experiment_runs row → biz-logic-compatible
 */
function experimentRunFromDb(row) {
  if (!row) return row;
  return {
    ...row,
    pipeline_version: pipelineVersionFromDb(row.pipeline_version),
  };
}

/**
 * fragment_generation_queue row → biz-logic-compatible
 */
function generationQueueFromDb(row) {
  if (!row) return row;
  return {
    ...row,
    pipeline_version: pipelineVersionFromDb(row.pipeline_version),
  };
}

// ════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════

module.exports = {
  // ── Individual enum converters ────────────────────────────────
  memoryCategoryToDb,
  memoryCategoryFromDb,
  memoryCategoriesToDb,
  memoryCategoriesFromDb,

  confidenceToDb,
  confidenceFromDb,

  recallPriorityToDb,
  recallPriorityFromDb,

  alertSeverityToDb,
  alertSeverityFromDb,

  emotionalArcToDb,
  emotionalArcFromDb,

  fragmentStatusToDb,
  fragmentStatusFromDb,
  fragmentStatusesToDb,
  fragmentStatusesFromDb,

  visibilityToDb,
  visibilityFromDb,

  voiceStyleToDb,
  voiceStyleFromDb,

  bookStatusToDb,
  bookStatusFromDb,

  bookFormatToDb,
  bookFormatFromDb,

  pipelineVersionToDb,
  pipelineVersionFromDb,

  verificationVerdictToDb,
  verificationVerdictFromDb,

  intendedAudienceToDb,
  intendedAudienceFromDb,
  intendedAudiencesToDb,
  intendedAudiencesFromDb,

  storyRelationshipTypeToDb,
  storyRelationshipTypeFromDb,

  conversationModeToDb,
  conversationModeFromDb,

  // ── Row-level helpers ─────────────────────────────────────────
  memoryNodeFromDb,
  storyFragmentFromDb,
  bookFromDb,
  emotionSessionFromDb,
  emotionAlertFromDb,
  chatSessionFromDb,
  emmaReflectionFromDb,
  storyRelationshipFromDb,
  experimentRunFromDb,
  generationQueueFromDb,

  // ── Raw maps (for advanced use / testing) ────────────────────
  MEMORY_CATEGORY_TO_DB,
  MEMORY_CATEGORY_FROM_DB,
  CONFIDENCE_TO_DB,
  CONFIDENCE_FROM_DB,
  RECALL_PRIORITY_TO_DB,
  RECALL_PRIORITY_FROM_DB,
  ALERT_SEVERITY_TO_DB,
  ALERT_SEVERITY_FROM_DB,
  EMOTIONAL_ARC_TO_DB,
  EMOTIONAL_ARC_FROM_DB,
  FRAGMENT_STATUS_TO_DB,
  FRAGMENT_STATUS_FROM_DB,
  VISIBILITY_TO_DB,
  VISIBILITY_FROM_DB,
  VOICE_STYLE_TO_DB,
  VOICE_STYLE_FROM_DB,
  BOOK_STATUS_TO_DB,
  BOOK_STATUS_FROM_DB,
  BOOK_FORMAT_TO_DB,
  BOOK_FORMAT_FROM_DB,
  VERIFICATION_VERDICT_TO_DB,
  VERIFICATION_VERDICT_FROM_DB,
  INTENDED_AUDIENCE_TO_DB,
  INTENDED_AUDIENCE_FROM_DB,
  STORY_RELATIONSHIP_TYPE_TO_DB,
  STORY_RELATIONSHIP_TYPE_FROM_DB,
  CONVERSATION_MODE_TO_DB,
  CONVERSATION_MODE_FROM_DB,
};
