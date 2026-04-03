import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

// GET /api/memory?character=emma
export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const characterId = searchParams.get('character') || 'emma';

  const memory = await prisma.userMemory.findUnique({
    where: { userId_characterId: { userId: user.id, characterId } },
  });
  if (!memory) return Response.json({ facts: [], summary: '', transcript: [], characterId });

  const limits = await prisma.userLimit.findUnique({ where: { userId: user.id } });
  const sizeKb = (memory.factsJson.length + memory.summary.length + memory.transcriptJson.length) / 1024;

  return Response.json({
    facts: JSON.parse(memory.factsJson || '[]'),
    summary: memory.summary || '',
    transcript: JSON.parse(memory.transcriptJson || '[]'),
    characterId,
    sizeKb: Math.round(sizeKb * 100) / 100,
    limitKb: limits?.memoryKb || 512,
  });
}

// POST /api/memory?character=emma
export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const characterId = searchParams.get('character') || 'emma';

  const { facts, summary, transcript } = await request.json();

  const limits = await prisma.userLimit.findUnique({ where: { userId: user.id } });
  const maxKb = limits?.memoryKb || 512;

  const factsJson = JSON.stringify(facts || []);
  const transcriptJson = JSON.stringify(transcript || []);
  const sizeKb = (factsJson.length + (summary || '').length + transcriptJson.length) / 1024;

  if (sizeKb > maxKb) {
    return Response.json({ error: `Memory limit exceeded (${maxKb}KB)` }, { status: 413 });
  }

  await prisma.userMemory.upsert({
    where: { userId_characterId: { userId: user.id, characterId } },
    update: { factsJson, summary: summary || '', transcriptJson },
    create: { userId: user.id, characterId, factsJson, summary: summary || '', transcriptJson },
  });

  return Response.json({ success: true, sizeKb: Math.round(sizeKb * 100) / 100 });
}

// DELETE /api/memory?character=emma
export async function DELETE(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const characterId = searchParams.get('character') || 'emma';

  await prisma.userMemory.updateMany({
    where: { userId: user.id, characterId },
    data: { factsJson: '[]', summary: '', transcriptJson: '[]' },
  });

  return Response.json({ success: true });
}
