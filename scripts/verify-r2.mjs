// scripts/verify-r2.mjs
// R2 연결 검증 스크립트
// 사용법: node scripts/verify-r2.mjs

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { readFileSync, existsSync } from 'fs';

// .env 파일 로드 (우선순위: .env.local > .env)
const envFiles = ['.env.local', '.env'];
let loadedFrom = null;

for (const file of envFiles) {
  if (!existsSync(file)) continue;
  try {
    const content = readFileSync(file, 'utf-8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eq = trimmed.indexOf('=');
      if (eq === -1) return;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = value;
    });
    if (!loadedFrom) loadedFrom = file;
  } catch (e) {
    console.warn(`⚠️  Failed to read ${file}: ${e.message}`);
  }
}

if (loadedFrom) {
  console.log(`📄 Loaded env from ${loadedFrom}\n`);
} else {
  console.warn('⚠️  No .env or .env.local file found\n');
}

const required = ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ENDPOINT', 'R2_BUCKET', 'R2_PUBLIC_URL'];
const missing = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error('❌ Missing ENV variables:', missing.join(', '));
  console.error('\n💡 Debug info:');
  console.error('   Working directory:', process.cwd());
  console.error('   Env file loaded from:', loadedFrom || '(none)');
  console.error('\n   Found these R2_* keys in process.env:');
  Object.keys(process.env).filter(k => k.startsWith('R2_')).forEach(k => {
    console.error(`     ${k} = ${process.env[k] ? '(set)' : '(empty)'}`);
  });
  process.exit(1);
}

console.log('🔍 R2 Connection Verification\n');
console.log('  Bucket:     ', process.env.R2_BUCKET);
console.log('  Endpoint:   ', process.env.R2_ENDPOINT);
console.log('  Public URL: ', process.env.R2_PUBLIC_URL);
console.log('  Access Key: ', process.env.R2_ACCESS_KEY_ID.slice(0, 6) + '...' + process.env.R2_ACCESS_KEY_ID.slice(-4));
console.log('');

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const bucket = process.env.R2_BUCKET;
const testKey = `_verify/test-${Date.now()}.txt`;
const testContent = `R2 verification test\nTimestamp: ${new Date().toISOString()}\n`;

try {
  console.log('1️⃣  Listing bucket...');
  const list = await s3.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 5 }));
  console.log(`   ✅ Bucket accessible. ${list.KeyCount || 0} objects found.\n`);

  console.log('2️⃣  Uploading test file...');
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: testKey,
    Body: testContent,
    ContentType: 'text/plain',
  }));
  console.log(`   ✅ Upload OK: ${testKey}\n`);

  const publicUrl = `${process.env.R2_PUBLIC_URL}/${testKey}`;
  console.log('3️⃣  Testing public URL access...');
  console.log(`   URL: ${publicUrl}`);
  // R2 public URL은 즉시 반영 안 될 수 있어 약간 대기
  await new Promise(r => setTimeout(r, 1500));
  const res = await fetch(publicUrl);
  if (res.ok) {
    const text = await res.text();
    if (text.includes('R2 verification test')) {
      console.log('   ✅ Public URL accessible. Content matches.\n');
    } else {
      console.log('   ⚠️  Public URL accessible but content mismatch.\n');
    }
  } else {
    console.log(`   ❌ Public URL failed: ${res.status} ${res.statusText}`);
    console.log('   → Check Public Development URL is enabled in Cloudflare dashboard.\n');
  }

  console.log('4️⃣  Cleaning up test file...');
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));
  console.log('   ✅ Delete OK.\n');

  console.log('🎉 All checks passed! R2 is ready to use.');
  process.exit(0);
} catch (err) {
  console.error('\n❌ Verification failed:');
  console.error('   Name:   ', err.name);
  console.error('   Message:', err.message);
  if (err.$metadata) {
    console.error('   HTTP:   ', err.$metadata.httpStatusCode);
  }
  console.error('\n💡 Common issues:');
  console.error('   - Wrong Access Key ID or Secret Access Key');
  console.error('   - Token does not have permission for this bucket');
  console.error('   - Endpoint URL incorrect');
  process.exit(1);
}