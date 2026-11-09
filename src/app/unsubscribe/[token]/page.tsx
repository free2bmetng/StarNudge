import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { parseUnsubscribeToken } from '@/lib/unsubscribe';
import { Icon, type IconName } from '@/app/_components/icons';
import { Button, Card, PageTitle } from '@/app/_components/ui';
import { PublicFrame } from '@/app/_public/PublicFrame';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Unsubscribe',
};

/** A result card: a status icon beside the words, so the outcome never relies on colour alone. */
function Outcome({ tone, icon, children }: { tone: 'good' | 'crit'; icon: IconName; children: ReactNode }) {
  const toneClass = tone === 'good' ? 'bg-good-soft text-good' : 'bg-crit-soft text-crit';
  return (
    <div className="flex items-start gap-4">
      <span aria-hidden="true" className={`grid h-11 w-11 shrink-0 place-items-center rounded-pill ${toneClass}`}>
        <Icon name={icon} className="text-title" />
      </span>
      <div className="min-w-0 text-body text-ink">{children}</div>
    </div>
  );
}

export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const valid = parseUnsubscribeToken(token) !== null;
  const done = sp.done === '1';

  if (!valid) {
    return (
      <PublicFrame>
        <PageTitle>This link is not valid</PageTitle>
        <Card>
          <Outcome tone="crit" icon="alert">
            Reply to the email you received, or contact the business directly.
          </Outcome>
        </Card>
      </PublicFrame>
    );
  }
  if (done) {
    return (
      <PublicFrame>
        <PageTitle>You are unsubscribed</PageTitle>
        <Card>
          <Outcome tone="good" icon="check">
            You will not receive more messages from this business on any channel.
          </Outcome>
        </Card>
      </PublicFrame>
    );
  }
  return (
    <PublicFrame>
      <PageTitle>Stop messages from this business?</PageTitle>
      <Card>
        <p className="m-0 text-body text-ink">This stops all messages from the business to you, by email and text.</p>
        <form method="post" action={`/api/unsubscribe?token=${encodeURIComponent(token)}&ui=1`} className="mt-6">
          <Button type="submit" className="w-full">Unsubscribe</Button>
        </form>
      </Card>
    </PublicFrame>
  );
}
