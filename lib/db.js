/**
 * Neon DB client wrapper for raw SQL queries.
 * Used by Memory Engine modules (recallEngine, emotionTracker, etc.)
 *
 * Returns a db object with a pg-compatible query(text, params) interface.
 * All memory engine tables use this — NOT Prisma.
 */
import { neon } from '@neondatabase/serverless';

let _sql = null;

function getSql() {
  if (!_sql) {
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

/**
 * Returns a db object compatible with the pattern used in lib/*.js:
 *   const result = await db.query('SELECT ...', [params]);
 *   result.rows → array of row objects
 */
export function createDb() {
  const sql = getSql();
  return {
    async query(text, params = []) {
      const rows = await sql.query(text, params);
      return { rows };
    },
  };
}
