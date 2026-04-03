import { requireAuth } from '@/lib/auth';

export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  return Response.json({
    id: user.id, email: user.email, name: user.name,
    role: user.role,
  });
}
