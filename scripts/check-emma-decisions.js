#!/usr/bin/env node
/**
 * scripts/check-emma-decisions.js
 *
 * Quick query helper — Tim doesn't have psql installed locally.
 * Reads the same Neon DB and prints the latest emma_decisions rows
 * + action distribution.
 *
 * Usage:
 *   DATABASE_URL=<production-url> node scripts/check-emma-decisions.js
 */

const { Client } = require('pg');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    console.log('\n=== Latest 20 decisions ===\n');
    const recent = await client.query(`
      SELECT created_at, turn_number, action, 
             LEFT(suggested_response, 80) AS response_preview,
             analysis_ms, decision_ms, consumed_at
      FROM emma_decisions
      ORDER BY created_at DESC
      LIMIT 20
    `);
    if (recent.rows.length === 0) {
      console.log('(no rows yet — Stage 3 hasn\'t produced any decisions)');
    } else {
      recent.rows.forEach(r => {
        const time = new Date(r.created_at).toLocaleString('ko-KR');
        const consumed = r.consumed_at ? '✓' : ' ';
        console.log(
          `${time} [turn ${r.turn_number}] ${consumed} ${r.action.padEnd(20)} ` +
          `(a=${r.analysis_ms}ms d=${r.decision_ms}ms)`
        );
        if (r.response_preview) {
          console.log(`   "${r.response_preview}"`);
        }
      });
    }

    console.log('\n=== Action distribution (last hour) ===\n');
    const dist = await client.query(`
      SELECT action, COUNT(*) AS count
      FROM emma_decisions
      WHERE created_at > NOW() - INTERVAL '1 hour'
      GROUP BY action
      ORDER BY count DESC
    `);
    if (dist.rows.length === 0) {
      console.log('(no decisions in the last hour)');
    } else {
      const total = dist.rows.reduce((sum, r) => sum + Number(r.count), 0);
      dist.rows.forEach(r => {
        const pct = ((Number(r.count) / total) * 100).toFixed(0);
        console.log(`  ${r.action.padEnd(20)} ${String(r.count).padStart(4)} (${pct}%)`);
      });
      console.log(`  ${'TOTAL'.padEnd(20)} ${String(total).padStart(4)}`);
    }

    console.log('\n=== Latency stats (last hour) ===\n');
    const stats = await client.query(`
      SELECT 
        ROUND(AVG(analysis_ms)) AS avg_analysis,
        ROUND(AVG(decision_ms)) AS avg_decision,
        ROUND(AVG(analysis_ms + decision_ms)) AS avg_total,
        MAX(analysis_ms + decision_ms) AS max_total
      FROM emma_decisions
      WHERE created_at > NOW() - INTERVAL '1 hour'
    `);
    if (stats.rows[0].avg_total) {
      console.log(`  avg analysis:  ${stats.rows[0].avg_analysis}ms`);
      console.log(`  avg decision:  ${stats.rows[0].avg_decision}ms`);
      console.log(`  avg total:     ${stats.rows[0].avg_total}ms`);
      console.log(`  max total:     ${stats.rows[0].max_total}ms`);
    }

    console.log('\n=== Consumed vs unconsumed (last hour) ===\n');
    const consumed = await client.query(`
      SELECT 
        COUNT(*) FILTER (WHERE consumed_at IS NOT NULL) AS consumed,
        COUNT(*) FILTER (WHERE consumed_at IS NULL) AS unconsumed
      FROM emma_decisions
      WHERE created_at > NOW() - INTERVAL '1 hour'
    `);
    console.log(`  consumed:    ${consumed.rows[0].consumed}`);
    console.log(`  unconsumed:  ${consumed.rows[0].unconsumed}`);
    console.log('');

  } finally {
    await client.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
