'use server';

import { cfg } from '@/lib/config';
import { requireSession } from '@/lib/auth';
import { unsubscribeWithToken } from '@/lib/services/inbound';
import { makeUnsubscribeToken } from '@/lib/unsubscribe';
import {
  approveSender,
  runDispatchNow,
  simulateEmailEvent,
  simulateReceipt,
  simulateReply,
} from '@/lib/services/sandbox-service';
import { back, text } from './_form';

/** Every action here refuses to run outside sandbox mode. */
function requireSandbox(): void {
  if (!cfg().sandboxMode) throw new Error('Sandbox actions are only available in sandbox mode.');
}

export async function approveSenderAction(): Promise<void> {
  requireSandbox();
  const s = await requireSession();
  const result = await approveSender(s.businessId, s.userId);
  if (!result.ok) back('/sandbox', result.error);
  back('/sandbox', 'Sandbox sender approved.', 'notice');
}

export async function simulateReplyAction(form: FormData): Promise<void> {
  requireSandbox();
  const s = await requireSession();
  const result = await simulateReply(s.businessId, text(form, 'customerId'), text(form, 'body'));
  if (!result.ok) back('/sandbox', result.error);
  back('/sandbox', 'Reply delivered to the app as if a customer sent it.', 'notice');
}

export async function simulateReceiptAction(form: FormData): Promise<void> {
  requireSandbox();
  const s = await requireSession();
  const status = text(form, 'status') === 'undelivered' ? 'undelivered' : 'delivered';
  const result = await simulateReceipt(s.businessId, text(form, 'providerMessageId'), status);
  if (!result.ok) back('/sandbox', result.error);
  back('/sandbox', `Receipt simulated: ${status}.`, 'notice');
}

export async function simulateEmailEventAction(form: FormData): Promise<void> {
  requireSandbox();
  await requireSession();
  const type = text(form, 'type');
  const kind = type === 'bounced' || type === 'complained' ? type : 'delivered';
  const result = await simulateEmailEvent(text(form, 'providerMessageId'), kind);
  if (!result.ok) back('/sandbox', result.error);
  back('/sandbox', `Email event simulated: ${kind}.`, 'notice');
}

export async function simulateUnsubscribeAction(form: FormData): Promise<void> {
  requireSandbox();
  const s = await requireSession();
  const ok = await unsubscribeWithToken(makeUnsubscribeToken(s.businessId, text(form, 'customerId')));
  if (!ok) back('/sandbox', 'Customer not found.');
  back('/sandbox', 'Customer unsubscribed by email. All messages to them are now blocked.', 'notice');
}

export async function runDispatchAction(): Promise<void> {
  requireSandbox();
  await requireSession();
  const result = await runDispatchNow();
  back('/sandbox', `Worker ran: ${result.processed} request(s) processed.`, 'notice');
}
