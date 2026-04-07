import { prisma } from '@/lib/prisma';
import { signToken } from '@/lib/auth';
import { seedAdmin } from '@/lib/seed';
import bcrypt from 'bcryptjs';

export async function POST(request) {
  await seedAdmin();
  const { email, password, name } = await request.json();

  if (!email || !password || !name) {
    return Response.json({ error: 'Email, password, and name are required' }, { status: 400 });
  }
  if (password.length < 6) {
    return Response.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    return Response.json({ error: 'An account with this email already exists' }, { status: 409 });
  }

  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email: email.toLowerCase(), passwordHash: hash, name: name.trim() },
  });
  await prisma.userLimit.create({ data: { userId: user.id } });
  const token = signToken(user.id);
  return Response.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, lang: 'en' },
  });
}
