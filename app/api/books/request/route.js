/**
 * POST /api/books/request
 * Create an ebook request: saves a book record + queues a generate_pdf job.
 */
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  let body = {};
  try { body = await request.json(); } catch {}

  const {
    title       = '나의 이야기',
    dedication  = null,
    autoPreface = true,
    autoEpilogue = true,
    fragmentIds  = [],
  } = body;

  if (!title?.trim()) {
    return Response.json({ error: '제목을 입력해 주세요.' }, { status: 400 });
  }

  const db = createDb();

  try {
    // Create book record (status = 'pending')
    const bookRes = await db.query(`
      INSERT INTO books
        (user_id, title, dedication, status, fragment_ids, auto_preface, auto_epilogue, format)
      VALUES ($1, $2, $3, 'pending', $4, $5, $6, 'pdf')
      RETURNING id, title, status, created_at
    `, [
      user.id,
      title.trim(),
      dedication || null,
      JSON.stringify(fragmentIds),
      autoPreface,
      autoEpilogue,
    ]);

    const book = bookRes.rows[0];

    // Queue generate_pdf job for the 5090 runner
    await db.query(`
      INSERT INTO fragment_generation_queue
        (user_id, job_type, input_data, priority)
      VALUES ($1, 'generate_pdf', $2, 3)
    `, [
      user.id,
      JSON.stringify({
        bookId      : book.id,
        fragmentIds,
        title       : title.trim(),
        dedication  : dedication || null,
        autoPreface,
        autoEpilogue,
      }),
    ]);

    console.log(`[POST /api/books/request] bookId=${book.id} userId=${user.id} fragments=${fragmentIds.length}`);

    return Response.json({ ok: true, book }, { status: 201 });
  } catch (e) {
    console.error('[POST /api/books/request]', e.message);
    return Response.json({ error: 'ebook 신청에 실패했습니다.' }, { status: 500 });
  }
}
