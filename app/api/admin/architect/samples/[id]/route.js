/**
 * PATCH  /api/admin/architect/samples/[id]  — partial update
 * DELETE /api/admin/architect/samples/[id]  — remove sample
 *
 * Admin only. PATCH 는 부분 업데이트 (display_label / is_active /
 * sort_order / structure 중 보낸 필드만), DELETE 는 row 제거.
 *
 * DELETE 시 user_books.source_sample_id 의 FK constraint 가 ON DELETE
 * SET NULL 이라 사용 중인 user_books 는 자동으로 source_sample_id 가
 * NULL 됨 (book 자체는 안 지워짐).
 *
 * Strategy: STRATEGY-architect-bot-final-V2-2026-05-08.md
 */
import { requireAdmin } from '@/lib/auth';
import { createDb } from '@/lib/db';

// ─────────────────────────────────────────────────────────────────
// PATCH — partial update
// ─────────────────────────────────────────────────────────────────
export async function PATCH(request, { params }) {
  const { user, error } = await requireAdmin(request);
  if (error) return error;

  const { id } = await params;
  if (!id) {
    return Response.json({ error: 'id required' }, { status: 400 });
  }

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  // 보낸 필드만 SET. 빈 body 거부.
  const updates = [];
  const values  = [];
  let i = 1;

  if (typeof body?.display_label === 'string') {
    const v = body.display_label.trim();
    if (!v) return Response.json({ error: 'display_label cannot be empty' }, { status: 400 });
    updates.push(`display_label = $${i++}`);
    values.push(v);
  }
  if (typeof body?.language === 'string') {
    updates.push(`language = $${i++}`);
    values.push(body.language.trim());
  }
  if (typeof body?.is_active === 'boolean') {
    updates.push(`is_active = $${i++}`);
    values.push(body.is_active);
  }
  if (Number.isInteger(body?.sort_order)) {
    updates.push(`sort_order = $${i++}`);
    values.push(body.sort_order);
  }
  if (body?.structure !== undefined) {
    if (!body.structure || typeof body.structure !== 'object') {
      return Response.json({ error: 'structure must be an object' }, { status: 400 });
    }
    const validationError = validateStructure(body.structure);
    if (validationError) {
      return Response.json({ error: validationError }, { status: 400 });
    }
    updates.push(`structure = $${i++}::jsonb`);
    values.push(JSON.stringify(body.structure));
  }

  if (updates.length === 0) {
    return Response.json({ error: 'nothing to update' }, { status: 400 });
  }

  values.push(id);
  const db = createDb();
  try {
    const result = await db.query(
      `UPDATE blueprint_samples
          SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${i++}
        RETURNING id, display_label, language, structure, is_active, sort_order,
                  created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      return Response.json({ error: 'sample not found' }, { status: 404 });
    }

    console.log(
      `[PATCH /api/admin/architect/samples/${id}] admin=${user.id} ` +
      `updated [${Object.keys(body).join(',')}]`
    );

    return Response.json({ sample: result.rows[0] });
  } catch (e) {
    console.error(`[PATCH /api/admin/architect/samples/${id}]`, e?.message);
    return Response.json(
      { error: 'patch failed', detail: e?.message },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────
// DELETE — remove sample
// ─────────────────────────────────────────────────────────────────
export async function DELETE(request, { params }) {
  const { user, error } = await requireAdmin(request);
  if (error) return error;

  const { id } = await params;
  if (!id) {
    return Response.json({ error: 'id required' }, { status: 400 });
  }

  const db = createDb();
  try {
    const result = await db.query(
      `DELETE FROM blueprint_samples WHERE id = $1 RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) {
      return Response.json({ error: 'sample not found' }, { status: 404 });
    }

    console.log(
      `[DELETE /api/admin/architect/samples/${id}] admin=${user.id} → ` +
      `user_books.source_sample_id 자동 NULL (FK ON DELETE SET NULL)`
    );

    return Response.json({ deleted: true, id });
  } catch (e) {
    console.error(`[DELETE /api/admin/architect/samples/${id}]`, e?.message);
    return Response.json(
      { error: 'delete failed', detail: e?.message },
      { status: 500 }
    );
  }
}

// Same validator as POST route — duplicated here so the [id] file is
// self-contained. Small enough that DRY-ing into a shared lib would be
// overkill (one validator, two callers).
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
