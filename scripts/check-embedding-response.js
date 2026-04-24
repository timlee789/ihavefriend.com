require('dotenv').config({ path: './.env' });

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('❌ GEMINI_API_KEY not set');
  process.exit(1);
}

(async () => {
  const text = "Acquired grill restaurant: {'era': '1990s'}";
  console.log('Testing embedding for:', text);
  console.log('');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        outputDimensionality: 768,
      }),
    }
  );

  console.log('HTTP status:', res.status, res.statusText);
  console.log('');

  const data = await res.json();
  console.log('Full response JSON:');
  console.log(JSON.stringify(data, null, 2).slice(0, 2000));
  console.log('');

  console.log('--- Field probes ---');
  console.log('data.embedding:', typeof data.embedding, data.embedding ? 'truthy' : 'falsy');
  console.log('data.embedding?.values length:', data.embedding?.values?.length ?? 'undefined');
  console.log('data.embedding?.value length:', data.embedding?.value?.length ?? 'undefined');
  console.log('data.embeddings?.length:', data.embeddings?.length ?? 'undefined');
  console.log('data.predictions?.length:', data.predictions?.length ?? 'undefined');
  console.log('data.error:', data.error || 'none');
})();
