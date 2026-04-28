const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.PROD_DATABASE_URL);
(async () => {
  const frags = await sql`SELECT id, title, source_session_ids, created_at, word_count, parent_fragment_id FROM story_fragments WHERE user_id=2 ORDER BY created_at DESC LIMIT 12`;
  console.log('Recent 12 fragments:');
  frags.forEach(f => {
    const sids = (f.source_session_ids || []).map(x => x.slice(0, 8)).join(',');
    const role = f.parent_fragment_id ? 'cont' : 'root';
    console.log(' ', f.id.slice(0,8), f.created_at.toISOString().slice(11,19), f.word_count + 'w', role, 'sids=' + sids, '"' + f.title.slice(0,50) + '"');
  });

  console.log('\n=== DUPLICATE CHECK ===');
  const dupes = await sql`
    WITH expanded AS (
      SELECT id, title, created_at, parent_fragment_id, unnest(source_session_ids) AS sid
      FROM story_fragments WHERE user_id=2
    )
    SELECT sid, COUNT(*) AS n, array_agg(id ORDER BY created_at) AS frag_ids,
           array_agg(title ORDER BY created_at) AS titles,
           array_agg(created_at ORDER BY created_at) AS times
    FROM expanded
    GROUP BY sid
    HAVING COUNT(*) > 1
    ORDER BY n DESC
  `;
  console.log('Sessions with multiple fragments:', dupes.length);
  dupes.forEach(d => {
    console.log(' session', d.sid.slice(0,8), 'has', d.n, 'fragments:');
    d.frag_ids.forEach((fid, i) => {
      console.log('   -', fid.slice(0,8), d.times[i].toISOString().slice(11,19), '"' + d.titles[i].slice(0,50) + '"');
    });
  });
})().catch(e => { console.error(e.message); process.exit(1); });
