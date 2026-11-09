import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { cfg } from '@/lib/config';
import { getBusinessTimeZone, getOnboardingState, listCustomerOptions } from '@/lib/services/views';
import { listSandboxMessages } from '@/lib/services/sandbox-service';
import {
  approveSenderAction,
  runDispatchAction,
  simulateEmailEventAction,
  simulateReceiptAction,
  simulateReplyAction,
  simulateUnsubscribeAction,
} from '@/app/actions/sandbox';
import { Badge, buttonClass, EmptyState, Flash, inputClass, labelClass, param, secondaryButtonClass, Shell } from '@/app/_components/ui';
import { Icon, type IconName } from '@/app/_components/icons';
import { PageHead, Panel, When } from '@/app/_ops/ops';

export const metadata: Metadata = { title: 'Sandbox console' };
export const dynamic = 'force-dynamic';

/* The four customer replies the console can send. Each one takes the same path as a provider webhook. */
const REPLIES = [
  { body: 'STOP', effect: 'Opt-out. Blocks every later request to this customer.' },
  { body: 'HELP', effect: 'Sends the automatic help reply.' },
  { body: 'START', effect: 'Does not re-subscribe. Consent needs a new record.' },
  { body: 'Can you come earlier?', effect: 'A customer message. It goes to the inbox.' },
] as const;

const OUTCOME_ICON: Record<string, IconName> = {
  delivered: 'check',
  accepted: 'clock',
  sent: 'send',
  queued: 'clock',
  undelivered: 'xcircle',
  failed: 'xcircle',
  bounced: 'xcircle',
  complained: 'alert',
};

type Tone = 'neutral' | 'good' | 'warn' | 'crit';

function senderTone(status: string): { tone: Tone; icon: IconName | null } {
  if (status === 'approved') return { tone: 'good', icon: 'check' };
  if (status === 'submitted' || status === 'pending') return { tone: 'warn', icon: 'clock' };
  if (status === 'rejected' || status === 'failed') return { tone: 'crit', icon: 'xcircle' };
  return { tone: 'neutral', icon: null };
}

export default async function SandboxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!cfg().sandboxMode) notFound();
  const s = await requireSession();
  const sp = await searchParams;
  const onboarding = await getOnboardingState(s.businessId);
  const customers = await listCustomerOptions(s.businessId);
  const messages = await listSandboxMessages(s.businessId);
  const timeZone = await getBusinessTimeZone(s.businessId);

  const rawStatus = onboarding.sender?.status ?? 'not_started';
  const statusText = rawStatus.replace(/_/g, ' ');
  const tone = senderTone(rawStatus);

  return (
    <Shell>
      <PageHead
        title="Sandbox console"
        lead="Simulate what providers and customers do. Nothing here reaches a real person."
      >
        <Badge tone="warn" icon="sandbox">
          Developer tool
        </Badge>
      </PageHead>
      <Flash error={param(sp.error)} notice={param(sp.notice)} />

      <div className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-sunken p-3 sm:p-4">
        <p className="px-1 font-mono text-meta uppercase tracking-wide text-ink-soft">Console · simulated providers</p>

        <Panel id="s-sender" index="01" title="Text sender" lead="Stands in for the messaging provider’s approval.">
          <dl className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
            <dt className="text-meta text-ink-soft">Status</dt>
            <dd>
              <Badge tone={tone.tone} icon={tone.icon}>
                {statusText}
              </Badge>
            </dd>
            {onboarding.sender?.sender_number ? (
              <>
                <dt className="text-meta text-ink-soft">Number</dt>
                <dd className="break-all font-mono text-meta text-ink">{onboarding.sender.sender_number}</dd>
              </>
            ) : null}
          </dl>
          {onboarding.sender?.status !== 'approved' ? (
            <form action={approveSenderAction} className="mt-5">
              <button type="submit" className={buttonClass}>
                Approve sender (sandbox)
              </button>
            </form>
          ) : null}
        </Panel>

        <Panel
          id="s-replies"
          index="02"
          title="Customer replies"
          lead="Each reply is sent from the chosen customer, through the same path as a provider webhook, without the signature check."
        >
          {customers.length === 0 ? (
            <EmptyState
              level={3}
              icon="customers"
              title="No customers yet"
              action={
                <Link href="/customers" className={secondaryButtonClass}>
                  Go to customers
                </Link>
              }
            >
              <p>Add a customer with written text consent, then simulate replies from here.</p>
            </EmptyState>
          ) : (
            <>
              <ul className="flex flex-col divide-y divide-line">
                {REPLIES.map(({ body, effect }, index) => (
                  <li key={body} className="py-4 first:pt-0 last:pb-0">
                    <form
                      action={simulateReplyAction}
                      className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto] md:items-end"
                    >
                      <div>
                        <p className="font-mono text-body font-semibold text-ink break-words">{body}</p>
                        <p className="text-meta text-ink-soft">{effect}</p>
                      </div>
                      <div>
                        <label htmlFor={`reply-customer-${index}`} className={labelClass}>
                          Customer
                        </label>
                        <select id={`reply-customer-${index}`} name="customerId" className={inputClass} required>
                          {customers.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <input type="hidden" name="body" value={body} />
                      <button type="submit" className={`${secondaryButtonClass} w-full md:w-auto`}>
                        Send reply: “{body}”
                      </button>
                    </form>
                  </li>
                ))}
              </ul>

              <div className="mt-6 border-t border-line pt-5">
                <h3 className="text-body font-semibold text-ink">Email unsubscribe</h3>
                <p className="mt-1 text-meta text-ink-soft">Runs the unsubscribe link from a review request email for one customer.</p>
                <form action={simulateUnsubscribeAction} className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[minmax(0,14rem)_auto] md:items-end">
                  <div>
                    <label htmlFor="unsubscribe-customer" className={labelClass}>
                      Customer to unsubscribe
                    </label>
                    <select id="unsubscribe-customer" name="customerId" className={inputClass} required>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button type="submit" className={`${secondaryButtonClass} w-full md:w-auto`}>
                    Simulate unsubscribe link
                  </button>
                </form>
              </div>
            </>
          )}
        </Panel>

        <Panel
          id="s-outbox"
          index="03"
          title="Outbox"
          lead="The last 100 messages the app attempted, including owner notices and auto-replies."
        >
          {messages.length === 0 ? (
            <EmptyState level={3} icon="send" title="Nothing sent yet">
              <p>Messages appear here once a review request, owner notice or auto-reply is attempted.</p>
            </EmptyState>
          ) : (
            <ul className="flex flex-col gap-3">
              {messages.map((m) => (
                <li key={m.id} className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-line bg-canvas p-3 sm:p-4">
                  <p className="flex items-center gap-2 font-mono text-meta text-ink-soft">
                    <Icon name={OUTCOME_ICON[m.status] ?? 'info'} className="text-ink" />
                    <span className="min-w-0 break-words">
                      {m.kind.replace(/_/g, ' ')} · {m.channel} · {m.status} · <When date={m.createdAt} timeZone={timeZone} />
                    </span>
                  </p>
                  <p className="break-all font-mono text-meta text-ink">{m.to}</p>
                  {m.subject ? <p className="font-semibold text-ink">{m.subject}</p> : null}
                  <p className="whitespace-pre-wrap break-words text-body text-ink-soft">{m.body}</p>
                  {m.errorCode ? (
                    <p className="flex items-center gap-2 text-meta font-semibold text-crit">
                      <Icon name="alert" />
                      <span>Error: {m.errorCode}</span>
                    </p>
                  ) : null}
                  {m.providerMessageId && m.channel === 'sms' ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <form action={simulateReceiptAction}>
                        <input type="hidden" name="providerMessageId" value={m.providerMessageId} />
                        <input type="hidden" name="status" value="delivered" />
                        <button type="submit" className={secondaryButtonClass}>
                          Mark delivered
                        </button>
                      </form>
                      <form action={simulateReceiptAction}>
                        <input type="hidden" name="providerMessageId" value={m.providerMessageId} />
                        <input type="hidden" name="status" value="undelivered" />
                        <button type="submit" className={secondaryButtonClass}>
                          Mark undelivered
                        </button>
                      </form>
                    </div>
                  ) : null}
                  {m.providerMessageId && m.channel === 'email' ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {(['delivered', 'bounced', 'complained'] as const).map((type) => (
                        <form key={type} action={simulateEmailEventAction}>
                          <input type="hidden" name="providerMessageId" value={m.providerMessageId ?? ''} />
                          <input type="hidden" name="type" value={type} />
                          <button type="submit" className={secondaryButtonClass}>
                            Email {type}
                          </button>
                        </form>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel id="s-worker" index="04" title="Worker" lead="Processes due messages now, with the same checks as automation.">
          <form action={runDispatchAction}>
            <button type="submit" className={secondaryButtonClass}>
              Run the worker now
            </button>
          </form>
        </Panel>
      </div>
    </Shell>
  );
}
