import { processDailyOutreach } from '@/lib/dailyOutreach';

// Called by Vercel Cron at 10:00 AM UTC daily
export async function GET(request) {
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = await processDailyOutreach();
  return Response.json({ ok: true, ...result });
}
