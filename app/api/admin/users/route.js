import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

// GET /api/admin/users — list all users with usage stats
export async function GET(request) {
  const { user, error } = await requireAdmin(request);
  if (error) return error;

  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 7) + '-01';

  const users = await prisma.user.findMany({
    where: { role: 'user' },
    include: {
      limits: true,
      memory: { select: { factsJson: true, summary: true, transcriptJson: true } },
      usageLogs: {
        where: { sessionDate: { gte: monthStart } },
        select: { sessionDate: true, minutesUsed: true, turnsCount: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const result = users.map(u => {
    const todayLog = u.usageLogs.find(l => l.sessionDate === today);
    const monthMinutes = u.usageLogs.reduce((s, l) => s + l.minutesUsed, 0);
    const memSizeKb = u.memory
      ? ((u.memory.factsJson.length + u.memory.summary.length + u.memory.transcriptJson.length) / 1024)
      : 0;
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      avatarId: u.avatarId,
      isActive: u.isActive,
      createdAt: u.createdAt,
      limits: u.limits,
      todayMinutes: Math.round((todayLog?.minutesUsed || 0) * 10) / 10,
      monthMinutes: Math.round(monthMinutes * 10) / 10,
      memSizeKb: Math.round(memSizeKb * 100) / 100,
    };
  });

  return Response.json(result);
}

// PATCH /api/admin/users — toggle user active status
export async function PATCH(request) {
  const { user, error } = await requireAdmin(request);
  if (error) return error;

  const { userId, isActive } = await request.json();
  await prisma.user.update({ where: { id: userId }, data: { isActive } });
  return Response.json({ success: true });
}
