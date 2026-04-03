import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

// POST /api/admin/limits — update limits for a user
export async function POST(request) {
  const { user, error } = await requireAdmin(request);
  if (error) return error;

  const { userId, dailyMinutes, monthlyMinutes, memoryKb } = await request.json();

  if (!userId) return Response.json({ error: 'userId required' }, { status: 400 });

  await prisma.userLimit.upsert({
    where: { userId },
    update: { dailyMinutes, monthlyMinutes, memoryKb },
    create: { userId, dailyMinutes, monthlyMinutes, memoryKb },
  });

  return Response.json({ success: true });
}
