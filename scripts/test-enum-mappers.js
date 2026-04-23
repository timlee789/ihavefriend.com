/**
 * scripts/test-enum-mappers.js
 *
 * Quick sanity test for lib/enumMappers.js
 * Run: node scripts/test-enum-mappers.js
 *
 * Expected output: all PASS lines, exit code 0.
 * If any FAIL line appears, the mapper file has a bug.
 */

const m = require('../lib/enumMappers.js');

let passed = 0;
let failed = 0;

function assert(label, actual, expected) {
  const ok = actual === expected;
  if (ok) {
    passed++;
    console.log(`  ✓ PASS  ${label}  (${JSON.stringify(actual)})`);
  } else {
    failed++;
    console.log(`  ✗ FAIL  ${label}`);
    console.log(`          expected: ${JSON.stringify(expected)}`);
    console.log(`          actual:   ${JSON.stringify(actual)}`);
  }
}

function assertArr(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✓ PASS  ${label}  (${JSON.stringify(actual)})`);
  } else {
    failed++;
    console.log(`  ✗ FAIL  ${label}`);
    console.log(`          expected: ${JSON.stringify(expected)}`);
    console.log(`          actual:   ${JSON.stringify(actual)}`);
  }
}

console.log('\n=== Enum Mappers Test Suite ===\n');

// ── 1. MemoryCategory ────────────────────────────────────────────
console.log('1. MemoryCategory');
assert('toDb emotion',         m.memoryCategoryToDb('emotion'),          'EMOTION');
assert('toDb work_career',     m.memoryCategoryToDb('work_career'),      'WORK_CAREER');
assert('toDb living_situation',m.memoryCategoryToDb('living_situation'), 'LIVING_SITUATION');
assert('toDb turning_point',   m.memoryCategoryToDb('turning_point'),    'TURNING_POINT');
assert('toDb idempotent',      m.memoryCategoryToDb('EMOTION'),          'EMOTION');
assert('toDb unknown',         m.memoryCategoryToDb('xyz'),              'OTHER');
assert('toDb null',            m.memoryCategoryToDb(null),               null);
assert('fromDb EMOTION',       m.memoryCategoryFromDb('EMOTION'),        'emotion');
assert('fromDb LIFE_STORY',    m.memoryCategoryFromDb('LIFE_STORY'),     'life_story');
assert('fromDb null',          m.memoryCategoryFromDb(null),             null);
assertArr('toDb []',           m.memoryCategoriesToDb([]),               []);
assertArr('toDb array',        m.memoryCategoriesToDb(['emotion','health']), ['EMOTION','HEALTH']);
assertArr('fromDb array',      m.memoryCategoriesFromDb(['EMOTION','HEALTH']), ['emotion','health']);

// ── 2. Confidence ────────────────────────────────────────────────
console.log('\n2. Confidence');
assert('toDb high',    m.confidenceToDb('high'),   'HIGH');
assert('toDb medium',  m.confidenceToDb('medium'), 'MEDIUM');
assert('toDb low',     m.confidenceToDb('low'),    'LOW');
assert('toDb unknown', m.confidenceToDb('xyz'),    'MEDIUM');
assert('fromDb HIGH',  m.confidenceFromDb('HIGH'), 'high');

// ── 3. RecallPriority ────────────────────────────────────────────
console.log('\n3. RecallPriority');
assert('toDb always',     m.recallPriorityToDb('always'),     'ALWAYS');
assert('toDb contextual', m.recallPriorityToDb('contextual'), 'CONTEXTUAL');
assert('toDb proactive',  m.recallPriorityToDb('proactive'),  'PROACTIVE');
assert('toDb background', m.recallPriorityToDb('background'), 'BACKGROUND');
assert('fromDb ALWAYS',   m.recallPriorityFromDb('ALWAYS'),   'always');

// ── 4. AlertSeverity ─────────────────────────────────────────────
console.log('\n4. AlertSeverity');
assert('toDb monitor', m.alertSeverityToDb('monitor'), 'MONITOR');
assert('toDb warning', m.alertSeverityToDb('warning'), 'WARNING');
assert('toDb urgent',  m.alertSeverityToDb('urgent'),  'URGENT');
assert('fromDb URGENT',m.alertSeverityFromDb('URGENT'),'urgent');

// ── 5. EmotionalArc ──────────────────────────────────────────────
console.log('\n5. EmotionalArc');
assert('toDb improving', m.emotionalArcToDb('improving'), 'IMPROVING');
assert('toDb stable',    m.emotionalArcToDb('stable'),    'STABLE');
assert('toDb volatile',  m.emotionalArcToDb('volatile'),  'VOLATILE');
assert('fromDb DECLINING', m.emotionalArcFromDb('DECLINING'), 'declining');

// ── 6. FragmentStatus ────────────────────────────────────────────
console.log('\n6. FragmentStatus');
assert('toDb draft',     m.fragmentStatusToDb('draft'),     'DRAFT');
assert('toDb confirmed', m.fragmentStatusToDb('confirmed'), 'CONFIRMED');
assert('toDb archived',  m.fragmentStatusToDb('archived'),  'ARCHIVED');
assert('toDb deleted',   m.fragmentStatusToDb('deleted'),   'DELETED');
assert('fromDb DELETED', m.fragmentStatusFromDb('DELETED'), 'deleted');
assertArr('statuses toDb',   m.fragmentStatusesToDb(['draft','confirmed']), ['DRAFT','CONFIRMED']);
assertArr('statuses fromDb', m.fragmentStatusesFromDb(['DRAFT','CONFIRMED']), ['draft','confirmed']);

// ── 7. Visibility ────────────────────────────────────────────────
console.log('\n7. Visibility');
assert('toDb private', m.visibilityToDb('private'), 'PRIVATE');
assert('toDb family',  m.visibilityToDb('family'),  'FAMILY');
assert('toDb public',  m.visibilityToDb('public'),  'PUBLIC');
assert('toDb shared→FAMILY (legacy)', m.visibilityToDb('shared'), 'FAMILY');
assert('fromDb CLOSE_FRIENDS', m.visibilityFromDb('CLOSE_FRIENDS'), 'close_friends');

// ── 8. VoiceStyle ────────────────────────────────────────────────
console.log('\n8. VoiceStyle');
assert('toDb conversational', m.voiceStyleToDb('conversational'), 'CONVERSATIONAL');
assert('fromDb NARRATIVE',    m.voiceStyleFromDb('NARRATIVE'),    'narrative');

// ── 9. BookStatus ────────────────────────────────────────────────
console.log('\n9. BookStatus');
assert('toDb pending',   m.bookStatusToDb('pending'),   'PENDING');
assert('toDb completed', m.bookStatusToDb('completed'), 'COMPLETED');
assert('fromDb GENERATING', m.bookStatusFromDb('GENERATING'), 'generating');

// ── 10. BookFormat ───────────────────────────────────────────────
console.log('\n10. BookFormat');
assert('toDb pdf', m.bookFormatToDb('pdf'), 'PDF');
assert('toDb web', m.bookFormatToDb('web'), 'WEB');
assert('fromDb PRINT', m.bookFormatFromDb('PRINT'), 'print');

// ── 11. PipelineVersion ──────────────────────────────────────────
console.log('\n11. PipelineVersion');
assert('toDb a',         m.pipelineVersionToDb('a'), 'A');
assert('toDb A (idem)',  m.pipelineVersionToDb('A'), 'A');
assert('toDb b',         m.pipelineVersionToDb('b'), 'B');
assert('fromDb B',       m.pipelineVersionFromDb('B'), 'B');

// ── 12. VerificationVerdict ──────────────────────────────────────
console.log('\n12. VerificationVerdict');
assert('toDb pass',   m.verificationVerdictToDb('pass'),   'PASS');
assert('toDb revise', m.verificationVerdictToDb('revise'), 'REVISE');
assert('fromDb REJECT', m.verificationVerdictFromDb('REJECT'), 'reject');

// ── 13. IntendedAudience ─────────────────────────────────────────
console.log('\n13. IntendedAudience');
assert('toDb daughter', m.intendedAudienceToDb('daughter'), 'DAUGHTER');
assertArr('audiences toDb', m.intendedAudiencesToDb(['daughter','spouse']), ['DAUGHTER','SPOUSE']);
assertArr('audiences fromDb', m.intendedAudiencesFromDb(['DAUGHTER','SPOUSE']), ['daughter','spouse']);

// ── 14. StoryRelationshipType ────────────────────────────────────
console.log('\n14. StoryRelationshipType');
assert('toDb follows',   m.storyRelationshipTypeToDb('follows'),   'FOLLOWS');
assert('toDb caused_by', m.storyRelationshipTypeToDb('caused_by'), 'CAUSED_BY');
assert('fromDb ECHOES',  m.storyRelationshipTypeFromDb('ECHOES'),  'echoes');

// ── 15. ConversationMode ─────────────────────────────────────────
console.log('\n15. ConversationMode');
assert('toDb auto',      m.conversationModeToDb('auto'),      'AUTO');
assert('toDb companion', m.conversationModeToDb('companion'), 'COMPANION');
assert('toDb story',     m.conversationModeToDb('story'),     'STORY');
assert('fromDb STORY',   m.conversationModeFromDb('STORY'),   'story');

// ── Row-level helpers ────────────────────────────────────────────
console.log('\n16. Row-level helpers');

const testMemNode = {
  id: 'abc',
  user_id: 1,
  primary_category: 'EMOTION',
  secondary_categories: ['HEALTH', 'PEOPLE'],
  confidence: 'HIGH',
  recall_priority: 'ALWAYS',
  emotional_weight: 5,
};
const converted = m.memoryNodeFromDb(testMemNode);
assert('memoryNodeFromDb primary_category', converted.primary_category, 'emotion');
assertArr('memoryNodeFromDb secondary_categories', converted.secondary_categories, ['health','people']);
assert('memoryNodeFromDb confidence', converted.confidence, 'high');
assert('memoryNodeFromDb recall_priority', converted.recall_priority, 'always');
assert('memoryNodeFromDb preserves other fields', converted.emotional_weight, 5);

const testFragment = {
  id: 'def',
  status: 'DRAFT',
  visibility: 'FAMILY',
  voice_style: 'CONVERSATIONAL',
  pipeline_version: 'A',
  verification_verdict: null,
  intended_audience: ['DAUGHTER', 'SPOUSE'],
  word_count: 500,
};
const fragConverted = m.storyFragmentFromDb(testFragment);
assert('storyFragmentFromDb status',      fragConverted.status,      'draft');
assert('storyFragmentFromDb visibility',  fragConverted.visibility,  'family');
assert('storyFragmentFromDb voice_style', fragConverted.voice_style, 'conversational');
assert('storyFragmentFromDb pipeline',    fragConverted.pipeline_version, 'A');
assert('storyFragmentFromDb preserves',   fragConverted.word_count,  500);

const testBook = {
  id: 'ghi',
  status: 'PENDING',
  format: 'PDF',
  pipeline_version: null,
};
const bookConverted = m.bookFromDb(testBook);
assert('bookFromDb status', bookConverted.status, 'pending');
assert('bookFromDb format', bookConverted.format, 'pdf');

// ── Null safety ──────────────────────────────────────────────────
console.log('\n17. Null / undefined safety');
assert('memoryNodeFromDb(null)',  m.memoryNodeFromDb(null),  null);
assert('storyFragmentFromDb(null)', m.storyFragmentFromDb(null), null);
assert('bookFromDb(null)', m.bookFromDb(null), null);

// ── Summary ──────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════\n');

process.exit(failed === 0 ? 0 : 1);
