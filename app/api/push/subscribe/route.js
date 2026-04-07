import { verifyToken } from '@/lib/auth';
import { saveSubscription } from '@/lib/pushNotification';

export async function POST(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const decoded = verifyToken(authHeader.slice(7));
  if (!decoded?.userId) {
    return Response.json({ error: 'Invalid token' }, { status: 401 });
  }

  const { subscription } = await request.json();
  if (!subscription?.endpoint) {
    return Response.json({ error: 'Missing subscription' }, { status: 400 });
  }

  await saveSubscription(decoded.userId, subscription);
  return Response.json({ ok: true });
}
