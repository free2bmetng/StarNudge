import { unsubscribeWithToken } from '@/lib/services/inbound';

export const dynamic = 'force-dynamic';

/**
 * Email unsubscribe. Handles the RFC 8058 one-click POST from mail clients (token in the query)
 * and the form on the unsubscribe page (ui=1, which redirects back to a confirmation).
 */
export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';
  const ok = await unsubscribeWithToken(token);
  if (url.searchParams.get('ui') === '1') {
    if (!ok) return new Response('This link is not valid.', { status: 400 });
    return Response.redirect(`${url.origin}/unsubscribe/${encodeURIComponent(token)}?done=1`, 303);
  }
  return new Response(ok ? 'Unsubscribed' : 'Invalid', { status: ok ? 200 : 400 });
}
