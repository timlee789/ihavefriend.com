# CLAUDE.md — Story Fragment Engine Integration

## What This Is
ihavefriend.com is pivoting from a simple AI companion chat to a **story-preserving service**.
Emma (AI friend) still chats naturally, but now **detects meaningful moments** in conversation
and transforms them into **Story Fragments** — short, complete personal stories (300-800 chars).

## Current State (Already Done)
- ✅ Next.js app deployed on Vercel
- ✅ User auth working (Prisma: "User" table, id INTEGER PK)
- ✅ Emma CSS 2D avatar (eye blink + lip sync)
- ✅ Gemini Live API WebSocket real-time voice conversation
- ✅ Memory Engine: 14-category system (memory_nodes, memory_edges, memory_embeddings)
- ✅ Emotion tracking (emotion_turns, emotion_sessions, emotion_alerts)
- ✅ Chat sessions (chat_sessions table)
- ✅ Memory extraction (memoryExtractor.js) + recall (recallEngine.js)

## What Needs to Be Done

### Phase 1: DB Migration
Run SQL files in Neon SQL Editor in this order:
1. `db/004_add_fragment_fields.sql` — Add columns to memory_nodes + chat_sessions
2. `db/005_story_fragments.sql` — Create story_fragments table
3. `db/006_stories_books.sql` — Create stories + books tables + FK constraints
4. `db/007_support_tables.sql` — Create fragment_generation_queue + user_voice_profiles

### Phase 2: Prompt Integration
Files in `prompts/` directory:

- `emma-base.txt` — Updated base prompt (adds "YOUR DEEPER PURPOSE" section)
- `emma-story-detection.txt` — Story detection + deepening + timing control rules
- `emma-gap-questions.txt` — Gap analysis questions for uncovered life areas
- `emma-analysis-request.txt` — Updated analysis JSON format (emotion + fragment)
- `fragment-generation.txt` — Local LLM prompt for generating Fragments from conversations

**Integration steps:**
1. In `recallEngine.js`, update `EMMA_BASE_PROMPT` with content from `emma-base.txt`
2. In `buildEmmaPrompt()`, call `buildStoryContext()` from `storyPromptBuilder.js`
3. Append story detection prompt + story progress + gap suggestion + analysis request
4. Update `parseEmotionFromResponse()` → use `parseEmmaAnalysis()` instead
   (now parses both emotion AND fragment data from `<emma_analysis>` block)

### Phase 3: Code Integration
Files in `lib/` directory:

- `storyPromptBuilder.js` — Builds story context, parses emma_analysis, queues jobs
- `fragmentManager.js` — CRUD for fragments, clustering, story creation

**Integration steps:**
1. Copy `lib/storyPromptBuilder.js` and `lib/fragmentManager.js` to project `lib/`
2. Copy `prompts/` directory to project root or `lib/prompts/`
3. In the chat handler (where Gemini response is processed):
   ```javascript
   // AFTER getting Gemini response, REPLACE old emotion parsing:
   const { parseEmmaAnalysis, saveFragmentDetection, queueFragmentGeneration }
     = require('@/lib/storyPromptBuilder');

   const { cleanResponse, emotion, fragment } = parseEmmaAnalysis(rawGeminiResponse);

   // Save emotion (existing flow)
   await saveEmotionTurn(db, userId, sessionId, turnNumber, userMessage, emotion);

   // NEW: Save fragment detection data
   await saveFragmentDetection(db, sessionId, fragment);
   ```

4. In the session end handler:
   ```javascript
   // AFTER existing processSessionEnd():
   await queueFragmentGeneration(db, userId, sessionId);
   ```

5. In `buildEmmaPrompt()` function:
   ```javascript
   const { buildStoryContext } = require('@/lib/storyPromptBuilder');

   // Add after existing memory context assembly:
   const { storyPrompt } = await buildStoryContext(db, userId);

   const fullPrompt = [
     EMMA_BASE_PROMPT,        // Updated with DEEPER PURPOSE
     '',
     toneGuidance,            // Existing
     '',
     promptText,              // Existing memory context
     '',
     storyPrompt,             // NEW: story detection + progress + gaps + analysis
   ].join('\n');
   ```

### Phase 4: API Routes (for frontend)
Create these API routes for the "My Stories" UI:

```
GET    /api/fragments          — List user's fragments
POST   /api/fragments          — Create fragment (from local LLM output)
PATCH  /api/fragments/:id      — Update fragment (user edit)
DELETE /api/fragments/:id      — Soft-delete fragment
GET    /api/fragments/clusters — Get story grouping suggestions
POST   /api/stories            — Create story from fragment cluster
```

### Phase 5: Frontend UI
Create "My Stories" page:
- Fragment cards (title, subtitle, date, status badge)
- Click to read/edit
- Confirm/archive/delete actions
- Story grouping suggestions ("8 fragments about The Collegiate Grill — make a story?")
- Story view (fragments + transitions)

## Database Quick Reference

### Existing tables (DO NOT MODIFY structure):
- "User" (id INTEGER PK)
- memory_nodes, memory_edges, memory_embeddings
- emotion_turns, emotion_sessions, emotion_alerts
- chat_sessions, memory_archive

### Modified tables:
- memory_nodes: +story_fragment_id UUID, +narrative_relevance INT(0-5)
- chat_sessions: +fragment_candidate BOOLEAN, +fragment_elements JSONB

### New tables:
- story_fragments — Core: individual story pieces (300-800 chars)
- stories — Grouped fragments with transitions
- books — Final output (web/pdf/print)
- fragment_generation_queue — RTX 5090 batch job queue
- user_voice_profiles — User speech/writing pattern analysis

## Tech Stack
- Next.js (App Router) on Vercel
- Neon PostgreSQL (with pgvector)
- Gemini 2.5 Flash (real-time conversation)
- Local LLM on RTX 5090 (batch fragment generation)
- Prisma ORM (existing tables) + raw SQL (new tables)

## Key Design Decision
The `<emma_analysis>` JSON block replaces the old `<emotion_analysis>` block.
It includes BOTH emotion data AND fragment detection data.
The old `parseEmotionFromResponse()` should be replaced with `parseEmmaAnalysis()`.
