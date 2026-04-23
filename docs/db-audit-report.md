# DB Audit Report — Pre-Migration 009

**Generated**: 2026-04-23T00:23:53.748Z
**DB**: ep-wandering-breeze-amyymt70.c-5.us-east-1.aws.neon.tech
**Queries executed**: 13
**Modifications made**: 0 (READ-ONLY)

**No tables were created, dropped, or altered during this audit.** (Sanity table count 22 matches Query 1 result of 22.)

---

## 1. Public Tables (Query 1)

22 base tables in `public` schema:

| # | Table |
|---|---|
| 1 | `UsageLog` |
| 2 | `User` |
| 3 | `UserLimit` |
| 4 | `UserMemory` |
| 5 | `_prisma_migrations` |
| 6 | `books` |
| 7 | `chat_sessions` |
| 8 | `emotion_alerts` |
| 9 | `emotion_sessions` |
| 10 | `emotion_turns` |
| 11 | `fragment_generation_queue` |
| 12 | `memory_archive` |
| 13 | `memory_edges` |
| 14 | `memory_embeddings` |
| 15 | `memory_nodes` |
| 16 | `outreach_log` |
| 17 | `push_subscriptions` |
| 18 | `session_feedback` |
| 19 | `sms_inbound` |
| 20 | `stories` |
| 21 | `story_fragments` |
| 22 | `user_voice_profiles` |

🚨 **Critical finding**: **No table named `fragments` exists.** The closest match is `story_fragments`. Migration 009's `ALTER TABLE fragments ADD COLUMN ...` statements will fail with `relation "fragments" does not exist`.

---

## 2. `fragments` Table Schema (Query 2)

**Table does not exist.** Query returned 0 rows.

**Total columns**: 0

→ Migration 009 must either (a) be retargeted at `story_fragments`, or (b) first rename/create `fragments`.

---

## 3. `books` Table Schema (Query 3)

**Total columns**: 20

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | `uuid` | NO | `uuid_generate_v4()` |
| `user_id` | `integer` | NO | — |
| `title` | `varchar(300)` | NO | — |
| `author_name` | `varchar(100)` | YES | — |
| `dedication` | `text` | YES | — |
| `preface` | `text` | YES | — |
| `epilogue` | `text` | YES | — |
| `format` | `varchar(20)` | YES | `'web'` |
| `output_url` | `text` | YES | — |
| `status` | `varchar(20)` | YES | `'draft'` |
| `story_count` | `integer` | YES | `0` |
| `total_word_count` | `integer` | YES | `0` |
| `cover_image_url` | `text` | YES | — |
| `design_template` | `varchar(50)` | YES | `'classic'` |
| `created_at` | `timestamptz` | YES | `now()` |
| `updated_at` | `timestamptz` | YES | `now()` |
| `output_data` | `text` | YES | — |
| `fragment_ids` | `jsonb` | YES | `'[]'::jsonb` |
| `auto_preface` | `boolean` | YES | `true` |
| `auto_epilogue` | `boolean` | YES | `true` |

Note: uses `uuid_generate_v4()` (from `uuid-ossp`), not `gen_random_uuid()`.

---

## 4. B-Pipeline Prerequisite Tables

| Table | Exists? | Notes |
|---|---|---|
| `user_voice_profiles` | **YES** | Already created with 13 columns. Migration's `CREATE TABLE user_voice_profiles` will fail unless guarded with `IF NOT EXISTS`, **and** the existing schema must be reconciled with the planned schema. |
| `experiment_runs` | **NO** | Safe to create. |
| `fragment_generation_queue` | **YES** | Already exists with 13 columns. |

### Existing `user_voice_profiles` schema

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | `uuid` | NO | `uuid_generate_v4()` |
| `user_id` | `integer` | NO | — |
| `avg_sentence_length` | `numeric` | YES | — |
| `frequent_expressions` | `ARRAY` (text[]) | YES | `'{}'::text[]` |
| `emotion_style` | `varchar` | YES | `'direct'` |
| `humor_frequency` | `varchar` | YES | `'medium'` |
| `language_mix` | `jsonb` | YES | `'{}'::jsonb` |
| `preferred_voice` | `varchar` | YES | `'conversational'` |
| `sessions_analyzed` | `integer` | YES | `0` |
| `last_analyzed_at` | `timestamptz` | YES | — |
| `voice_prompt_summary` | `text` | YES | — |
| `created_at` | `timestamptz` | YES | `now()` |
| `updated_at` | `timestamptz` | YES | `now()` |

### Existing `fragment_generation_queue` schema

| Column | Type | Nullable |
|---|---|---|
| `id` | `uuid` | NO |
| `user_id` | `integer` | NO |
| `job_type` | `varchar` | NO |
| `input_data` | `jsonb` | NO |
| `status` | `varchar` | YES |
| `priority` | `integer` | YES |
| `output_data` | `jsonb` | YES |
| `error_message` | `text` | YES |
| `started_at` | `timestamptz` | YES |
| `completed_at` | `timestamptz` | YES |
| `processing_time_ms` | `integer` | YES |
| `model_used` | `varchar` | YES |
| `created_at` | `timestamptz` | YES |

---

## 5. 🚨 Column Name Conflict Check

### `fragments` (Query 7)

Query returned 0 rows because the `fragments` table **does not exist**. No direct column conflicts detected — but this is *not* a green light; the migration must first resolve the table name mismatch before it can run at all.

| Column Name | Exists? | Current Type | Conflict? |
|---|---|---|---|
| `pipeline_version` | N/A | N/A | Table missing — blocker |
| `raw_extract` | N/A | N/A | Table missing — blocker |
| `structured_draft` | N/A | N/A | Table missing — blocker |
| `source_utterances` | N/A | N/A | Table missing — blocker |
| `verification_score` | N/A | N/A | Table missing — blocker |
| `interpretive_leaps` | N/A | N/A | Table missing — blocker |
| `attribution_blocks` | N/A | N/A | Table missing — blocker |
| `signature_phrases_used` | N/A | N/A | Table missing — blocker |
| `verification_verdict` | N/A | N/A | Table missing — blocker |
| `generation_cost_usd` | N/A | N/A | Table missing — blocker |
| `generation_duration_ms` | N/A | N/A | Table missing — blocker |
| `generation_retries` | N/A | N/A | Table missing — blocker |

→ Tim should re-check `story_fragments` schema before migrating. Recommended: run an auxiliary query against `story_fragments` to verify none of the 12 planned column names already exist there.

### `books` (Query 8)

| Column Name | Exists on `books`? | Current Type | Conflict? |
|---|---|---|---|
| `pipeline_version` | NO | — | ✅ Safe to add |
| `experiment_label` | NO | — | ✅ Safe to add |

---

## 6. Existing Constraints (Query 9)

No constraints named `chk_pipeline_version*`, `chk_verification_verdict*`, `chk_books_pipeline_version*`, or `chk_queue_pipeline_version*` — no conflicts.

**`books` constraints:**
- `books_pkey` (PRIMARY KEY on `id`)
- `books_user_id_fkey` (FOREIGN KEY)
- `books_format_check`: `format IN ('web','pdf','print')`
- `books_status_check`: `status IN ('draft','pending','generating','review','completed','published')`
- 3 system NOT NULL checks (`id`, `user_id`, `title`)

**`fragments` constraints:** none (table missing).

---

## 7. Existing Indexes (Query 10)

No indexes named `idx_fragments_pipeline`, `idx_fragments_user_pipeline`, or `idx_fragments_session_pipeline` — no conflicts.

**`books` indexes:**
- `books_pkey` (UNIQUE btree on `id`)
- `idx_books_user` (btree on `user_id`)

**`fragments` indexes:** none (table missing).

---

## 8. Data Volume (Query 11)

| Table | Row Count | Size |
|---|---|---|
| `fragments` | — | (table missing, not queried) |
| `books` | 0 | 24 kB |

Backup scope is trivial — `books` is empty. Row count for `story_fragments` was not part of the diagnostic set; recommend a follow-up query before migration.

---

## 9. Dependencies (Queries 12–13)

- **`users.id`**: does not exist in lowercase form. The users table is Prisma-style `"User"` with `id integer` and `name text`. Foreign keys in new tables must reference `"User"(id)` with the quoted capital name.
- **`gen_random_uuid()`**: ✅ available.
- `uuid_generate_v4()` is also in use (existing `books.id`, `user_voice_profiles.id`), implying `uuid-ossp` is installed. Either function works; pick one for consistency.

---

## 10. 🎯 Migration Readiness Summary

**Readiness**: 🔴 **Red**

### Green criteria check

- [ ] No column name conflicts in Query 7 → N/A, target table missing (blocker)
- [x] No column name conflicts in Query 8 → clean on `books`
- [x] No constraint name conflicts in Query 9
- [x] No index name conflicts in Query 10
- [ ] `users.id` exists → exists only as `"User"(id)` (quoted, integer); migration must use the quoted capitalized name
- [x] `gen_random_uuid()` available

### Blockers

1. **`fragments` table does not exist.** All 12 `ALTER TABLE fragments ADD COLUMN …` statements will fail. Actual table is `story_fragments`.
2. **`user_voice_profiles` already exists with a different schema** than Migration 009 is likely planning. Raw `CREATE TABLE user_voice_profiles` will error; even `CREATE TABLE IF NOT EXISTS` will silently skip and leave the existing schema — which may not match what the B-pipeline code expects.
3. **`fragment_generation_queue` already exists.** If Migration 009 plans to create or alter this table, the existing schema must be reconciled.

### Recommended Actions for Tim

1. **Resolve the `fragments` vs `story_fragments` question first.** Options:
   - (a) Retarget Migration 009 at `story_fragments` (simplest — most likely correct).
   - (b) Rename `story_fragments` → `fragments` as a prerequisite step (breaks existing code that references `story_fragments`).
   - Before proceeding, run an auxiliary audit query on `story_fragments` to confirm none of the 12 planned B-pipeline columns already exist there, and get its row count for backup sizing.
2. **Reconcile `user_voice_profiles`.** Compare the existing 13-column schema against the B-pipeline design in `03-db-migration-sql.md`. If they match, drop the `CREATE TABLE` from Migration 009. If not, add `ALTER TABLE user_voice_profiles ADD COLUMN …` for each missing column.
3. **Reconcile `fragment_generation_queue`.** Same treatment — compare existing vs planned; convert `CREATE` to conditional `ALTER` if needed.
4. **Use `"User"(id)` with double quotes** in any new foreign keys (not `users(id)`).
5. **Pick one UUID function.** Either `gen_random_uuid()` (pgcrypto) or `uuid_generate_v4()` (uuid-ossp). Existing tables use the latter — stick with it for consistency unless you have a reason to switch.
6. `experiment_runs` is the only fully-new table — safe to create as designed.

---

## Appendix: Raw Query Results

Full JSON results captured in `scripts/audit-db-results.json` (not committed; delete along with `scripts/audit-db.mjs` after review).
