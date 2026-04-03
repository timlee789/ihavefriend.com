import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

const VALID_AVATARS = ['lily', 'james', 'sunny', 'grace'];

export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { avatarId } = await request.json();
  if (!VALID_AVATARS.includes(avatarId)) {
    return Response.json({ error: 'Invalid avatar' }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { avatarId, avatarChosen: true },
  });

  return Response.json({ success: true, avatarId });
}
