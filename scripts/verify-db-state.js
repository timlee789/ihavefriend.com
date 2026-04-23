/**
 * Run: node scripts/verify-db-state.js
 *
 * This is READ-ONLY. It will not modify the database.
 * Run any time to verify DB matches expected v2 state.
 */

require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not set in .env');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const EXPECTED = {
  migrations: [
    '20260403004132_init',
    '20260423093611_reset_and_integrate_v2',
    '20260423211513_add_user_settings',
    '20260423212417_restore_ivfflat_index',
  ],
  tables: [
    'UsageLog', 'User', 'UserLimit', 'UserMemory', '_prisma_migrations',
    'books', 'chat_sessions', 'collection_fragments', 'emma_reflections',
    'emotion_alerts', 'emotion_sessions', 'emotion_turns',
    'experiment_runs', 'fragment_generation_queue', 'memory_archive',
    'memory_edges', 'memory_embeddings', 'memory_nodes', 'outreach_log',
    'push_subscriptions', 'session_feedback', 'sms_inbound', 'stories',
    'story_fragments', 'story_relationships', 'user_collections',
    'user_settings', 'user_voice_profiles',
  ],
  enums: [
    'AlertSeverity', 'BookFormat', 'BookStatus', 'Confidence',
    'ConversationMode', 'EmotionalArc', 'FragmentStatus',
    'IntendedAudience', 'MemoryCategory', 'PipelineVersion',
    'RecallPriority', 'StoryRelationshipType',
    'VerificationVerdict', 'Visibility', 'VoiceStyle',
  ],
  memoryCategoryValues: [
    'EMOTION', 'WORK_CAREER', 'SOCIAL_LIFE', 'ROUTINE', 'IDENTITY',
    'PREFERENCES', 'GOALS', 'LIFE_STORY', 'UPCOMING', 'HEALTH',
    'HOBBIES', 'PEOPLE', 'LIVING_SITUATION', 'FINANCE',
    'TURNING_POINT', 'VALUE', 'OTHER',
  ],
  chkConstraints: [
    'chk_books_source_type',
    'chk_emotion_turns_arousal',
    'chk_emotion_turns_concern',
    'chk_emotion_turns_valence',
    'chk_memory_edges_weight',
    'chk_memory_nodes_emotional_weight',
    'chk_memory_nodes_narrative_relevance',
    'chk_session_feedback_rating',
    'chk_user_collections_name_gen',
  ],
  partialIndexes: [
    'idx_alerts_unresolved',
    'idx_fragments_status_active',
    'idx_fragments_story_ordered',
    'idx_fragments_truncated_only',
    'idx_memory_nodes_fragment_linked',
    'idx_memory_nodes_narrative_high',
    'idx_sms_inbound_unprocessed',
  ],
  userSettingsColumns: [
    { column_name: 'user_id', data_type: 'integer', is_nullable: 'NO' },
    { column_name: 'gemini_api_key', data_type: 'text', is_nullable: 'YES' },
    { column_name: 'updated_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
  ],
};

const results = {};
let passed = 0;
let failed = 0;

const pass = (key, msg, data) => {
  results[key] = { status: 'PASS', ...data };
  passed++;
  console.log(`✅ ${key.toUpperCase()} PASS — ${msg}`);
};

const fail = (key, msg, data) => {
  results[key] = { status: 'FAIL', reason: msg, ...data };
  failed++;
  console.log(`❌ ${key.toUpperCase()} FAIL — ${msg}`);
};

const arrEq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const setDiff = (a, b) => a.filter(x => !b.includes(x));

async function v1() {
  const rows = await sql`
    SELECT migration_name, finished_at, applied_steps_count
    FROM _prisma_migrations
    ORDER BY started_at
  `;
  const names = rows.map(r => r.migration_name);
  const allFinished = rows.every(r => r.finished_at !== null);
  const orderOk = arrEq(names, EXPECTED.migrations);
  if (orderOk && allFinished) {
    pass('v1', `4 migrations, all finished, correct order`, { migrations: rows });
  } else {
    fail('v1', `expected ${EXPECTED.migrations.join(', ')}; got ${names.join(', ')}; allFinished=${allFinished}`, { migrations: rows });
  }
}

async function v2() {
  const rows = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE'
    ORDER BY table_name
  `;
  const actual = rows.map(r => r.table_name);
  const expected = [...EXPECTED.tables].sort();
  const actualSorted = [...actual].sort();
  const missing = setDiff(expected, actualSorted);
  const extra = setDiff(actualSorted, expected);
  if (actual.length === 28 && missing.length === 0 && extra.length === 0) {
    // Note: task says n=27, but expected list has 28 entries (includes _prisma_migrations).
    // Respecting the expected list as source of truth.
    pass('v2', `28 tables match expected list`, { count: actual.length, tables: actual });
  } else if (missing.length === 0 && extra.length === 0) {
    pass('v2', `${actual.length} tables match expected list`, { count: actual.length, tables: actual });
  } else {
    fail('v2', `count=${actual.length}; missing=[${missing.join(',')}]; extra=[${extra.join(',')}]`, { count: actual.length, tables: actual, missing, extra });
  }
}

async function v3() {
  const rows = await sql`SELECT typname FROM pg_type WHERE typtype='e' ORDER BY typname`;
  const actual = rows.map(r => r.typname);
  const missing = setDiff(EXPECTED.enums, actual);
  const extra = setDiff(actual, EXPECTED.enums);
  if (missing.length === 0 && extra.length === 0) {
    pass('v3', `15 enums match`, { enums: actual });
  } else {
    fail('v3', `missing=[${missing.join(',')}]; extra=[${extra.join(',')}]`, { enums: actual, missing, extra });
  }
}

async function v4() {
  const rows = await sql`
    SELECT enumlabel FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'MemoryCategory'
    ORDER BY e.enumsortorder
  `;
  const actual = rows.map(r => r.enumlabel);
  if (arrEq(actual, EXPECTED.memoryCategoryValues)) {
    pass('v4', `MemoryCategory 17 values in correct order`, { values: actual });
  } else {
    fail('v4', `expected order differs; actual=${actual.join(',')}`, { values: actual, expected: EXPECTED.memoryCategoryValues });
  }
}

async function v5() {
  const rows = await sql`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname='public' AND tablename='memory_embeddings'
    ORDER BY indexname
  `;
  const ivf = rows.find(r => r.indexname === 'idx_embeddings_vector');
  if (ivf && /ivfflat/i.test(ivf.indexdef) && /vector_cosine_ops/.test(ivf.indexdef)) {
    pass('v5', `idx_embeddings_vector present with ivfflat + vector_cosine_ops`, { index: ivf, allIndexes: rows });
  } else {
    fail('v5', `IVFFlat index missing or incorrect`, { allIndexes: rows });
  }
}

async function v6() {
  const rows = await sql`
    SELECT conname, conrelid::regclass::text AS table_name
    FROM pg_constraint
    WHERE contype='c' AND conname LIKE 'chk_%'
    ORDER BY conname
  `;
  const actual = rows.map(r => r.conname);
  const missing = setDiff(EXPECTED.chkConstraints, actual);
  const extra = setDiff(actual, EXPECTED.chkConstraints);
  if (missing.length === 0 && extra.length === 0) {
    pass('v6', `9 chk_* constraints match`, { constraints: rows });
  } else {
    fail('v6', `missing=[${missing.join(',')}]; extra=[${extra.join(',')}]`, { constraints: rows, missing, extra });
  }
}

async function v7() {
  const rows = await sql`
    SELECT indexname, tablename FROM pg_indexes
    WHERE schemaname='public' AND indexdef LIKE '%WHERE%' AND indexname NOT LIKE '%pkey%'
    ORDER BY indexname
  `;
  const actual = rows.map(r => r.indexname);
  const missing = setDiff(EXPECTED.partialIndexes, actual);
  const extra = setDiff(actual, EXPECTED.partialIndexes);
  if (missing.length === 0 && extra.length === 0) {
    pass('v7', `7 partial indexes match`, { indexes: rows });
  } else {
    fail('v7', `missing=[${missing.join(',')}]; extra=[${extra.join(',')}]`, { indexes: rows, missing, extra });
  }
}

async function v8() {
  const rows = await sql`SELECT extname, extversion FROM pg_extension ORDER BY extname`;
  const names = rows.map(r => r.extname);
  const hasVector = names.includes('vector');
  const hasUuid = names.includes('uuid-ossp');
  if (hasVector && hasUuid) {
    pass('v8', `vector + uuid-ossp present`, { extensions: rows });
  } else {
    fail('v8', `vector=${hasVector}, uuid-ossp=${hasUuid}`, { extensions: rows });
  }
}

async function v9() {
  const rows = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name='user_settings' AND table_schema='public'
    ORDER BY ordinal_position
  `;
  const ok = rows.length === 3 &&
    EXPECTED.userSettingsColumns.every(exp => {
      const c = rows.find(r => r.column_name === exp.column_name);
      return c && c.data_type === exp.data_type && c.is_nullable === exp.is_nullable;
    });
  if (ok) {
    pass('v9', `user_settings has 3 expected columns`, { columns: rows });
  } else {
    fail('v9', `column mismatch`, { columns: rows, expected: EXPECTED.userSettingsColumns });
  }
}

(async () => {
  try {
    console.log('=== DB v2 Verification (READ-ONLY) ===\n');
    await v1();
    await v2();
    await v3();
    await v4();
    await v5();
    await v6();
    await v7();
    await v8();
    await v9();
    console.log(`\n=== Summary: Passed: ${passed}/9, Failed: ${failed}/9 ===\n`);
    console.log('===RAW_JSON_BEGIN===');
    console.log(JSON.stringify({ passed, failed, results }, null, 2));
    console.log('===RAW_JSON_END===');
    process.exit(failed === 0 ? 0 : 1);
  } catch (err) {
    console.error('❌ Script error:', err.message);
    console.error(err.stack);
    process.exit(2);
  }
})();
