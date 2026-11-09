import { cfg } from '@/lib/config';
import { verifySandboxSignature, verifySvixSignature } from '@/lib/webhook-verify';
import { handleEmailEvent } from '@/lib/services/inbound';

export const dynamic = 'force-dynamic';

type EmailType = 'delivered' | 'bounced' | 'complained';

const LIVE_TYPES: Record<string, EmailType> = {
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
};

/**
 * Email provider webhook. Deliveries, bounces, and spam complaints.
 * Sandbox: JSON with X-StarNudge-Signature. Live: Svix-signed events from Resend.
 */
export async function POST(req: Request): Promise<Response> {
  const config = cfg();
  const raw = await req.text();

  if (config.sandboxMode) {
    if (!verifySandboxSignature(raw, req.headers.get('x-starnudge-signature'), config.sandboxWebhookSecret)) {
      return Response.json({ error: 'invalid signature' }, { status: 401 });
    }
    const payload = JSON.parse(raw) as { type?: string; providerMessageId?: string };
    if (!payload.providerMessageId || !['delivered', 'bounced', 'complained'].includes(payload.type ?? '')) {
      return Response.json({ error: 'unknown event' }, { status: 400 });
    }
    return Response.json({ result: await handleEmailEvent({ providerMessageId: payload.providerMessageId, type: payload.type as EmailType }) });
  }

  const valid = verifySvixSignature(
    raw,
    {
      id: req.headers.get('svix-id'),
      timestamp: req.headers.get('svix-timestamp'),
      signature: req.headers.get('svix-signature'),
    },
    config.resend.webhookSecret,
  );
  if (!valid) return new Response('forbidden', { status: 403 });
  const event = JSON.parse(raw) as { type?: string; data?: { email_id?: string } };
  const type = event.type ? LIVE_TYPES[event.type] : undefined;
  if (!type || !event.data?.email_id) return Response.json({ ignored: true });
  return Response.json({ result: await handleEmailEvent({ providerMessageId: event.data.email_id, type }) });
}
