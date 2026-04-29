/**
 * POST /api/book/[id]/reorder
 *
 * Body:
 *   { type: 'chapter',  orderedIds: [chapterIds] }
 *   { type: 'question', parentId: chapterId, orderedIds: [questionIds] }
 *
 * Reorders chapters or the questions inside a single chapter. We map
 * the incoming id list against the existing array and rebuild it in
 * the new order; any ids not in the request stay in their existing
 * relative positions appended at the tail (defensive against a
 * stale client missing newly-created items).
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: bookId } = await params;
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  const { type, parentId, orderedIds } = body || {};
  if (!type || !Array.isArray(orderedIds)) {
    return Response.json({ error: 'type and orderedIds required' }, { status: 400 });
  }
  if (type !== 'chapter' && type !== 'question') {
    return Response.json({ error: 'invalid type' }, { status: 400 });
  }
  if (type === 'question' && !parentId) {
    return Response.json({ error: 'parentId required for question reorder' }, { status: 400 });
  }

  const db = createDb();
  try {
    const bookRes = await db.query(
      `SELECT structure FROM user_books WHERE id = $1 AND user_id = $2`,
      [bookId, user.id]
    );
    if (bookRes.rows.length === 0) {
      return Response.json({ error: 'not found' }, { status: 404 });
    }
    const structure = bookRes.rows[0].structure || { chapters: [] };
    if (!Array.isArray(structure.chapters)) structure.chapters = [];

    const reorderArray = (arr, ids) => {
      const map = Object.create(null);
      for (const item of arr) map[item.id] = item;
      const seen = new Set(ids);
      const head = ids.map(id => map[id]).filter(Boolean);
      const tail = arr.filter(item => !seen.has(item.id));
      return [...head, ...tail];
    };

    if (type === 'chapter') {
      structure.chapters = reorderArray(structure.chapters, orderedIds);
      structure.chapters.forEach((c, i) => { c.order = i + 1; });
    } else {
      const ch = structure.chapters.find(c => c.id === parentId);
      if (!ch) return Response.json({ error: 'chapter not found' }, { status: 404 });
      ch.questions = reorderArray(ch.questions || [], orderedIds);
      ch.questions.forEach((q, i) => { q.order = i + 1; });
    }

    await db.query(
      `UPDATE user_books
          SET structure      = $1::jsonb,
              last_active_at = NOW()
        WHERE id = $2 AND user_id = $3`,
      [JSON.stringify(structure), bookId, user.id]
    );

    return Response.json({ ok: true });
  } catch (e) {
    console.error('[POST /api/book/[id]/reorder]', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
