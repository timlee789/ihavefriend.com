import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

// GET /api/usage — get current user's usage + limits
export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 7) + '-01';

  const [limits, todayLog, monthLogs] = await Promise.all([
    prisma.userLimit.findUnique({ where: { userId: user.id } }),
    prisma.usageLog.findUnique({ where: { userId_sessionDate: { userId: user.id, sessionDate: today } } }),
    prisma.usageLog.findMany({
      where: { userId: user.id, sessionDate: { gte: monthStart } },
    }),
  ]);

  const todayMinutes = todayLog?.minutesUsed || 0;
  const monthMinutes = monthLogs.reduce((sum, l) => sum + l.minutesUsed, 0);
  const todayTurns = todayLog?.turnsCount || 0;

  return Response.json({
    todayMinutes: Math.round(todayMinutes * 10) / 10,
    monthMinutes: Math.round(monthMinutes * 10) / 10,
    todayTurns,
    dailyLimit: limits?.dailyMinutes || 30,
    monthlyLimit: limits?.monthlyMinutes || 300,
    canChat: todayMinutes < (limits?.dailyMinutes || 30) && monthMinutes < (limits?.monthlyMinutes || 300),
  });
}

// POST /api/usage — log usage after a session
export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { minutesUsed, turnsCount } = await request.json();
  const today = new Date().toISOString().split('T')[0];

  await prisma.usageLog.upsert({
    where: { userId_sessionDate: { userId: user.id, sessionDate: today } },
    update: {
      minutesUsed: { increment: minutesUsed || 0 },
      turnsCount: { increment: turnsCount || 0 },
    },
    create: {
      userId: user.id,
      sessionDate: today,
      minutesUsed: minutesUsed || 0,
      turnsCount: turnsCount || 0,
    },
  });

  return Response.json({ success: true });
}
