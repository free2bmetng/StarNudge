import { cfg } from '@/lib/config';
import { verifySandboxSignature, verifyTwilioSignature } from '@/lib/webhook-verify';
import { handleInboundSms, handleSmsStatus } from '@/lib/services/inbound';

export const dynamic = 'force-dynamic';

type StatusValue = 'delivered' | 'undelivered' | 'failed';

/**
 * SMS provider webhook. Inbound replies and delivery receipts.
 * Sandbox: JSON signed with X-StarNudge-Signature. Live: Twilio form posts signed with X-Twilio-Signature.
 */
export async function POST(req: Request): Promise<Response> {
  const config = cfg();
  const raw = await req.text();

  if (config.sandboxMode) {
    if (!verifySandboxSignature(raw, req.headers.get('x-starnudge-signature'), config.sandboxWebhookSecret)) {
      return Response.json({ error: 'invalid signature' }, { status: 401 });
    }
    let payload: Record<string, string | undefined>;
    try {
      payload = JSON.parse(raw) as Record<string, string | undefined>;
    } catch {
      return Response.json({ error: 'bad json' }, { status: 400 });
    }
    if (payload.type === 'inbound' && payload.providerMessageId && payload.from && payload.to) {
      const result = await handleInboundSms({
        providerMessageId: payload.providerMessageId,
        from: payload.from,
        to: payload.to,
        body: payload.body ?? '',
      });
      return Response.json(result);
    }
    if (payload.type === 'status' && payload.providerMessageId && payload.status) {
      const status = payload.status as StatusValue;
      if (!['delivered', 'undelivered', 'failed'].includes(status)) return Response.json({ ignored: true });
      return Response.json({ result: await handleSmsStatus({ providerMessageId: payload.providerMessageId, status, errorCode: payload.errorCode }) });
    }
    return Response.json({ error: 'unknown event' }, { status: 400 });
  }

  const params = Object.fromEntries(new URLSearchParams(raw));
  const url = `${config.appBaseUrl}/api/webhooks/sms`;
  if (!verifyTwilioSignature(url, params, req.headers.get('x-twilio-signature'), config.twilio.authToken)) {
    return new Response('forbidden', { status: 403 });
  }
  if (params.Body !== undefined && params.From && params.To && params.MessageSid) {
    const result = await handleInboundSms({ providerMessageId: params.MessageSid, from: params.From, to: params.To, body: params.Body });
    return Response.json(result);
  }
  const status = params.MessageStatus as StatusValue | undefined;
  if (params.MessageSid && status && ['delivered', 'undelivered', 'failed'].includes(status)) {
    return Response.json({ result: await handleSmsStatus({ providerMessageId: params.MessageSid, status, errorCode: params.ErrorCode }) });
  }
  return Response.json({ ignored: true });
}
