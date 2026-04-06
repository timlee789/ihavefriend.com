// app/api/user/apikey/route.js
// Save and retrieve the user's Gemini API key (stored per user in DB)
import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

// Ensure table exists (called lazily on first use)
async function ensureTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id   INTEGER PRIMARY KEY REFERENCES "User"(id) ON DELETE CASCADE,
      gemini_api_key TEXT,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);
}

// GET /api/user/apikey — return stored API key for this user
export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const db = createDb();
  await ensureTable(db);

  const result = await db.query(
    'SELECT gemini_api_key FROM user_settings WHERE user_id = $1',
    [user.id]
  );

  const apiKey = result.rows[0]?.gemini_api_key || null;
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
  await ensureTable(db);

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
  await ensureTable(db);

  await db.query(
    'UPDATE user_settings SET gemini_api_key = NULL, updated_at = now() WHERE user_id = $1',
    [user.id]
  );

  return Response.json({ success: true });
}
