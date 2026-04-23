// app/api/user/apikey/route.js
// Save and retrieve the user's Gemini API key (stored per user in DB)
//
// 2026-04-23 v2: 서버 API 키 구조로 전환.
//  - user_settings 테이블은 Prisma(UserSetting 모델)로 관리 → ensureTable() 제거
//  - GET은 유저별 키 > 서버 env 키 순서로 fallback
//  - POST/DELETE는 미래 유료 티어용으로 유지 (UI에서 현재 노출 안 함)
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

// GET /api/user/apikey — return stored API key for this user, or server fallback
export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  // Priority: user_settings.gemini_api_key (if set) > process.env.GEMINI_API_KEY
  const db = createDb();

  let apiKey = null;
  try {
    const result = await db.query(
      'SELECT gemini_api_key FROM user_settings WHERE user_id = $1',
      [user.id]
    );
    apiKey = result.rows[0]?.gemini_api_key || null;
  } catch {
    // table may not exist yet on fresh deployments — fall through to server key
  }

  // Fallback to server-wide key so the frontend can use Emma immediately
  if (!apiKey) {
    apiKey = process.env.GEMINI_API_KEY || null;
  }

  return Response.json({ apiKey });
}

// POST /api/user/apikey — save API key for this user
export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { apiKey } = await request.json().catch(() => ({}));
  if (!apiKey || typeof apiKey !== 'string') {
    return Response.json({ error: 'No API key provided' }, { status: 400 });
  }

  const db = createDb();

  await db.query(
    `INSERT INTO user_settings (user_id, gemini_api_key, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE
     SET gemini_api_key = $2, updated_at = now()`,
    [user.id, apiKey]
  );

  return Response.json({ success: true });
}

// DELETE /api/user/apikey — remove stored API key
export async function DELETE(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const db = createDb();

  await db.query(
    'UPDATE user_settings SET gemini_api_key = NULL, updated_at = now() WHERE user_id = $1',
    [user.id]
  );

  return Response.json({ success: true });
}
