import { prisma } from '@/lib/prisma';
import { signToken } from '@/lib/auth';
import { seedAdmin } from '@/lib/seed';
import bcrypt from 'bcryptjs';

export async function POST(request) {
  await seedAdmin();
  const { email, password } = await request.json();

  if (!email || !password) {
    return Response.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) {
    return Response.json({ error: 'Invalid email or password' }, { status: 401 });
  }
  if (!user.isActive) {
    return Response.json({ error: 'Your account has been disabled. Please contact support.' }, { status: 403 });
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return Response.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const token = signToken(user.id);
  return Response.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
}
