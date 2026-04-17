/**
 * Memory Graph operations for sayandkeep.com
 * 
 * Manages the graph structure: nodes, edges, traversal.
 * Used by the Token Budget System for context-matched retrieval.
 */

/**
 * Reinforce an edge (called when two memories are mentioned together).
 */
async function reinforceEdge(db, sourceId, targetId) {
  await db.query(`
    UPDATE memory_edges SET
      co_occurrence = co_occurrence + 1,
      weight = LEAST(1.0, weight + 0.05),
      last_reinforced = NOW()
    WHERE source_node = $1 AND target_node = $2
  `, [sourceId, targetId]);
}

/**
 * Find anchor nodes mentioned in the current message.
 * Uses label matching against all active memory nodes.
 */
async function findAnchors(db, userId, message) {
  const nodes = await db.query(`
    SELECT id, label, node_type, emotional_weight
    FROM memory_nodes
    WHERE user_id = $1 AND is_active = true
  `, [userId]);

  const messageLower = message.toLowerCase();
  
  return nodes.rows.filter(node => {
    const words = node.label.toLowerCase().split(/\s+/);
    // Match if any significant word (3+ chars) appears in message
    return words.some(w => w.length >= 3 && messageLower.includes(w));
  });
}

/**
 * Traverse graph from anchor nodes up to maxHops.
 * Returns neighboring memories sorted by relevance.
 */
async function traverse(db, userId, anchorIds, maxHops = 2) {
  if (anchorIds.length === 0) return [];

  const visited = new Set(anchorIds);
  let currentLayer = anchorIds;
  const results = [];

  for (let hop = 0; hop < maxHops; hop++) {
    if (currentLayer.length === 0) break;

    const neighbors = await db.query(`
      SELECT 
        mn.id, mn.label, mn.node_type, mn.data,
        mn.emotional_weight, mn.mention_count,
        me.weight AS edge_weight,
        me.relationship
      FROM memory_edges me
      JOIN memory_nodes mn ON mn.id = me.target_node
      WHERE me.source_node = ANY($1)
        AND me.user_id = $2
        AND mn.is_active = true
        AND me.weight > 0.2
      
      UNION
      
      SELECT 
        mn.id, mn.label, mn.node_type, mn.data,
        mn.emotional_weight, mn.mention_count,
        me.weight AS edge_weight,
        me.relationship
      FROM memory_edges me
      JOIN memory_nodes mn ON mn.id = me.source_node
      WHERE me.target_node = ANY($1)
        AND me.user_id = $2
        AND mn.is_active = true
        AND me.weight > 0.2
        AND me.bidirectional = true
      
      ORDER BY edge_weight DESC
    `, [currentLayer, userId]);

    const nextLayer = [];
    for (const neighbor of neighbors.rows) {
      if (!visited.has(neighbor.id)) {
        visited.add(neighbor.id);
        const hopDecay = 1 / (hop + 1);
        results.push({
          ...neighbor,
          relevance_score: parseFloat(neighbor.edge_weight) * neighbor.emotional_weight * hopDecay,
          source: 'graph',
          hop: hop + 1,
        });
        nextLayer.push(neighbor.id);
      }
    }
    currentLayer = nextLayer;
  }

  return results.sort((a, b) => b.relevance_score - a.relevance_score);
}

/**
 * Apply memory decay — reduce confidence of old, unused memories.
 * Run this daily via cron or scheduled function.
 */
async function applyMemoryDecay(db, userId) {
  // Reduce confidence for memories not mentioned in 90+ days
  const result = await db.query(`
    UPDATE memory_nodes SET
      confidence = CASE
        WHEN last_mentioned < NOW() - INTERVAL '90 days' THEN 'low'
        WHEN last_mentioned < NOW() - INTERVAL '30 days' AND confidence = 'high' THEN 'medium'
        ELSE confidence
      END
    WHERE user_id = $1 AND is_active = true
    RETURNING id, label, confidence
  `, [userId]);

  return result.rows;
}

/**
 * Decay edge weights for stale connections.
 * Edges not reinforced in 60+ days lose weight.
 */
async function applyEdgeDecay(db, userId) {
  await db.query(`
    UPDATE memory_edges SET
      weight = GREATEST(0.1, weight - 0.1)
    WHERE user_id = $1
      AND last_reinforced < NOW() - INTERVAL '60 days'
      AND weight > 0.1
  `, [userId]);
}

/**
 * Get the full memory graph for a user (for visualization/debugging).
 */
async function getFullGraph(db, userId) {
  const nodes = await db.query(`
    SELECT id, label, node_type, emotional_weight, mention_count, confidence
    FROM memory_nodes
    WHERE user_id = $1 AND is_active = true
    ORDER BY emotional_weight DESC
  `, [userId]);

  const edges = await db.query(`
    SELECT 
      source_node, target_node, relationship, weight, co_occurrence
    FROM memory_edges
    WHERE user_id = $1
    ORDER BY weight DESC
  `, [userId]);

  return {
    nodes: nodes.rows,
    edges: edges.rows,
    stats: {
      totalNodes: nodes.rows.length,
      totalEdges: edges.rows.length,
      avgWeight: edges.rows.length > 0
        ? (edges.rows.reduce((s, e) => s + parseFloat(e.weight), 0) / edges.rows.length).toFixed(2)
        : 0,
    },
  };
}

module.exports = {
  reinforceEdge,
  findAnchors,
  traverse,
  applyMemoryDecay,
  applyEdgeDecay,
  getFullGraph,
};
