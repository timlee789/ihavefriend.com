import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';

export async function PATCH(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const decoded = verifyToken(authHeader.slice(7));
  if (!decoded?.userId) {
    return Response.json({ error: 'Invalid token' }, { status: 401 });
  }

  const { lang } = await request.json();
  const VALID = ['en', 'ko', 'es'];
  if (!VALID.includes(lang)) {
    return Response.json({ error: 'Invalid language' }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: decoded.userId },
    data: { lang },
  });

  return Response.json({ ok: true, lang });
}
