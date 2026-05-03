/**
 * POST /api/chat/analyze-test
 *
 * Standalone test endpoint for the Stage-1 analysis prompt (Task 88).
 * Does NOT touch /api/chat/turn or any conversation state. The only
 * caller right now is scripts/test-emma-analysis.js — once Tim signs
 * off, Stage 2 wires the engine into the real chat path.
 *
 * Body:
 *   {
 *     question: string,
 *     answer:   string,
 *     history?: [{ question, answer }, ...],
 *     previousAnalyses?: [analysis-object, ...],
 *     previouslyCoveredDimensions?: [string, ...]
 *   }
 *
 * Response:
 *   {
 *     analysis:   {...} | null,
 *     validation: { valid, errors },
 *     latency_ms: number,
 *     raw:        string   // raw LLM output, for debugging
 *   }
 */
import { requireAuth } from '@/lib/auth';

const { analyzeAnswer } = require('@/lib/emmaAnalysisEngine');

export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  if (typeof body?.question !== 'string' || typeof body?.answer !== 'string') {
    return Response.json({ error: 'question and answer are required strings' }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
  }

  try {
    const result = await analyzeAnswer({
      question: body.question,
      answer:   body.answer,
      history:  Array.isArray(body.history) ? body.history : undefined,
      previousAnalyses: Array.isArray(body.previousAnalyses) ? body.previousAnalyses : undefined,
      previouslyCoveredDimensions: Array.isArray(body.previouslyCoveredDimensions)
        ? body.previouslyCoveredDimensions
        : undefined,
    }, apiKey);

    return Response.json({
      analysis:   result.analysis,
      validation: result.validation,
      latency_ms: result.latencyMs,
      raw:        result.raw,
      user_id:    user.id,
    });
  } catch (e) {
    console.error('[analyze-test]', e?.message || e);
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
