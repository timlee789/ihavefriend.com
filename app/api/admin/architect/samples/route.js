/**
 * POST /api/admin/architect/samples
 *
 * Tim 시나리오 추가/수정 (admin only). idempotent — INSERT ON CONFLICT
 * (id) DO UPDATE. seed script (scripts/seed-blueprint-samples.js) 와
 * 동일한 패턴이라 재실행 안전.
 *
 * Strategy: STRATEGY-architect-bot-final-V2-2026-05-08.md
 *
 * Auth: requireAdmin (user.role === 'admin').
 *
 * Body:
 *   {
 *     "id":            "sample-006",       // required
 *     "display_label": "목차 샘플 6",       // required
 *     "language":      "ko",               // optional, default 'ko'
 *     "structure":     { chapters: [...] }, // required, validated
 *     "is_active":     true,               // optional, default true
 *     "sort_order":    6                   // optional, default 0
 *   }
 *
 * Validation:
 *   - structure.chapters MUST be an array
 *   - each chapter MUST have id + title + questions (array)
 *   - each question MUST have id + prompt
 *
 * Response:
 *   201 (created) | 200 (updated)
 *   { sample, created: boolean }
 */
import { requireAdmin } from '@/lib/auth';
import { createDb } from '@/lib/db';

export async function POST(request) {
  const { user, error } = await requireAdmin(request);
  if (error) return error;

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  // ── Required fields ──
  const id           = String(body?.id           || '').trim();
  const displayLabel = String(body?.display_label || '').trim();
  const structure    = body?.structure;

  if (!id) {
    return Response.json({ error: 'id required' }, { status: 400 });
  }
  if (!displayLabel) {
    return Response.json({ error: 'display_label required' }, { status: 400 });
  }
  if (!structure || typeof structure !== 'object') {
    return Response.json({ error: 'structure (object) required' }, { status: 400 });
  }

  // ── Structure shape validation ──
  const validationError = validateStructure(structure);
  if (validationError) {
    return Response.json({ error: validationError }, { status: 400 });
  }

  // ── Optional fields w/ defaults ──
  const language  = String(body?.language || 'ko').trim();
  const isActive  = body?.is_active === false ? false : true;
  const sortOrder = Number.isInteger(body?.sort_order) ? body.sort_order : 0;

  const db = createDb();
  try {
    // Pre-check whether row exists (so we can return 201 vs 200).
    const existed = await db.query(
      `SELECT 1 FROM blueprint_samples WHERE id = $1`,
      [id]
    );
    const wasNew = existed.rows.length === 0;

    const result = await db.query(
      `INSERT INTO blueprint_samples
         (id, display_label, language, structure, is_active, sort_order)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         display_label = EXCLUDED.display_label,
         language      = EXCLUDED.language,
         structure     = EXCLUDED.structure,
         is_active     = EXCLUDED.is_active,
         sort_order    = EXCLUDED.sort_order,
         updated_at    = NOW()
       RETURNING id, display_label, language, structure, is_active, sort_order,
                 created_at, updated_at`,
      [id, displayLabel, language, JSON.stringify(structure), isActive, sortOrder]
    );

    console.log(
      `[POST /api/admin/architect/samples] admin=${user.id} ${wasNew ? 'created' : 'updated'} ${id}`
    );

    return Response.json(
      { sample: result.rows[0], created: wasNew },
      { status: wasNew ? 201 : 200 }
    );
  } catch (e) {
    console.error('[POST /api/admin/architect/samples]', e?.message);
    return Response.json(
      { error: 'upsert failed', detail: e?.message },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────
// validateStructure — return error string or null if OK.
// ─────────────────────────────────────────────────────────────────
function validateStructure(structure) {
  if (!Array.isArray(structure.chapters)) {
    return 'structure.chapters (array) required';
  }
  for (let ci = 0; ci < structure.chapters.length; ci++) {
    const ch = structure.chapters[ci];
    if (!ch || typeof ch !== 'object') {
      return `structure.chapters[${ci}] must be an object`;
    }
    if (!ch.id) {
      return `structure.chapters[${ci}].id required`;
    }
    if (!ch.title) {
      return `structure.chapters[${ci}].title required`;
    }
    if (!Array.isArray(ch.questions)) {
      return `structure.chapters[${ci}].questions (array) required`;
    }
    for (let qi = 0; qi < ch.questions.length; qi++) {
      const q = ch.questions[qi];
      if (!q || typeof q !== 'object') {
        return `structure.chapters[${ci}].questions[${qi}] must be an object`;
      }
      if (!q.id) {
        return `structure.chapters[${ci}].questions[${qi}].id required`;
      }
      if (!q.prompt) {
        return `structure.chapters[${ci}].questions[${qi}].prompt required`;
      }
    }
  }
  return null;
}
