# DB Audit Report v2 — story_fragments + Prisma

**Generated**: 2026-04-23T00:40:00Z
**Follow-up to**: docs/db-audit-report.md (2026-04-23)
**Modifications made**: 0 (READ-ONLY on DB; `schema.prisma` not touched)

---

## Part 1: PostgreSQL Findings

### 1.1. `story_fragments` Full Schema (Query A)

**Total columns**: 31

| # | Column | Type | Nullable | Default |
|---|---|---|---|---|
| 1 | `id` | `uuid` | NO | `uuid_generate_v4()` |
| 2 | `user_id` | `integer` | NO | — |
| 3 | `title` | `varchar(200)` | NO | — |
| 4 | `subtitle` | `varchar(300)` | YES | — |
| 5 | `content` | `text` | NO | — |
| 6 | `content_raw` | `text` | YES | — |
| 7 | `source_session_ids` | `uuid[]` | YES | `'{}'::uuid[]` |
| 8 | `source_memory_node_ids` | `uuid[]` | YES | `'{}'::uuid[]` |
| 9 | `source_conversation_date` | `date` | YES | — |
| 10 | `tags_era` | `text[]` | YES | `'{}'::text[]` |
| 11 | `tags_people` | `text[]` | YES | `'{}'::text[]` |
| 12 | `tags_place` | `text[]` | YES | `'{}'::text[]` |
| 13 | `tags_theme` | `text[]` | YES | `'{}'::text[]` |
| 14 | `tags_emotion` | `text[]` | YES | `'{}'::text[]` |
| 15 | `word_count` | `integer` | YES | `0` |
| 16 | `language` | `varchar(5)` | YES | `'ko'` |
| 17 | `voice_style` | `varchar(20)` | YES | `'conversational'` |
| 18 | `status` | `varchar(20)` | YES | `'draft'` |
| 19 | `visibility` | `varchar(20)` | YES | `'private'` |
| 20 | `media_attachments` | `jsonb` | YES | `'[]'::jsonb` |
| 21 | `story_id` | `uuid` | YES | — |
| 22 | `story_order` | `integer` | YES | — |
| 23 | `user_edited` | `boolean` | YES | `false` |
| 24 | `user_edited_at` | `timestamptz` | YES | — |
| 25 | `edit_count` | `integer` | YES | `0` |
| 26 | `generated_by` | `varchar(50)` | YES | — |
| 27 | `generation_prompt_hash` | `varchar(64)` | YES | — |
| 28 | `generation_version` | `integer` | YES | `1` |
| 29 | `created_at` | `timestamptz` | YES | `now()` |
| 30 | `updated_at` | `timestamptz` | YES | `now()` |
| 31 | `truncated` | `boolean` | YES | `false` |

### 1.2. 🚨 B-Pipeline Column Conflict Check (Query B)

**Conflicts found: 0 columns.**

| Planned Column | Already Exists? | Existing Type | Decision |
|---|---|---|---|
| `pipeline_version` | NO | — | ✅ add |
| `raw_extract` | NO | — | ✅ add |
| `structured_draft` | NO | — | ✅ add |
| `source_utterances` | NO | — | ✅ add (note similar `source_session_ids`/`source_memory_node_ids` already exist — different purpose) |
| `verification_score` | NO | — | ✅ add |
| `interpretive_leaps` | NO | — | ✅ add |
| `attribution_blocks` | NO | — | ✅ add |
| `signature_phrases_used` | NO | — | ✅ add |
| `verification_verdict` | NO | — | ✅ add |
| `generation_cost_usd` | NO | — | ✅ add |
| `generation_duration_ms` | NO | — | ✅ add |
| `generation_retries` | NO | — | ✅ add |

All 12 planned B-pipeline columns are safe to add to `story_fragments`.

### 1.3. Existing Constraints (Query C)

- `story_fragments_pkey` (PRIMARY KEY on `id`)
- `story_fragments_user_id_fkey` (FOREIGN KEY → presumably `"User"(id)`)
- `fk_fragments_story` (FOREIGN KEY → `stories.id`)
- `story_fragments_status_check`: `status IN ('draft','confirmed','archived','deleted')`
- `story_fragments_visibility_check`: `visibility IN ('private','shared','public')`
- `story_fragments_voice_style_check`: `voice_style IN ('conversational','narrative','letter')`
- System NOT NULL checks (`id`, `user_id`, `title`, `content`)

No existing CHECK constraints on `pipeline_version` or `verification_verdict` — new constraints can be added without conflict.

### 1.4. Existing Indexes (Query D)

| Index | Definition |
|---|---|
| `story_fragments_pkey` | UNIQUE btree on `(id)` |
| `idx_fragments_user` | btree on `(user_id)` |
| `idx_fragments_date` | btree on `(user_id, created_at DESC)` |
| `idx_fragments_status` | btree on `(user_id, status)` WHERE `status <> 'deleted'` |
| `idx_fragments_story` | btree on `(story_id, story_order)` WHERE `story_id IS NOT NULL` |
| `idx_fragments_tags_era` | GIN on `tags_era` |
| `idx_fragments_tags_people` | GIN on `tags_people` |
| `idx_fragments_tags_place` | GIN on `tags_place` |
| `idx_fragments_tags_theme` | GIN on `tags_theme` |
| `idx_fragments_truncated` | btree on `(user_id, truncated)` WHERE `truncated = true` |

No conflicts with planned index names (`idx_fragments_pipeline`, `idx_fragments_user_pipeline`, `idx_fragments_session_pipeline`).

### 1.5. Data Volume (Query E)

- Row count: **14**
- Table size: **248 kB**

>0 rows → create a Neon branch before running `prisma migrate dev`.

### 1.6. Foreign Key Dependencies (Query F)

No other tables reference `story_fragments`. Safe to alter without cascade concerns.

### 1.7. `stories` Table Schema (Query G)

**Total columns**: 16

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | `uuid` | NO | `uuid_generate_v4()` |
| `user_id` | `integer` | NO | — |
| `title` | `varchar` | NO | — |
| `description` | `text` | YES | — |
| `cover_image_url` | `text` | YES | — |
| `chapter_type` | `varchar` | YES | `'thematic'` |
| `narrative_transitions` | `jsonb` | YES | `'[]'::jsonb` |
| `tags_theme` | `text[]` | YES | `'{}'::text[]` |
| `tags_era` | `text[]` | YES | `'{}'::text[]` |
| `status` | `varchar` | YES | `'draft'` |
| `fragment_count` | `integer` | YES | `0` |
| `total_word_count` | `integer` | YES | `0` |
| `book_id` | `uuid` | YES | — |
| `book_order` | `integer` | YES | — |
| `created_at` | `timestamptz` | YES | `now()` |
| `updated_at` | `timestamptz` | YES | `now()` |

### 1.8. Table Row Counts (Query H)

| Table | Rows |
|---|---|
| `story_fragments` | 14 |
| `stories` | 0 |
| `books` | 0 |
| `chat_sessions` | 115 |
| `fragment_generation_queue` | 4 |
| `user_voice_profiles` | 0 |

### 1.9. Recent Prisma Migrations (Query I)

| Migration Name | Started | Finished | Steps |
|---|---|---|---|
| `20260403004132_init` | 2026-04-03 00:41:32 | 2026-04-03 00:41:32 | 1 |

Only one migration applied — the initial one. **All memory-engine, story, book, and voice-profile tables were created OUTSIDE Prisma Migrate** (via raw SQL per `CLAUDE.md`). This is the central drift fact.

---

## Part 2: Prisma Schema Findings

### 2.1. `schema.prisma` Structure

- **File location**: `prisma/schema.prisma`
- **Total models**: **4** (only User, UserLimit, UserMemory, UsageLog)
- **Generator**: `prisma-client-js`
- **Datasource**: `postgresql`, `url = env("DATABASE_URL")`

🚨 **Major drift**: `schema.prisma` is missing 17 of the 22 tables present in the DB. There are no Prisma models for `story_fragments`, `stories`, `books`, `user_voice_profiles`, `fragment_generation_queue`, `chat_sessions`, memory-engine tables, etc. These are all managed via raw SQL (see `lib/db.js` with `@neondatabase/serverless`).

### 2.2. Relevant Model Definitions

**Present in `schema.prisma`** (verbatim):

```prisma
model User {
  id            Int       @id @default(autoincrement())
  email         String    @unique
  passwordHash  String
  name          String    @default("")
  role          String    @default("user")
  lang          String    @default("en")
  phone         String?
  isActive      Boolean   @default(true)
  createdAt     DateTime  @default(now())

  limits        UserLimit?
  memories      UserMemory[]
  usageLogs     UsageLog[]
}

model UserLimit {
  userId          Int     @id
  dailyMinutes    Int     @default(30)
  monthlyMinutes  Int     @default(300)
  memoryKb        Int     @default(512)

  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model UserMemory {
  id             Int      @id @default(autoincrement())
  userId         Int
  characterId    String   @default("emma")
  factsJson      String   @default("[]")
  summary        String   @default("")
  transcriptJson String   @default("[]")
  updatedAt      DateTime @updatedAt

  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, characterId])
}

model UsageLog {
  id           Int      @id @default(autoincrement())
  userId       Int
  sessionDate  String
  minutesUsed  Float    @default(0)
  turnsCount   Int      @default(0)

  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, sessionDate])
}
```

**MISSING from `schema.prisma`** (DB has the table, no Prisma model):

- `StoryFragment` (table `story_fragments`)
- `Story` (table `stories`)
- `Book` (table `books`)
- `UserVoiceProfile` (table `user_voice_profiles`)
- `FragmentGenerationQueue` (table `fragment_generation_queue`)
- `ChatSession` (table `chat_sessions`)
- All memory-engine tables (`memory_nodes`, `memory_edges`, `memory_embeddings`, `memory_archive`, `emotion_turns`, `emotion_sessions`, `emotion_alerts`)
- `OutreachLog`, `PushSubscription`, `SessionFeedback`, `SmsInbound`

### 2.3. Naming Convention Analysis

Based on the 4 existing models:

- **Model name style**: **PascalCase** (`User`, `UserLimit`, `UserMemory`, `UsageLog`). Matches the DB table names exactly (no `@@map` used — DB tables ARE capitalized: `"User"`, `"UserLimit"`, etc.).
- **Field name style**: **camelCase** (`passwordHash`, `isActive`, `createdAt`, `userId`, `dailyMinutes`). No `@map` used for individual fields — Prisma is using the camelCase names as actual DB column names.
- **Use of `@map` / `@@map`**: **NOT used** in the existing 4 models. The DB-side columns literally are camelCase (e.g., `"User"."passwordHash"`).
- **ID type**: **`Int @id @default(autoincrement())`** for `User`. For the raw-SQL tables in DB, ids are `uuid DEFAULT uuid_generate_v4()` — a different convention.
- **Default values**: `@default(now())` for timestamps, `@default("")` / `@default(0)` for scalars, `@default(true)` for booleans. Arrays are not present in the existing models.
- **Enum usage**: **NO enums** currently declared.

⚠️ **Convention collision**: The 4 Prisma-managed tables use camelCase columns with no mapping; the 17 raw-SQL tables use snake_case columns (`user_id`, `created_at`). If the team introduces new Prisma models for `story_fragments` etc., they MUST use `@map`/`@@map` to preserve the existing snake_case DB identifiers. Example for the planned `StoryFragment`:

```prisma
model StoryFragment {
  id                       String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  userId                   Int      @map("user_id")
  title                    String   @db.VarChar(200)
  // ... etc.
  createdAt                DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  @@map("story_fragments")
}
```

### 2.4. Migration History Files

**Total Prisma migrations**: **1**

- `20260403004132_init` — only migration folder present; created the 4 Prisma-managed tables.
- `migration_lock.toml` — provider lock.

**Migrations touching story_fragments / user_voice_profiles / fragment_generation_queue**: **None.** These tables exist only in the live DB, not in Prisma's migration history.

### 2.5. Prisma Client Usage Pattern

**Client singleton location**: `lib/prisma.js`

```javascript
// lib/prisma.js — singleton Prisma client (Prisma v5)
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

Parallel raw-SQL singleton at `lib/db.js` uses `@neondatabase/serverless` for the 17 non-Prisma tables. Two access paths coexist:
- `import { prisma } from '@/lib/prisma'` — for User/UserLimit/UserMemory/UsageLog
- `import { createDb } from '@/lib/db'` — for everything else (raw SQL)

### 2.6. Prisma Versions (from package.json)

- `prisma`: `^5.22.0`
- `@prisma/client`: `^5.22.0`

---

## Part 3: 🎯 Recommendations for Migration 009 v2

### Blocker decision: Adopt Prisma, or stay raw-SQL?

Because `story_fragments` is **not** currently in `schema.prisma`, running `prisma migrate dev --name add_pipeline_b_experiment` **will not add B-pipeline columns to `story_fragments`** — it only manages models defined in `schema.prisma`. Before Migration 009 v2 can be a "Prisma Migrate" migration, **`story_fragments` (and any other table being altered) must first be introduced as a Prisma model that matches the existing DB schema**.

**Recommended path**:

1. **Introspect first**: run `npx prisma db pull` (READ-ONLY on DB; writes to `schema.prisma` — Tim to do this, not this audit) to auto-import the 17 missing tables as Prisma models with correct `@map`/`@@map` and snake_case mapping.
2. **Review the generated schema**: rename models to PascalCase (e.g., `story_fragments` → `StoryFragment` with `@@map("story_fragments")`), and field names to camelCase with `@map("...")`. Prisma will suggest this automatically during pull.
3. **Commit a baseline migration**: use `npx prisma migrate resolve --applied <name>` to mark the existing DB state as already-migrated (since the raw SQL is already in DB). This is the standard "baselining" procedure documented in Prisma docs.
4. **THEN** run `prisma migrate dev --name add_pipeline_b_experiment` to add the B-pipeline columns. Prisma will generate the migration SQL from the schema.prisma diff.

### schema.prisma changes needed (after db pull + baselining)

**StoryFragment model** — ADD fields (in camelCase with `@map`):

```prisma
pipelineVersion         String    @default("A")            @map("pipeline_version") @db.VarChar(10)
rawExtract              String?                            @map("raw_extract")      @db.Text
structuredDraft         Json?                              @map("structured_draft")
sourceUtterances        Json?                              @map("source_utterances")
verificationScore       Decimal?                           @map("verification_score") @db.Decimal(5,2)
interpretiveLeaps       Int?                               @map("interpretive_leaps")
attributionBlocks       Int?                               @map("attribution_blocks")
signaturePhrasesUsed    String[]  @default([])             @map("signature_phrases_used")
verificationVerdict     String?                            @map("verification_verdict") @db.VarChar(10)
generationCostUsd       Decimal?                           @map("generation_cost_usd")  @db.Decimal(10,6)
generationDurationMs    Int?                               @map("generation_duration_ms")
generationRetries       Int       @default(0)              @map("generation_retries")
```

Plus CHECK constraints (expressed via migration SQL since Prisma doesn't model CHECK directly):
- `pipeline_version IN ('A','B')`
- `verification_verdict IN ('PASS','REVISE','REJECT') OR verification_verdict IS NULL`

**Book model** — ADD fields:

```prisma
pipelineVersion    String?  @map("pipeline_version") @db.VarChar(10)
experimentLabel    String?  @map("experiment_label") @db.VarChar(100)
```

**UserVoiceProfile** — **NO CHANGE**. B-pipeline code should map its expected fields to existing columns:
- Code's `signature_phrases` → DB's `frequent_expressions` (text[])
- Code's `voice_profile_summary` → DB's `voice_prompt_summary` (text)

**New model: `ExperimentRun`** — fully new table. Example:

```prisma
model ExperimentRun {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId          Int      @map("user_id")
  label           String   @db.VarChar(100)
  pipelineVersion String   @map("pipeline_version") @db.VarChar(10)
  fragmentIds     String[] @default([])            @map("fragment_ids") @db.Uuid
  notes           String?                          @db.Text
  createdAt       DateTime @default(now())         @map("created_at")   @db.Timestamptz(6)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("experiment_runs")
  @@index([userId, createdAt(sort: Desc)])
}
```

**Prisma enums** — recommended for type safety:

```prisma
enum PipelineVersion { A B }
enum VerificationVerdict { PASS REVISE REJECT }
```

Note: with Prisma enums the `@db.VarChar` overrides above would become direct enum references; pick one approach. Using plain `String` + CHECK constraint is simpler given the rest of the schema doesn't use enums.

### Foreign keys

- `User.id` is `Int @id @default(autoincrement())` → all new foreign keys use `Int @map("user_id")` with `@relation(fields: [userId], references: [id], onDelete: Cascade)`. DB-side reference is `"User"(id)` (quoted capital).

### UUID function

Existing tables in DB use `uuid_generate_v4()` (from `uuid-ossp`). Use `@default(dbgenerated("uuid_generate_v4()")) @db.Uuid` for consistency. Both `gen_random_uuid()` and `uuid_generate_v4()` are available; match the existing convention to avoid mixed styles.

### Safety

- Row count in `story_fragments`: **14** (248 kB).
  - >0 → **create a Neon branch before running `prisma migrate dev`**, run the migration on the branch, verify, then merge.
- Row count in `fragment_generation_queue`: 4 rows exist; do not drop or truncate.
- Row counts in `chat_sessions`: 115 rows; untouched by this migration but worth noting.

### Node.js code adjustments needed

Per `04-nodejs-implementation.md`:
- In `lib/fragment/generateB.js`, replace references to `voice_profile.signature_phrases` with `voice_profile.frequent_expressions`, and `voice_profile.voice_profile_summary` with `voice_profile.voice_prompt_summary` (match the existing DB column names in `user_voice_profiles`).
- After running `prisma db pull` + `prisma generate`, update any raw-SQL code paths that would benefit from switching to Prisma Client typed queries — but that is a separate refactor and NOT required for Migration 009 v2.

---

## Appendix: Raw results

Captured temporarily in `scripts/audit-db-v2-results.json`; deleted along with `scripts/audit-db-v2.mjs` after the report was written.
