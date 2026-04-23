# DB Audit Report v3 — Full Schema Harvest for Redesign

**Generated**: 2026-04-23T01:00:00Z
**Purpose**: Enable `schema.prisma` v2 clean-slate design
**Modifications made**: 0 (READ-ONLY)

---

## Summary

- Tables audited in this report: **13** (12 application + 1 Prisma meta)
- Total rows across these 12 application tables: **809**
- Extensions installed: `plpgsql`, `uuid-ossp`, `vector` (pgvector)
- Incoming FK dependencies (within the 12): **6** (all within memory-engine and emotion clusters)
- `memory_embeddings.embedding` vector dimension: **768** (matches Gemini `text-embedding-004`)

---

## PostgreSQL Extensions (Q6)

| Extension | Version |
|---|---|
| `plpgsql` | (system) |
| `uuid-ossp` | installed → `uuid_generate_v4()` available |
| `vector` (pgvector) | installed → `vector(768)` in use |

Critical notes:
- **pgvector: PRESENT** — `memory_embeddings.embedding` is `vector(768)` with an IVFFlat cosine index (`lists=100`). Prisma v5 supports `vector` via `@db.Vector(768)` when the `postgresqlExtensions` preview feature is enabled in `schema.prisma`.
- **uuid-ossp: PRESENT** — most UUID columns use `uuid_generate_v4()` as the default; one outlier (`session_feedback.id`) uses `gen_random_uuid()` despite pgcrypto not being in the extension list, which means pgcrypto is implicitly available (built into Postgres 13+).
- **pgcrypto: not explicitly listed** but `gen_random_uuid()` works — it's compiled into modern Postgres. Safe to use either UUID source.

---

## Cross-Table Foreign Key Map (Q7)

Incoming FKs within the 12 audited application tables:

| Dependent Table | Column | → | Referenced Table | Column |
|---|---|---|---|---|
| `emotion_sessions` | `session_id` | → | `chat_sessions` | `id` |
| `emotion_turns` | `session_id` | → | `chat_sessions` | `id` |
| `session_feedback` | `session_id` | → | `chat_sessions` | `id` |
| `memory_edges` | `source_node` | → | `memory_nodes` | `id` |
| `memory_edges` | `target_node` | → | `memory_nodes` | `id` |
| `memory_embeddings` | `memory_id` | → | `memory_nodes` | `id` |

All 12 application tables also reference `"User"(id)` as an outgoing FK (memory_archive is the lone exception — no FKs at all).

**Dependency roots (no incoming FKs among the 12)**: `memory_archive`, `emotion_alerts`, `outreach_log`, `push_subscriptions`, `sms_inbound`.

**Dependency leaves (referenced by others)**: `chat_sessions` (3 dependents), `memory_nodes` (3 dependents).

**DROP order for a reset migration** (leaves-first): `memory_embeddings` → `memory_edges` → `emotion_turns` → `emotion_sessions` → `session_feedback` → `memory_nodes` → `chat_sessions` → (all roots in any order).

---

## Per-Table Deep Dive

### 1. `chat_sessions`

**Row count**: 115   **Size**: 328 kB

#### Schema (13 columns)

| # | Column | data_type | udt | Nullable | Default |
|---|---|---|---|---|---|
| 1 | `id` | uuid | uuid | NO | `uuid_generate_v4()` |
| 2 | `user_id` | integer | int4 | NO | — |
| 3 | `character_id` | varchar(20) | varchar | YES | `'emma'` |
| 4 | `started_at` | timestamptz | timestamptz | YES | `now()` |
| 5 | `ended_at` | timestamptz | timestamptz | YES | — |
| 6 | `total_turns` | integer | int4 | YES | `0` |
| 7 | `memories_extracted` | boolean | bool | YES | `false` |
| 8 | `extraction_count` | integer | int4 | YES | `0` |
| 9 | `created_at` | timestamptz | timestamptz | YES | `now()` |
| 10 | `transcript_data` | jsonb | jsonb | YES | `'[]'::jsonb` |
| 11 | `fragment_candidate` | boolean | bool | YES | `false` |
| 12 | `fragment_elements` | jsonb | jsonb | YES | `'{}'::jsonb` |
| 13 | `conversation_mode` | text | text | YES | `'auto'` |

#### Constraints

- PK: `chat_sessions_pkey` (`id`)
- FK: `chat_sessions_user_id_fkey` (`user_id` → `"User".id`, ON DELETE CASCADE)
- No check constraints beyond NOT NULL on `id`, `user_id`.

#### Indexes

- `chat_sessions_pkey` — UNIQUE btree (`id`)
- `idx_sessions_user` — btree (`user_id`)
- `idx_sessions_date` — btree (`user_id`, `started_at DESC`)

#### Sample row (redacted)

```json
{
  "id": "<uuid>",
  "user_id": 1,
  "character_id": "emma",
  "started_at": "<ts>",
  "ended_at": "<ts>",
  "total_turns": <int>,
  "memories_extracted": false,
  "extraction_count": 0,
  "created_at": "<ts>",
  "transcript_data": "<redacted jsonb array of turns>",
  "fragment_candidate": false,
  "fragment_elements": {},
  "conversation_mode": "auto"
}
```

#### Observations

- Stores **full conversation transcripts** as jsonb inside `transcript_data`. ~2.8 kB average per row (328 kB / 115 rows). This is the authoritative conversation log; `emotion_turns` is per-turn derived data.
- `conversation_mode = 'auto'` default suggests this column was added later; no check constraint restricts values.
- `fragment_candidate` + `fragment_elements` look like flags for "this session contains a story worth turning into a fragment". No FK to `story_fragments` — the link is one-way.
- Missing `updated_at` (only `created_at` and `started_at`/`ended_at`).

---

### 2. `memory_nodes`

**Row count**: 213   **Size**: 216 kB

#### Schema (20 columns)

| # | Column | data_type | udt | Nullable | Default |
|---|---|---|---|---|---|
| 1 | `id` | uuid | uuid | NO | `uuid_generate_v4()` |
| 2 | `user_id` | integer | int4 | NO | — |
| 3 | `node_type` | varchar(20) | varchar | NO | — |
| 4 | `label` | varchar(100) | varchar | NO | — |
| 5 | `data` | jsonb | jsonb | NO | `'{}'::jsonb` |
| 6 | `primary_category` | varchar(20) | varchar | NO | — |
| 7 | `secondary_categories` | text[] | _text | YES | `'{}'::text[]` |
| 8 | `emotional_weight` | integer | int4 | YES | `1` |
| 9 | `mention_count` | integer | int4 | YES | `1` |
| 10 | `confidence` | varchar(10) | varchar | YES | `'medium'` |
| 11 | `recall_priority` | varchar(12) | varchar | YES | `'contextual'` |
| 12 | `first_mentioned` | timestamptz | timestamptz | YES | `now()` |
| 13 | `last_mentioned` | timestamptz | timestamptz | YES | `now()` |
| 14 | `is_active` | boolean | bool | YES | `true` |
| 15 | `created_at` | timestamptz | timestamptz | YES | `now()` |
| 16 | `updated_at` | timestamptz | timestamptz | YES | `now()` |
| 17 | `story_fragment_id` | uuid | uuid | YES | — |
| 18 | `narrative_relevance` | integer | int4 | YES | `0` |
| 19 | `times_discussed` | integer | int4 | NO | `0` |
| 20 | `discussion_depth` | integer | int4 | NO | `0` |

#### Constraints

- PK: `memory_nodes_pkey` (`id`)
- FK: `memory_nodes_user_id_fkey` (`user_id` → `"User".id`, CASCADE)
- CHECK `memory_nodes_confidence_check`: `confidence IN ('high','medium','low')`
- CHECK `memory_nodes_emotional_weight_check`: `emotional_weight BETWEEN 1 AND 5`
- CHECK `memory_nodes_narrative_relevance_check`: `narrative_relevance BETWEEN 0 AND 5`
- CHECK `memory_nodes_recall_priority_check`: `recall_priority IN ('always','contextual','proactive','background')`
- Note: `story_fragment_id` is **uuid but NOT a foreign key** — loose reference only.

#### Indexes (8)

- `memory_nodes_pkey` — UNIQUE btree (`id`)
- `idx_memory_nodes_user` — btree (`user_id`)
- `idx_memory_nodes_active` — btree (`user_id`, `is_active`)
- `idx_memory_nodes_type` — btree (`user_id`, `node_type`)
- `idx_memory_nodes_priority` — btree (`user_id`, `recall_priority`)
- `idx_memory_nodes_weight` — btree (`user_id`, `emotional_weight DESC`)
- `idx_memory_nodes_narrative` — btree (`user_id`, `narrative_relevance DESC`) WHERE `narrative_relevance >= 3` (partial)
- `idx_memory_nodes_fragment` — btree (`story_fragment_id`) WHERE `story_fragment_id IS NOT NULL` (partial)

#### Observations

- The **single most important table** in the memory engine — 213 rows across real conversations. Represents the atomic unit of "what Emma remembers about a person".
- `primary_category` is the 14-category taxonomy from CLAUDE.md (people, health, emotion, …). No CHECK constraint on valid values — relies on app-layer validation.
- `story_fragment_id` is a loose (unconstrained) reference. For v2 this should become a proper FK with `ON DELETE SET NULL` so deleted fragments don't strand memory nodes.
- `times_discussed` and `discussion_depth` are NOT NULL with defaults, added later (based on constraint OID ordering).

---

### 3. `memory_edges`

**Row count**: 33   **Size**: 104 kB

#### Schema (10 columns)

| # | Column | udt | Nullable | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `uuid_generate_v4()` |
| 2 | `user_id` | int4 | NO | — |
| 3 | `source_node` | uuid | NO | — |
| 4 | `target_node` | uuid | NO | — |
| 5 | `relationship` | varchar(30) | NO | — |
| 6 | `weight` | numeric | YES | `0.50` |
| 7 | `co_occurrence` | int4 | YES | `1` |
| 8 | `bidirectional` | bool | YES | `false` |
| 9 | `created_at` | timestamptz | YES | `now()` |
| 10 | `last_reinforced` | timestamptz | YES | `now()` |

#### Constraints

- PK: `memory_edges_pkey`
- UNIQUE `memory_edges_source_node_target_node_relationship_key` (source, target, relationship)
- FK: `source_node` → `memory_nodes.id` CASCADE
- FK: `target_node` → `memory_nodes.id` CASCADE
- FK: `user_id` → `"User".id` CASCADE
- CHECK `memory_edges_weight_check`: `weight BETWEEN 0.00 AND 1.00`

#### Indexes

- PK + `idx_memory_edges_source`, `idx_memory_edges_target`, `idx_memory_edges_user`, `idx_memory_edges_weight` (`user_id`, `weight DESC`), UNIQUE composite (source, target, relationship).

#### Observations

- Implements the graph layer. `bidirectional: false` default means most edges are directional — when the app wants a symmetric relationship it sets the flag rather than creating two edges.
- `weight` is numeric with no scale specified → in Prisma use `Decimal` with explicit `@db.Decimal(4,2)` to match the `0.50` default.
- Very clean design — probably the single table that needs zero changes in v2.

---

### 4. `memory_embeddings`

**Row count**: 0   **Size**: 1240 kB (mostly the IVFFlat index overhead)

#### Schema (6 columns)

| # | Column | udt | Nullable | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `uuid_generate_v4()` |
| 2 | `user_id` | int4 | NO | — |
| 3 | `memory_id` | uuid | NO | — |
| 4 | `content_text` | text | NO | — |
| 5 | `embedding` | **vector(768)** | NO | — |
| 6 | `created_at` | timestamptz | YES | `now()` |

#### Constraints

- PK: `memory_embeddings_pkey`
- FK: `memory_id` → `memory_nodes.id` CASCADE
- FK: `user_id` → `"User".id` CASCADE

#### Indexes

- `idx_embeddings_vector` — **IVFFlat** on `embedding` with `vector_cosine_ops`, `lists=100`
- `idx_embeddings_memory` — btree (`memory_id`)
- `idx_embeddings_user` — btree (`user_id`)

#### Observations

- **Zero rows.** Table exists but hasn't been populated yet — embeddings are expected to be written alongside memory extraction. Currently unused by live code.
- **`vector(768)`** = Gemini `text-embedding-004` dimensionality. Prisma v5 requires:
  ```prisma
  generator client {
    provider        = "prisma-client-js"
    previewFeatures = ["postgresqlExtensions"]
  }
  datasource db {
    provider   = "postgresql"
    url        = env("DATABASE_URL")
    extensions = [vector, uuidOssp(map: "uuid-ossp")]
  }
  ```
  and the embedding column typed as `Unsupported("vector(768)")` (pgvector still has partial Prisma support — v5.22 requires Unsupported; Prisma 6 adds first-class `@db.Vector`).
- IVFFlat `lists=100` is tuned for ~10k–100k vectors. For a single user with hundreds of memories, HNSW would be a better fit in v2 if Prisma supports it, but IVFFlat is acceptable.

---

### 5. `memory_archive`

**Row count**: 0   **Size**: 16 kB

#### Schema (8 columns)

| # | Column | udt | Nullable | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `uuid_generate_v4()` |
| 2 | `original_id` | uuid | NO | — |
| 3 | `user_id` | int4 | NO | — |
| 4 | `node_type` | varchar(20) | YES | — |
| 5 | `label` | varchar(100) | YES | — |
| 6 | `data` | jsonb | YES | — |
| 7 | `reason` | varchar(50) | YES | `'updated'` |
| 8 | `archived_at` | timestamptz | YES | `now()` |

#### Constraints

- PK only. **No foreign keys at all** — intentional (archive is decoupled from live nodes).

#### Indexes

- PK only. **No secondary indexes.** For v2 consider adding `(user_id, archived_at DESC)` if history queries are planned.

#### Observations

- Zero rows — feature not yet exercised.
- `original_id` is uuid but doesn't reference `memory_nodes.id` (intentional, since the archive should survive node deletion).
- `reason` has no CHECK constraint; likely values in code: `'updated'`, `'merged'`, `'deleted'`, `'decayed'`. Consider adding a CHECK or enum in v2.

---

### 6. `emotion_turns`

**Row count**: 382   **Size**: 344 kB

#### Schema (12 columns)

| # | Column | udt | Nullable | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `uuid_generate_v4()` |
| 2 | `user_id` | int4 | NO | — |
| 3 | `session_id` | uuid | NO | — |
| 4 | `turn_number` | int4 | NO | — |
| 5 | `user_message_preview` | text | YES | — |
| 6 | `valence` | numeric | YES | — |
| 7 | `arousal` | numeric | YES | — |
| 8 | `emotions` | text[] | YES | `'{}'::text[]` |
| 9 | `dominant_emotion` | varchar(30) | YES | — |
| 10 | `trigger_topic` | varchar(100) | YES | — |
| 11 | `concern_level` | int4 | YES | `0` |
| 12 | `created_at` | timestamptz | YES | `now()` |

#### Constraints

- PK, FK `user_id` → `"User"`, FK `session_id` → `chat_sessions` CASCADE.
- CHECK `valence BETWEEN -1.000 AND 1.000`
- CHECK `arousal BETWEEN 0.000 AND 1.000`
- CHECK `concern_level BETWEEN 0 AND 2`

#### Indexes

- PK + `idx_emotion_turns_session` (session_id), `idx_emotion_turns_user` (user_id, created_at DESC).

#### Observations

- **Emotion tracking is per-turn** (not per-session) — 382 rows across 115 sessions ≈ 3.3 turns/session on average.
- `user_message_preview` stores text (no length limit) — potential PII concern. Consider redacting or truncating in v2 depending on retention policy.
- `valence`/`arousal` as `numeric` (unspecified precision) → for Prisma use `@db.Decimal(4,3)` to match the 3-decimal CHECK bounds.
- Missing FK `turn_number` uniqueness per session — two rows with the same (session_id, turn_number) are allowed. Might be intentional for re-analysis, but worth noting.

---

### 7. `emotion_sessions`

**Row count**: 54   **Size**: 112 kB

#### Schema (18 columns)

| # | Column | udt | Nullable | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `uuid_generate_v4()` |
| 2 | `user_id` | int4 | NO | — |
| 3 | `session_id` | uuid | NO | — |
| 4 | `session_date` | date | YES | `CURRENT_DATE` |
| 5 | `avg_valence` | numeric | YES | — |
| 6 | `min_valence` | numeric | YES | — |
| 7 | `max_valence` | numeric | YES | — |
| 8 | `avg_arousal` | numeric | YES | — |
| 9 | `emotion_counts` | jsonb | YES | `'{}'::jsonb` |
| 10 | `dominant_emotion` | varchar(30) | YES | — |
| 11 | `emotional_arc` | varchar(20) | YES | — |
| 12 | `key_triggers` | text[] | YES | `'{}'::text[]` |
| 13 | `positive_moments` | text[] | YES | `'{}'::text[]` |
| 14 | `concern_events` | text[] | YES | `'{}'::text[]` |
| 15 | `total_turns` | int4 | YES | `0` |
| 16 | `session_duration_min` | int4 | YES | — |
| 17 | `max_concern_level` | int4 | YES | `0` |
| 18 | `created_at` | timestamptz | YES | `now()` |

#### Constraints

- PK, FK `user_id`, FK `session_id` → `chat_sessions` CASCADE.
- CHECK `emotion_sessions_emotional_arc_check`: `emotional_arc IN ('improving','declining','stable','volatile')`
- **No UNIQUE on session_id** — in theory one `chat_session` could have multiple emotion_session rows. 54 rows vs 115 sessions → not every session has been analyzed.

#### Indexes

- PK + `idx_emotion_sessions_user` (user_id, session_date DESC), `idx_emotion_sessions_concern` (user_id, max_concern_level DESC).

#### Observations

- Summary/rollup of `emotion_turns` per session.
- Consider UNIQUE(session_id) in v2 to prevent accidental duplicate analyses.
- `session_duration_min` is nullable — if it mirrors `chat_sessions.ended_at - started_at`, it's denormalized state that could drift.

---

### 8. `emotion_alerts`

**Row count**: 4   **Size**: 64 kB

#### Schema (11 columns)

| # | Column | udt | Nullable | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `uuid_generate_v4()` |
| 2 | `user_id` | int4 | NO | — |
| 3 | `alert_type` | varchar(30) | NO | — |
| 4 | `severity` | varchar(10) | NO | — |
| 5 | `message` | text | NO | — |
| 6 | `data` | jsonb | YES | `'{}'::jsonb` |
| 7 | `family_notified` | bool | YES | `false` |
| 8 | `notified_at` | timestamptz | YES | — |
| 9 | `resolved` | bool | YES | `false` |
| 10 | `resolved_at` | timestamptz | YES | — |
| 11 | `created_at` | timestamptz | YES | `now()` |

#### Constraints

- PK, FK `user_id` CASCADE.
- CHECK `emotion_alerts_severity_check`: `severity IN ('monitor','warning','urgent')`
- No CHECK on `alert_type` — free-form.

#### Indexes

- PK + `idx_alerts_user` (user_id, created_at DESC), `idx_alerts_unresolved` (user_id, resolved) WHERE `resolved = false` (partial).

#### Observations

- Partial index on unresolved alerts is a nice touch — keeps the "active alerts" query fast regardless of history size.
- `family_notified` + `notified_at` imply integration with an outreach channel; currently only 4 alerts logged.

---

### 9. `outreach_log`

**Row count**: 0   **Size**: 32 kB

#### Schema (10 columns)

| # | Column | udt | Nullable | Default |
|---|---|---|---|---|
| 1 | `id` | **int4** | NO | `nextval('outreach_log_id_seq')` |
| 2 | `user_id` | int4 | NO | — |
| 3 | `message_type` | varchar(20) | NO | — |
| 4 | `message_text` | text | NO | — |
| 5 | `channel` | varchar(10) | YES | `'sms'` |
| 6 | `sent` | bool | YES | `false` |
| 7 | `user_replied` | bool | YES | `false` |
| 8 | `replied_at` | timestamptz | YES | — |
| 9 | `sent_date` | date | YES | `CURRENT_DATE` |
| 10 | `created_at` | timestamptz | YES | `now()` |

#### Constraints

- PK, FK `user_id` CASCADE.
- No CHECK on `channel` or `message_type` — free-form.

#### Indexes

- PK + `idx_outreach_user` (user_id, sent_date), `idx_outreach_date` (sent_date).

#### Observations

- **Serial integer ID**, not UUID — inconsistent with memory-engine tables. Decide in v2 whether to unify on UUID or keep serial for log-style tables.
- Zero rows — feature not exercised in production yet.

---

### 10. `push_subscriptions`

**Row count**: 0   **Size**: 32 kB

#### Schema (6 columns)

| # | Column | udt | Nullable | Default |
|---|---|---|---|---|
| 1 | `id` | int4 | NO | `nextval('push_subscriptions_id_seq')` |
| 2 | `user_id` | int4 | NO | — |
| 3 | `endpoint` | text | NO | — |
| 4 | `keys_p256dh` | text | NO | — |
| 5 | `keys_auth` | text | NO | — |
| 6 | `created_at` | timestamptz | YES | `now()` |

#### Constraints

- PK, UNIQUE (`user_id`), FK `user_id` CASCADE.

#### Indexes

- PK + `push_subscriptions_user_id_key` (unique on user_id), `idx_push_user` (redundant with the unique, same column).

#### Observations

- UNIQUE + explicit btree on the same column → redundant; drop `idx_push_user` in v2.
- Serial integer ID (again, inconsistent with UUID tables).
- One subscription per user enforced by UNIQUE.

---

### 11. `session_feedback`

**Row count**: 8   **Size**: 64 kB

#### Schema (6 columns)

| # | Column | udt | Nullable | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | **`gen_random_uuid()`** |
| 2 | `user_id` | int4 | NO | — |
| 3 | `session_id` | uuid | YES | — |
| 4 | `rating` | int2 (smallint) | NO | — |
| 5 | `comment` | text | YES | — |
| 6 | `created_at` | timestamptz | NO | `now()` |

#### Constraints

- PK, FK `user_id` CASCADE, FK `session_id` → `chat_sessions` **ON DELETE SET NULL** (unique — all other session_id FKs are CASCADE).
- CHECK `rating BETWEEN 1 AND 5`.

#### Indexes

- PK + `idx_feedback_user`, `idx_feedback_created`.

#### Observations

- **Only table using `gen_random_uuid()`** as the default — everything else uses `uuid_generate_v4()`. Pick one convention for v2.
- `rating` is `smallint` (int2) — all other integer columns are `int4`. Intentional space optimization but inconsistent.
- `ON DELETE SET NULL` for session_id preserves the feedback even if the underlying chat session is deleted — good design for analytics.

---

### 12. `sms_inbound`

**Row count**: 0   **Size**: 32 kB

#### Schema (7 columns)

| # | Column | udt | Nullable | Default |
|---|---|---|---|---|
| 1 | `id` | int4 | NO | `nextval('sms_inbound_id_seq')` |
| 2 | `from_phone` | varchar(20) | NO | — |
| 3 | `user_id` | int4 | YES | — |
| 4 | `body` | text | NO | — |
| 5 | `twilio_sid` | varchar(50) | YES | — |
| 6 | `processed` | bool | YES | `false` |
| 7 | `created_at` | timestamptz | YES | `now()` |

#### Constraints

- PK, FK `user_id` → `"User".id` **ON DELETE NO ACTION** (differs from all other user FKs which are CASCADE).

#### Indexes

- PK + `idx_sms_inbound_user` (user_id), `idx_sms_inbound_unprocessed` (processed) WHERE `processed = false`.

#### Observations

- Serial integer ID; inconsistent with UUID pattern.
- `user_id` is **nullable** — inbound SMS can arrive before user is matched (phone number lookup pending). Good design.
- `ON DELETE NO ACTION` for user_id is the odd-one-out; probably intentional to retain SMS audit trail even if a user is deleted. Reconsider whether SET NULL would be more coherent.
- `twilio_sid` should probably have UNIQUE to prevent duplicate webhook processing (currently not enforced).

---

### 13. `_prisma_migrations` (reference only)

**Row count**: 1   **Size**: 32 kB

#### Schema (8 columns)

Standard Prisma Migrate bookkeeping table. Columns: `id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`. Managed by Prisma itself — no user action needed.

Only migration applied: `20260403004132_init` (2026-04-03). Everything else in the DB was created via raw SQL outside Prisma Migrate.

---

## Design Insights for `schema.prisma` v2

After auditing all 22 tables (9 in reports v1/v2 + 13 here):

### Naming patterns

| Pattern | Used by |
|---|---|
| **UUID PKs** (`uuid_generate_v4()`) | All memory-engine, emotion, story, book, voice-profile, queue, chat_sessions, memory_archive, emotion_alerts |
| **Serial integer PKs** | `outreach_log`, `push_subscriptions`, `sms_inbound`, `"User"`, `"UserLimit"`, `"UserMemory"`, `"UsageLog"` |
| **`gen_random_uuid()`** (outlier) | Only `session_feedback` |
| **snake_case columns** | All 18 raw-SQL tables |
| **camelCase columns** | Only the 4 Prisma-managed tables (`"User"`, etc.) |
| **Quoted capital-name tables** | Only the 4 Prisma-managed tables |
| **timestamptz for time fields** | Universal — consistent `created_at` / `updated_at` / `started_at` / etc. |

**v2 recommendation**: Unify on UUID PKs everywhere **except** for pure audit log tables where serial integer makes sense (`sms_inbound`, `outreach_log`). Or go all-UUID for uniformity. Tim's call. Use `uuid_generate_v4()` uniformly (it's already the dominant default) unless you want to switch the existing tables to `gen_random_uuid()` at reset time.

### Type patterns

- `jsonb` for structured data (`transcript_data`, `fragment_elements`, `emotion_counts`, `data`, `media_attachments`, `narrative_transitions`). Consistent.
- `text[]` (Postgres arrays) for tag-like lists (`tags_*`, `emotions`, `key_triggers`, etc.). Prisma maps these as `String[]`.
- `uuid[]` for id-list columns (`source_session_ids`, `source_memory_node_ids` on `story_fragments`). Prisma mapping: `String[] @db.Uuid`.
- `varchar(N)` where N is small (10/20/30/50/100/200) for enum-like strings, `text` for free-form. Generally sensible.
- `numeric` without precision for scores (`valence`, `arousal`, `weight`, `avg_valence`, `verification_score`). **Recommend fixing precision in v2** (`@db.Decimal(4,3)` etc.) to avoid Prisma's default 65,30 precision.
- `vector(768)` for embeddings — needs `Unsupported()` in Prisma v5.22, or upgrade to Prisma 6 for first-class `@db.Vector(768)`.

### Default value patterns

- Booleans: `true`/`false` defaults consistent.
- Arrays: `'{}'::text[]` / `'[]'::jsonb`. Prisma: `@default([])`.
- Timestamps: `now()` for created_at, trigger or app-level for updated_at (no DB-level trigger found — relies on app code).
- Missing: no AUTO-update on `updated_at`. Several tables have `updated_at = now()` default but no trigger to refresh on UPDATE. Prisma's `@updatedAt` directive would solve this cleanly.

### Index strategies

| Strategy | Examples |
|---|---|
| GIN on text[] tag columns | `story_fragments` has 4 GIN indexes on `tags_*` |
| IVFFlat on vector | `memory_embeddings` (lists=100) |
| Partial indexes (WHERE clause) | `idx_fragments_status`, `idx_fragments_story`, `idx_fragments_truncated`, `idx_memory_nodes_narrative`, `idx_memory_nodes_fragment`, `idx_alerts_unresolved`, `idx_sms_inbound_unprocessed` — excellent pattern, reduces index size dramatically |
| Composite (user_id, time DESC) | Ubiquitous — every "recent history" query pattern |

**v2 recommendation**: Preserve the partial-index pattern — it's one of the more sophisticated parts of the existing design. Prisma supports partial indexes via `@@index([...], where: ...)` in the schema.

### Default-value precision loss

Existing raw SQL carefully sets `@db.Decimal(4,2)` semantically (via CHECK constraints) but the columns are plain `numeric`. When Prisma generates the schema, make sure to add explicit `@db.Decimal(precision, scale)` so the generated DDL matches.

### Potential simplifications (for v2)

1. **Consolidate UUID defaults**: drop `session_feedback`'s outlier `gen_random_uuid()`, use `uuid_generate_v4()` everywhere.
2. **Drop redundant index**: `push_subscriptions.idx_push_user` duplicates the UNIQUE btree. Remove.
3. **Unused (empty) tables** — still design in v2 but acknowledge they're aspirational:
   - `memory_embeddings` (0 rows, feature not yet live)
   - `memory_archive` (0 rows)
   - `outreach_log`, `push_subscriptions`, `sms_inbound` (0 rows — messaging features pending)
   - `user_voice_profiles` (0 rows — from v2 audit)
   - `books`, `stories` (0 rows — from v1/v2 audits)
4. **Add UNIQUE constraints that should exist**:
   - `emotion_sessions(session_id)` — currently no unique constraint; one analysis per session should be enforced.
   - `emotion_turns(session_id, turn_number)` — prevents duplicate turn analysis.
   - `sms_inbound(twilio_sid)` — prevents duplicate webhook processing (currently nullable + no unique).
5. **Tighten FKs**:
   - `memory_nodes.story_fragment_id` — currently untyped loose uuid. Make it a proper FK `ON DELETE SET NULL`.
   - `memory_archive.original_id` — intentionally loose; decide whether to formalize.
6. **Missing `updated_at` on `chat_sessions`** — either add it or delete the concept across tables for consistency.
7. **CHECK constraint candidates to add**:
   - `memory_nodes.primary_category` — restrict to the 14 categories from CLAUDE.md.
   - `memory_nodes.node_type` — currently free-form varchar(20).
   - `memory_archive.reason` — enum-like.
   - `emotion_alerts.alert_type` — enum-like.
   - `outreach_log.channel` and `.message_type`.
8. **Enum opportunities** (Prisma enums):
   - `Severity { MONITOR WARNING URGENT }` (emotion_alerts)
   - `Confidence { HIGH MEDIUM LOW }` (memory_nodes)
   - `RecallPriority { ALWAYS CONTEXTUAL PROACTIVE BACKGROUND }` (memory_nodes)
   - `EmotionalArc { IMPROVING DECLINING STABLE VOLATILE }` (emotion_sessions)
   - `FragmentStatus { DRAFT CONFIRMED ARCHIVED DELETED }` (story_fragments)
   - `Visibility { PRIVATE SHARED PUBLIC }` (story_fragments)
   - `VoiceStyle { CONVERSATIONAL NARRATIVE LETTER }` (story_fragments)
   - `BookStatus { DRAFT PENDING GENERATING REVIEW COMPLETED PUBLISHED }` (books)
   - `BookFormat { WEB PDF PRINT }` (books)

### What v2 should preserve (don't change)

- UUID primary keys for domain entities (conversations, memories, fragments).
- `text[]` arrays for tags (Postgres-native, GIN-indexable, simple).
- jsonb for conversation transcripts (fast to query with `jsonb_path_ops` if needed later).
- The partial-index pattern on boolean/status columns.
- CASCADE semantics from `"User"` — if a user is deleted, everything they own goes with them (good for GDPR / account deletion).

---

## Appendix: Raw query results

Captured temporarily in `scripts/audit-db-v3-results.json`; deleted along with `scripts/audit-db-v3.mjs` after the report was written.
