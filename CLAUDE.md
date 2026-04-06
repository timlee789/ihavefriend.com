# CLAUDE.md — ihavefriend.com Memory Engine Integration

## Project Overview
AI friend service at ihavefriend.com. Users talk to Emma (AI friend) who remembers everything about them.
Built with Next.js + Neon PostgreSQL + Gemini Live API (WebSocket).

## Current State (as of April 2026)

### What's DONE:
- ✅ Next.js app deployed on Vercel
- ✅ User auth (login/register) working
- ✅ Emma CSS 2D avatar (eye blink + lip sync) on Friends page + Chat page
- ✅ Gemini Live API WebSocket real-time voice conversation
- ✅ Microphone continuous detection + 1.5s silence → AI response
- ✅ Neon PostgreSQL database with User, UserMemory, UserLimit, UsageLog tables
- ✅ Memory Engine DB tables created (memory_nodes, memory_edges, memory_embeddings, emotion_turns, emotion_sessions, emotion_alerts, chat_sessions, memory_archive)
- ✅ Memory Engine lib files added to project:
  - lib/tokenBudget.js — 800-token budget system (4-phase priority)
  - lib/memoryExtractor.js — Gemini-based 14-category memory extraction
  - lib/recallEngine.js — Memory retrieval + prompt assembly
  - lib/emotionTracker.js — Real-time emotion detection + alerts
  - lib/memoryGraph.js — Graph traversal + memory decay

### What NEEDS TO BE DONE (in order):
1. Connect memory engine modules to Emma's chat handler
2. Remove other characters (Ken, Sofia, etc.) — Emma only
3. Test the full pipeline: conversation → extraction → recall

## Database Schema Reference

### Existing Prisma tables:
- "User" (id INTEGER PK, email, passwordHash, name, role)
- "UserMemory", "UserLimit", "UsageLog"

### New memory engine tables (already created in Neon):
- memory_nodes (user_id INTEGER references "User"(id))
- memory_edges (source_node, target_node, relationship, weight)
- memory_embeddings (embedding VECTOR(768) via pgvector)
- emotion_turns (per-message valence/arousal/concern_level)
- emotion_sessions (per-conversation summary)
- emotion_alerts (triggered notifications)
- chat_sessions (conversation tracking)
- memory_archive (history of updated memories)

## Architecture — How the Memory Engine Works

```
User sends message to Emma
       ↓
[1] recallEngine.buildEmmaPrompt(db, userId, message)
    → Queries memory_nodes, memory_embeddings, emotion_sessions
    → Token Budget System selects top memories within 800 tokens
    → Assembles system prompt with memory context
       ↓
[2] Send to Gemini with assembled system prompt
    → Gemini prompt includes: <emotion_analysis> JSON block request
       ↓
[3] Parse Gemini response
    → emotionTracker.parseEmotionFromResponse(rawResponse)
    → Strips emotion block, returns clean response + emotion data
    → emotionTracker.saveEmotionTurn(db, userId, sessionId, turn, message, emotion)
       ↓
[4] Send clean response to user (voice/text)
       ↓
[5] When conversation ends (user leaves or 30min timeout):
    → recallEngine.processSessionEnd(db, userId, sessionId, history, apiKey)
    → Extracts memories from full transcript
    → Saves to memory_nodes + memory_edges + memory_embeddings
    → Summarizes session emotions
    → Checks alert conditions
```

## Integration Task — Step by Step

### Step 1: Find Emma's chat handler
Look for the file that handles the WebSocket/Gemini conversation.
It's likely in: app/api/chat/route.js, pages/api/chat.js, or similar.
Find where the Gemini API is called with the user's message.

### Step 2: Add memory recall BEFORE Gemini call
```javascript
const { buildEmmaPrompt } = require('@/lib/recallEngine');

// Before sending to Gemini:
const { prompt, debugInfo } = await buildEmmaPrompt(db, userId, userMessage);
// Use 'prompt' as Gemini's system instruction
```

### Step 3: Add emotion parsing AFTER Gemini response
```javascript
const { parseEmotionFromResponse, saveEmotionTurn } = require('@/lib/emotionTracker');

// After getting Gemini's response:
const { cleanResponse, emotion } = parseEmotionFromResponse(rawGeminiResponse);
// Send cleanResponse to user (not rawGeminiResponse)
// Save emotion data:
await saveEmotionTurn(db, userId, sessionId, turnNumber, userMessage, emotion);
```

### Step 4: Add session end processing
```javascript
const { processSessionEnd } = require('@/lib/recallEngine');

// When conversation ends:
await processSessionEnd(db, userId, sessionId, conversationHistory, geminiApiKey);
```

### Step 5: Modify Gemini prompt to include emotion analysis request
Add this to the END of the system prompt (buildEmmaPrompt already does this, 
but the Gemini call also needs to include this in the user-facing prompt):

```
After your response, append a hidden analysis block:
<emotion_analysis>
{"detected_emotions": [], "valence": 0.0, "arousal": 0.5, "dominant": "", "trigger": "", "concern_level": 0, "topic_sensitivity": null}
</emotion_analysis>
```

### Step 6: Remove other characters
- Delete or hide Ken, Sofia, and other character components
- Remove character selection page (or redirect to Emma)
- Update routing: /chat should go directly to Emma

## Key Files to Modify
- Chat API route (where Gemini is called)
- Chat page component (where messages are displayed)
- Friends/character selection page (remove or simplify)
- Any character config files

## Environment Variables Needed
- GEMINI_API_KEY (already exists)
- DATABASE_URL (already exists, Neon connection string)

## Tech Stack
- Next.js (App Router)
- Neon PostgreSQL (with pgvector extension)
- Gemini 2.5 Flash (conversation) + text-embedding-004 (embeddings)
- Vercel (deployment)
- Prisma ORM (for existing User tables)
- Raw SQL queries (for new memory engine tables — do NOT use Prisma for these)

## Important Notes
- user_id is INTEGER (not UUID) — matches "User" table PK
- Table names with capital letters need double quotes: "User"
- Memory engine tables use raw SQL, not Prisma
- The db connection for memory queries should use Neon's @neondatabase/serverless driver
- Token budget is 800 tokens — do not increase without explicit approval
- 14 memory categories: people, health, emotion, work_career, finance, hobbies, goals, social_life, life_story, living_situation, identity, routine, preferences, upcoming
