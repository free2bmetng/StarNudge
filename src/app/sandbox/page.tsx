import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { cfg } from '@/lib/config';
import { getOnboardingState, listCustomerOptions } from '@/lib/services/views';
import { listSandboxMessages } from '@/lib/services/sandbox-service';
import {
  approveSenderAction,
  runDispatchAction,
  simulateEmailEventAction,
  simulateReceiptAction,
  simulateReplyAction,
  simulateUnsubscribeAction,
} from '@/app/actions/sandbox';
import { buttonClass, cardClass, Flash, inputClass, labelClass, param, PageTitle, Section, secondaryButtonClass, Shell } from '@/app/_components/ui';

export const dynamic = 'force-dynamic';

export default async function SandboxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!cfg().sandboxMode) notFound();
  const s = await requireSession();
  const sp = await searchParams;
  const onboarding = await getOnboardingState(s.businessId);
  const customers = await listCustomerOptions(s.businessId);
  const messages = await listSandboxMessages(s.businessId);

  return (
    <Shell>
      <PageTitle lead="Simulate what providers and customers do. Nothing here reaches a real person.">Sandbox</PageTitle>
      <Flash error={param(sp.error)} notice={param(sp.notice)} />

      <Section title="Text sender">
        <p className="mb-3 text-base">
          Status: <strong>{(onboarding.sender?.status ?? 'not_started').replace(/_/g, ' ')}</strong>
          {onboarding.sender?.sender_number ? ` · ${onboarding.sender.sender_number}` : ''}
        </p>
        {onboarding.sender?.status !== 'approved' ? (
          <form action={approveSenderAction}>
            <button type="submit" className={buttonClass}>Approve sender (sandbox)</button>
          </form>
        ) : null}
      </Section>

      <Section title="Customer replies">
        {customers.length === 0 ? (
          <p className="text-base">No customers yet.</p>
        ) : (
          <div className="space-y-4">
            {(['STOP', 'HELP', 'START', 'Can you come earlier?'] as const).map((body) => (
              <form key={body} action={simulateReplyAction} className="space-y-2 border-b border-stone-200 pb-4">
                <label htmlFor={`cust-${body}`} className={labelClass}>Customer</label>
                <select id={`cust-${body}`} name="customerId" className={inputClass} required>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <input type="hidden" name="body" value={body} />
                <button type="submit" className={secondaryButtonClass}>Send reply: “{body}”</button>
              </form>
            ))}
            <p className="text-sm text-stone-700">Email unsubscribe for a customer:</p>
            <form action={simulateUnsubscribeAction} className="space-y-2">
              <select name="customerId" className={inputClass} required aria-label="Customer to unsubscribe">
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button type="submit" className={secondaryButtonClass}>Simulate unsubscribe link</button>
            </form>
          </div>
        )}
      </Section>

      <Section title="Outbox">
        <p className="mb-3 text-sm text-stone-700">The last 100 messages the app attempted, including owner notices and auto-replies.</p>
        {messages.length === 0 ? (
          <p className="text-base">Nothing sent yet.</p>
        ) : (
          <ul className="space-y-3">
            {messages.map((m) => (
              <li key={m.id} className={`${cardClass} p-3`}>
                <p className="text-sm font-medium text-stone-700">
                  {m.kind.replace(/_/g, ' ')} · {m.channel} · {m.status} · {m.createdAt.toLocaleString('en-US')}
                </p>
                <p className="mt-1 break-all font-mono text-sm">{m.to}</p>
                {m.subject ? <p className="mt-1 text-base font-medium">{m.subject}</p> : null}
                <p className="mt-1 whitespace-pre-wrap text-base">{m.body}</p>
                {m.errorCode ? <p className="mt-1 text-sm text-red-900">Error: {m.errorCode}</p> : null}
                {m.providerMessageId && m.channel === 'sms' ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <form action={simulateReceiptAction}>
                      <input type="hidden" name="providerMessageId" value={m.providerMessageId} />
                      <input type="hidden" name="status" value="delivered" />
                      <button type="submit" className={secondaryButtonClass}>Mark delivered</button>
                    </form>
                    <form action={simulateReceiptAction}>
                      <input type="hidden" name="providerMessageId" value={m.providerMessageId} />
                      <input type="hidden" name="status" value="undelivered" />
                      <button type="submit" className={secondaryButtonClass}>Mark undelivered</button>
                    </form>
                  </div>
                ) : null}
                {m.providerMessageId && m.channel === 'email' ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(['delivered', 'bounced', 'complained'] as const).map((type) => (
                      <form key={type} action={simulateEmailEventAction}>
                        <input type="hidden" name="providerMessageId" value={m.providerMessageId ?? ''} />
                        <input type="hidden" name="type" value={type} />
                        <button type="submit" className={secondaryButtonClass}>Email {type}</button>
                      </form>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Worker">
        <form action={runDispatchAction}>
          <button type="submit" className={buttonClass}>Run the worker now</button>
        </form>
      </Section>
    </Shell>
  );
}
