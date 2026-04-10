/**
 * POST /api/news
 *
 * Uses Gemini 2.5 Flash with Google Search grounding to fetch
 * personalised news headlines for the user.
 *
 * Returns: { newsItems: [{ title, url }], lang }
 */
import { requireAuth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

function getDb() {
  return neon(process.env.DATABASE_URL);
}

export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return Response.json({ error: 'Not configured' }, { status: 500 });

  const sql = getDb();

  // ── User language + interests from memory ────────────────────────────────────
  const [userRow] = await sql`SELECT lang FROM "User" WHERE id = ${user.id} LIMIT 1`;
  const lang = (userRow?.lang || 'ko').toLowerCase();

  const interests = await sql`
    SELECT label FROM memory_nodes
    WHERE user_id = ${user.id}
      AND is_active = true
      AND node_type IN ('hobbies', 'work_career', 'preferences', 'identity', 'goals')
    LIMIT 8
  `;
  const interestText = interests.map(r => r.label).join(', ');

  // ── Prompt by language ───────────────────────────────────────────────────────
  const interestHint = {
    ko: interestText ? `이 사람의 관심사: ${interestText}.` : '',
    es: interestText ? `Intereses de esta persona: ${interestText}.` : '',
    en: interestText ? `This person's interests: ${interestText}.` : '',
  };

  const prompts = {
    ko: `${interestHint.ko} Google 검색을 사용해서 오늘의 주요 뉴스 기사 제목 5개를 찾아주세요. 다음 형식으로만 답하세요 (다른 설명 없이):\n1. [기사 제목]\n2. [기사 제목]\n3. [기사 제목]\n4. [기사 제목]\n5. [기사 제목]`,
    es: `${interestHint.es} Usa Google Search para encontrar 5 titulares de noticias de hoy. Responde SOLO con esta lista numerada (sin explicaciones):\n1. [titular]\n2. [titular]\n3. [titular]\n4. [titular]\n5. [titular]`,
    en: `${interestHint.en} Use Google Search to find 5 top news headlines from today. Reply with ONLY a numbered list (no explanations):\n1. [headline]\n2. [headline]\n3. [headline]\n4. [headline]\n5. [headline]`,
  };

  const prompt = prompts[lang] || prompts.en;

  // ── Call Gemini with Google Search grounding ─────────────────────────────────
  let res;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tools: [{ googleSearch: {} }],
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
        }),
      }
    );
  } catch (e) {
    console.error('[news] Gemini fetch error:', e.message);
    return Response.json({ newsItems: [], lang }, { status: 500 });
  }

  if (!res.ok) {
    const errText = await res.text();
    console.error('[news] Gemini error:', errText);
    return Response.json({ newsItems: [], lang });
  }

  const data = await res.json();

  const candidate = data.candidates?.[0];
  const text      = candidate?.content?.parts?.[0]?.text || '';
  const chunks    = candidate?.groundingMetadata?.groundingChunks || [];
  const supports  = candidate?.groundingMetadata?.groundingSupports || [];

  // ── Step 1: Extract titles from Gemini's text response ──────────────────────
  // Gemini writes a numbered list; these are the actual article headlines.
  const cleanLine = line =>
    line.replace(/^\d+[.)]\s*/, '').replace(/\*\*/g, '').replace(/^[-•]\s*/, '').trim();

  const textTitles = text
    .split('\n')
    .filter(l => /^\d+[.)]\s+/.test(l.trim()))
    .map(l => {
      const t = cleanLine(l);
      // Keep only the headline part (before " - " or " – " description)
      return t.replace(/\s+[-–]\s+.+$/, '').trim();
    })
    .filter(t => t.length > 10);

  // ── Step 2: Build a map from chunk index → URL (deduped) ────────────────────
  const seenUrl = new Set();
  const chunkUrls = [];   // ordered unique URIs from chunks
  for (const chunk of chunks) {
    const uri = chunk?.web?.uri;
    if (uri && !seenUrl.has(uri)) {
      seenUrl.add(uri);
      chunkUrls.push(uri);
    }
  }

  // ── Step 3: Map titles to URLs via groundingSupports (segment → chunkIndex) ──
  // Build: segment start offset → chunk indices
  const segmentChunkMap = new Map(); // title index (from textTitles) → best URL
  for (const support of supports) {
    const segText = support.segment?.text?.trim() || '';
    if (!segText || segText.length < 8) continue;
    const segClean = cleanLine(segText).replace(/\s+[-–]\s+.+$/, '').trim();
    // Find which textTitle this segment matches
    const titleIdx = textTitles.findIndex(t =>
      t.toLowerCase().startsWith(segClean.slice(0, 20).toLowerCase()) ||
      segClean.toLowerCase().startsWith(t.slice(0, 20).toLowerCase())
    );
    if (titleIdx === -1) continue;
    const chunkIdx = support.groundingChunkIndices?.[0];
    if (chunkIdx == null) continue;
    const uri = chunks[chunkIdx]?.web?.uri;
    if (uri && !segmentChunkMap.has(titleIdx)) {
      segmentChunkMap.set(titleIdx, uri);
    }
  }

  // ── Step 4: Assemble news items ──────────────────────────────────────────────
  const seenTitle = new Set();
  const newsItems = [];

  for (let i = 0; i < textTitles.length && newsItems.length < 6; i++) {
    const title = textTitles[i];
    const titleKey = title.slice(0, 60).toLowerCase();
    if (seenTitle.has(titleKey)) continue;
    seenTitle.add(titleKey);

    // Prefer exact support match; fall back to positional chunk URL
    const url = segmentChunkMap.get(i) || chunkUrls[i] || null;
    newsItems.push({ title, url });
  }

  // ── Fallback: if text had no numbered list, use chunk domains (last resort) ──
  if (newsItems.length === 0) {
    for (let i = 0; i < chunkUrls.length && newsItems.length < 5; i++) {
      try {
        const host = new URL(chunkUrls[i]).hostname.replace(/^www\./, '');
        newsItems.push({ title: host, url: chunkUrls[i] });
      } catch {}
    }
  }

  return Response.json({ newsItems, lang });
}
