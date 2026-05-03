/**
 * POST /api/chat/decide-test
 *
 * Standalone test endpoint for the Stage-2 decision prompt (Task 89).
 * Does NOT touch /api/chat/turn or any conversation state. The only
 * caller right now is scripts/test-emma-decision.js — once Tim signs
 * off, Stage 3 wires the engine into the real chat path.
 *
 * Body:
 *   {
 *     mode:     'book' | 'story' | 'companion',
 *     lang:     'ko'   | 'en'    | 'es',
 *     question: string,
 *     answer:   string,
 *     analysis: <Stage 1 analysis object>,
 *     history?: [{ question, answer }, ...],
 *     previouslyCoveredDimensions?: string[],
 *     lastEmmaAction?: { action, ground_in?, target_dimension? } | null
 *   }
 *
 * Response:
 *   {
 *     decision:   {...} | null,
 *     validation: { valid, errors },
 *     latency_ms: number,
 *     raw:        string
 *   }
 */
import { requireAuth } from '@/lib/auth';

export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  if (typeof body?.question !== 'string' || typeof body?.answer !== 'string') {
    return Response.json({ error: 'question and answer are required strings' }, { status: 400 });
  }
  if (!body?.analysis || typeof body.analysis !== 'object') {
    return Response.json({ error: 'analysis (Stage 1 object) required' }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
  }

  // Lazy require so the engine is only loaded when this endpoint is hit
  // (keeps it out of the edge bundle for unrelated routes).
  const { decideNextAction } = require('@/lib/emmaDecisionEngine');

  try {
    const result = await decideNextAction({
      mode: body.mode,
      lang: body.lang,
      question: body.question,
      answer:   body.answer,
      analysis: body.analysis,
      history:  Array.isArray(body.history) ? body.history : undefined,
      previouslyCoveredDimensions: Array.isArray(body.previouslyCoveredDimensions)
        ? body.previouslyCoveredDimensions
        : undefined,
      lastEmmaAction: body.lastEmmaAction ?? null,
    }, apiKey);

    return Response.json({
      decision:   result.decision,
      validation: result.validation,
      latency_ms: result.latencyMs,
      raw:        result.raw,
      user_id:    user.id,
    });
  } catch (e) {
    console.error('[decide-test]', e?.message || e);
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
