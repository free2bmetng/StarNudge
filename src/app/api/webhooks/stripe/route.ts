import { cfg } from '@/lib/config';
import { verifyStripeSignature } from '@/lib/webhook-verify';
import { handleStripeEvent } from '@/lib/services/billing';

export const dynamic = 'force-dynamic';

/** Stripe billing webhook. Sandbox has no Stripe, so the endpoint answers 404 there. */
export async function POST(req: Request): Promise<Response> {
  const config = cfg();
  if (config.sandboxMode || !config.stripe.webhookSecret) return new Response('Not found', { status: 404 });
  const raw = await req.text();
  if (!verifyStripeSignature(raw, req.headers.get('stripe-signature'), config.stripe.webhookSecret)) {
    return new Response('forbidden', { status: 403 });
  }
  const event = JSON.parse(raw) as { id: string; type: string; data: { object: Record<string, unknown> } };
  return Response.json({ result: await handleStripeEvent(event) });
}
