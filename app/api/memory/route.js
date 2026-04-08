import { requireAuth } from '@/lib/auth';
import { createDb } from '@/lib/db';

// GET /api/memory — returns memories from memory_nodes (new engine)
export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const db = createDb();

  try {
    // Fetch active memory nodes for this user, most recently updated first
    const result = await db.query(`
      SELECT node_type, label,
        COALESCE(
          data->>'summary',
          data->>'description',
          data->>'relationship',
          data->>'condition',
          data->>'activity',
          data->>'job',
          data->>'details',
          data->>'status',
          data->>'notes',
          data->>'text'
        ) AS content,
        emotional_weight, last_updated
      FROM memory_nodes
      WHERE user_id = $1 AND is_active = true
      ORDER BY last_updated DESC
      LIMIT 50
    `, [user.id]);

    const nodes = result.rows;

    // Format as simple fact strings for the memory drawer
    const facts = nodes.map(n => {
      const label = n.label || '';
      const content = n.content || '';
      return label && content ? `${label}: ${content}` : (label || content);
    }).filter(Boolean);

    // Count by category for summary
    const categoryCounts = {};
    for (const n of nodes) {
      categoryCounts[n.node_type] = (categoryCounts[n.node_type] || 0) + 1;
    }

    return Response.json({
      facts,
      summary: '',
      transcript: [],
      characterId: 'emma',
      memoryCount: nodes.length,
      categories: categoryCounts,
    });
  } catch (e) {
    console.error('[memory/GET] Error:', e.message);
    // Fall back to empty
    return Response.json({ facts: [], summary: '', transcript: [], characterId: 'emma', memoryCount: 0 });
  }
}

// DELETE /api/memory — soft-delete all memory nodes
export async function DELETE(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const db = createDb();
  try {
    await db.query(
      `UPDATE memory_nodes SET is_active = false WHERE user_id = $1`,
      [user.id]
    );
    return Response.json({ success: true });
  } catch (e) {
    console.error('[memory/DELETE] Error:', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
