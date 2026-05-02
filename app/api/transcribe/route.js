/**
 * POST /api/transcribe   (Task 80)
 *
 * Forwards a recorded audio Blob from the browser to OpenAI's
 * Whisper API and returns the transcript text. We use this as a
 * "second pass" on top of Gemini Live's real-time STT — Gemini
 * Live is great for conversational latency but we found it
 * silently truncates long Korean monologues (an 88-second turn
 * came back as 232 chars with English hallucination at the tail).
 * Whisper does not have that limit and produces full-fidelity
 * transcripts we can hand to fragment generation.
 *
 * Body: multipart/form-data { audio (Blob), lang? }
 * Returns: { transcript, language?, duration?, model }
 *
 * Auth + 25MB cap + image-equivalent allow-list (audio MIMEs only).
 * Failures are not user-facing; the caller falls back to the
 * Gemini Live transcript already on the chat session.
 */
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';
import { logApiUsage } from '@/lib/apiUsage';

export const maxDuration = 60;

const ALLOWED_AUDIO_MIME = new Set([
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-m4a',
  'audio/m4a',
]);
const MAX_SIZE_BYTES = 25 * 1024 * 1024; // OpenAI's hard cap

function normalizeMime(t) {
  return (t || '').toLowerCase().trim();
}

function pickWhisperLang(raw) {
  // OpenAI accepts ISO-639-1 codes. Map our 'ko'/'en'/'es' verbatim;
  // anything else falls through to undefined → Whisper auto-detects.
  const v = String(raw || '').toLowerCase();
  return v === 'ko' || v === 'en' || v === 'es' ? v : undefined;
}

export async function POST(request) {
  const tStart = Date.now();
  const { user, error } = await requireAuth(request);
  if (error) return error;

  if (!process.env.OPENAI_API_KEY) {
    console.error('[transcribe] OPENAI_API_KEY missing');
    return NextResponse.json(
      {
        error: 'transcribe not configured',
        detail: 'OPENAI_API_KEY env var is missing.',
      },
      { status: 500 }
    );
  }

  let form;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ error: 'invalid form data' }, { status: 400 }); }

  const audio = form.get('audio');
  if (!audio || typeof audio === 'string') {
    return NextResponse.json({ error: 'audio file required' }, { status: 400 });
  }

  const mime = normalizeMime(audio.type);
  if (mime && !ALLOWED_AUDIO_MIME.has(mime)) {
    // Some browsers report 'audio/webm; codecs="opus"' with a space; allow that too.
    const stripped = mime.replace(/\s+/g, '');
    if (!ALLOWED_AUDIO_MIME.has(stripped)) {
      console.warn(`[transcribe] unexpected mime "${mime}", forwarding anyway`);
    }
  }
  const size = typeof audio.size === 'number' ? audio.size : 0;
  if (size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: `audio too large (max ${MAX_SIZE_BYTES / 1024 / 1024}MB)` },
      { status: 400 }
    );
  }
  if (size === 0) {
    return NextResponse.json({ error: 'empty audio' }, { status: 400 });
  }

  const langParam   = pickWhisperLang(form.get('lang'));
  const sessionId   = form.get('sessionId') || null;
  const model       = 'whisper-1';

  // Build the upstream multipart body. We pass through the original
  // file unchanged so Whisper can sniff the container.
  const upstream = new FormData();
  upstream.append('file', audio, audio.name || 'recording.webm');
  upstream.append('model', model);
  // 🔥 Task 82b — switched from 'verbose_json' to plain 'json'.
  //   verbose_json triggers Whisper's segment-level confidence
  //   filtering which silently drops "uncertain" segments; on Korean
  //   monologues that meant the back third of a 4-minute session
  //   came back missing. Plain json returns the raw decoder output.
  upstream.append('response_format', 'json');
  if (langParam) upstream.append('language', langParam);
  // 🔥 Task 82b — temperature 0 → 0.2. Tim's 222s Korean recording
  //   came back as 764 chars (~35% of expected). At t=0 the decoder
  //   gives up on any segment it isn't fully confident about; a
  //   small amount of sampling noise lets it commit to the most
  //   likely Korean spelling instead of skipping. Whisper's docs
  //   explicitly recommend ≥ 0.2 for cold long-form speech.
  upstream.append('temperature', '0.2');
  // 🔥 Task 82b — Korean prompt. Whisper accepts an `initial prompt`
  //   that biases the decoder toward the expected vocabulary +
  //   spelling style. For Korean we pre-prime it with a sentence in
  //   complete-form 한국어 standard endings; on short clips this
  //   raises faithfulness markedly without affecting other languages.
  if (langParam === 'ko') {
    upstream.append(
      'prompt',
      '안녕하세요. 다음은 한국어로 된 자유로운 이야기입니다. 문장 부호와 띄어쓰기를 자연스럽게 적용해 주세요.'
    );
  }

  let res, json;
  try {
    res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: upstream,
    });
    json = await res.json().catch(() => ({}));
  } catch (e) {
    console.error('[transcribe] upstream fetch failed:', e?.message);
    return NextResponse.json(
      { error: 'transcribe upstream failed', detail: e?.message },
      { status: 502 }
    );
  }

  if (!res.ok) {
    console.error('[transcribe] whisper error:', res.status, json);
    return NextResponse.json(
      { error: 'transcribe failed', status: res.status, detail: json?.error?.message || null },
      { status: 502 }
    );
  }

  const transcript = (json?.text || '').trim();
  const duration   = Number(json?.duration || 0);
  const detected   = json?.language || null;
  const latencyMs  = Date.now() - tStart;

  // Fire-and-forget usage logging. Whisper bills $0.006/min; we
  // approximate via duration_seconds since we don't have a token
  // count. The api_usage_logs row uses the audio_seconds column when
  // present so we can roll up later.
  try {
    const db = createDb();
    // Estimated tokens for the lifetime cache: rough proxy = chars / 4.
    const estTokens = Math.ceil(transcript.length / 4);
    logApiUsage(db, {
      userId: user.id,
      sessionId,
      provider: 'openai',
      model: 'whisper-1',
      operation: 'transcribe',
      // No native usage object; usage table will record 0 cost (we
      // don't price audio in PRICING). Fragment cost shows up in
      // generateFragmentCloud separately.
      usageMetadata: {
        promptTokenCount: 0,
        candidatesTokenCount: estTokens,
        totalTokenCount: estTokens,
      },
      latencyMs,
      success: true,
    });
  } catch (e) {
    console.warn('[transcribe] usage log failed (non-fatal):', e?.message);
  }

  // 🔥 Task 82b — quality diagnostics. bytesPerSec confirms the
  //   browser is sending us proper 64 kbps audio (≈8000 bytes/s);
  //   if it falls below ~3000 the recorder downgraded the bitrate.
  //   charsPerSec catches the case where Whisper returns a thin
  //   transcript even on good audio: Korean monologues land around
  //   8–12 chars/sec, English 4–6. Anything under 4 cps is suspect.
  const bytesPerSec = duration > 0 ? Math.round(size / duration) : 0;
  const charsPerSec = duration > 0 ? +(transcript.length / duration).toFixed(2) : 0;
  const lowQuality  = duration >= 30 && charsPerSec > 0 && charsPerSec < 4;
  console.log(
    `[transcribe] user=${user.id} session=${sessionId || '-'} ` +
    `lang=${langParam || 'auto'} detected=${detected || '?'} ` +
    `bytes=${size} duration=${duration}s textLen=${transcript.length} ` +
    `bytesPerSec=${bytesPerSec} charsPerSec=${charsPerSec} ${latencyMs}ms`
  );
  if (lowQuality) {
    console.warn(
      `[transcribe] ⚠️ low-quality transcript suspected: ` +
      `${charsPerSec} chars/sec on ${duration}s of ${langParam || detected} audio. ` +
      `Expected ≥ 4 cps for English, ≥ 8 cps for Korean. ` +
      `Check browser audioBitsPerSecond and Whisper temperature.`
    );
  }

  return NextResponse.json({
    transcript,
    language: detected,
    duration,
    model,
  });
}
