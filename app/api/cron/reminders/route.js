import { processScheduledReminders } from '@/lib/pushNotification';

// Called by Vercel Cron every 15 minutes
export async function GET(request) {
  // Verify cron secret (Vercel sets this header automatically)
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = await processScheduledReminders();
  return Response.json({ ok: true, ...result });
}
