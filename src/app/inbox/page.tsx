import Link from 'next/link';
import type { Metadata } from 'next';
import { requireSession } from '@/lib/auth';
import { getBusinessTimeZone, listInbox } from '@/lib/services/views';
import { Badge, EmptyState, secondaryButtonClass, Shell } from '@/app/_components/ui';
import { Icon, type IconName } from '@/app/_components/icons';
import { PageHead, When } from '@/app/_ops/ops';

export const metadata: Metadata = { title: 'Inbox' };
export const dynamic = 'force-dynamic';

const KEYWORD_NOTE: Record<string, string> = {
  stop: 'Opt-out received. All messages to this customer are blocked.',
  start: 'START received. This does not re-subscribe the customer. Consent needs a new record.',
  help: 'HELP received. An automatic reply was sent.',
  other: 'A customer message. Reply by phone or email.',
};

/** Keyword replies get a label and a tone. STOP is the one that changes what the app sends. */
const KEYWORD_BADGE: Record<string, { label: string; tone: 'warn' | 'accent' | 'neutral'; icon: IconName }> = {
  stop: { label: 'STOP', tone: 'warn', icon: 'alert' },
  start: { label: 'START', tone: 'neutral', icon: 'info' },
  help: { label: 'HELP', tone: 'accent', icon: 'info' },
};

export default async function InboxPage() {
  const s = await requireSession();
  const [items, timeZone] = await Promise.all([listInbox(s.businessId), getBusinessTimeZone(s.businessId)]);

  return (
    <Shell>
      <PageHead title="Inbox" lead="Replies from customers, messages from your contact page, and keyword replies." />

      {items.length === 0 ? (
        <EmptyState
          level={2}
          icon="inbox"
          title="No messages yet"
          action={
            <Link href="/customers" className={secondaryButtonClass}>
              Go to customers
            </Link>
          }
        >
          <p>Customer replies, contact-page messages and keyword replies (STOP, HELP, START) appear here, newest first.</p>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-5">
          {items.map((item) => {
            const from = item.customerName;
            const kindLabel = item.kind === 'reply' ? 'Text reply' : `Message (${item.channel})`;
            const badge = item.kind === 'reply' && item.keyword ? KEYWORD_BADGE[item.keyword] : undefined;
            const note = item.kind === 'reply' && item.keyword ? KEYWORD_NOTE[item.keyword] : undefined;
            return (
              <li key={`${item.kind}-${item.id}`} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="mt-1 grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft font-semibold text-accent"
                >
                  {from ? from.charAt(0).toUpperCase() : <Icon name="message" />}
                </span>

                <article className="flex min-w-0 flex-1 flex-col gap-2">
                  <p className="text-meta text-ink-soft">
                    <span className="font-semibold text-ink">{from ?? kindLabel}</span>
                    {from ? ` · ${kindLabel}` : ''} · <When date={item.createdAt} timeZone={timeZone} />
                  </p>

                  <div className="max-w-[min(100%,34rem)] whitespace-pre-wrap break-words rounded-[1.125rem] rounded-tl-sm border border-line bg-sunken px-4 py-3 text-body text-ink shadow-rest">
                    {item.body || <span className="italic text-ink-muted">(message removed)</span>}
                  </div>

                  {note ? (
                    <div
                      className={`flex max-w-[min(100%,34rem)] flex-col items-start gap-2 rounded-[var(--radius-control)] border p-3 ${
                        badge?.tone === 'warn' ? 'border-warn bg-warn-soft' : 'border-line bg-surface'
                      }`}
                    >
                      {badge ? (
                        <Badge tone={badge.tone} icon={badge.icon}>
                          Keyword: {badge.label}
                        </Badge>
                      ) : null}
                      <p className="text-meta text-ink">{note}</p>
                    </div>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </Shell>
  );
}
