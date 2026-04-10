/**
 * PATCH /api/user/phone
 * Save or update the authenticated user's phone number.
 *
 * Body: { phone: string }   e.g. "+821012345678" or "010-1234-5678"
 */
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

  const { phone } = await request.json().catch(() => ({}));
  if (!phone || typeof phone !== 'string') {
    return Response.json({ error: 'Phone number required' }, { status: 400 });
  }

  // Normalize: keep digits and leading +
  const normalized = phone.startsWith('+')
    ? '+' + phone.slice(1).replace(/\D/g, '')
    : phone.replace(/\D/g, '');

  const digits = normalized.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    return Response.json({ error: 'Invalid phone number' }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: decoded.userId },
    data:  { phone: normalized },
  });

  return Response.json({ ok: true, phone: normalized });
}
