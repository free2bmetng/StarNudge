import { timingSafeEqual } from 'node:crypto';
import { cfg } from '@/lib/config';
import { tick } from '@/lib/services/pipeline';

export const dynamic = 'force-dynamic';

function authorized(header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Lets a scheduler (cron, Vercel Cron, or an external pinger) run one worker tick.
 * Requires Authorization: Bearer CRON_SECRET. The ?now= override works only in sandbox mode.
 */
export async function POST(req: Request): Promise<Response> {
  const config = cfg();
  if (!authorized(req.headers.get('authorization'), config.cronSecret)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  let at: Date | undefined;
  const nowParam = url.searchParams.get('now');
  if (nowParam && config.sandboxMode) {
    const parsed = new Date(nowParam);
    if (Number.isNaN(parsed.getTime())) return Response.json({ error: 'bad now' }, { status: 400 });
    at = parsed;
  }
  const result = await tick(at);
  return Response.json(result);
}
