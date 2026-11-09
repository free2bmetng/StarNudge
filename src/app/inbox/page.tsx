import { requireSession } from '@/lib/auth';
import { listInbox } from '@/lib/services/views';
import { cardClass, PageTitle, Shell } from '@/app/_components/ui';

export const dynamic = 'force-dynamic';

const KEYWORD_NOTE: Record<string, string> = {
  stop: 'Opt-out received. All messages to this customer are blocked.',
  start: 'START received. This does not re-subscribe the customer. Consent needs a new record.',
  help: 'HELP received. An automatic reply was sent.',
  other: 'A customer message. Reply by phone or email.',
};

export default async function InboxPage() {
  const s = await requireSession();
  const items = await listInbox(s.businessId);

  return (
    <Shell>
      <PageTitle lead="Replies from customers, messages from your contact page, and keyword replies.">Inbox</PageTitle>
      {items.length === 0 ? (
        <p className={cardClass}>Nothing yet. Replies from customers will appear here.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}`} className={cardClass}>
              <p className="text-sm font-medium text-stone-700">
                {item.kind === 'reply' ? 'Text reply' : `Message (${item.channel})`}
                {item.customerName ? ` from ${item.customerName}` : ''} · {item.createdAt.toLocaleString('en-US')}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-base text-stone-900">{item.body || '(message removed)'}</p>
              {item.kind === 'reply' && item.keyword ? (
                <p className="mt-2 text-sm text-stone-700">{KEYWORD_NOTE[item.keyword] ?? ''}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
