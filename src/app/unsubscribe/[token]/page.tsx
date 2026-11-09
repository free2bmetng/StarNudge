import { parseUnsubscribeToken } from '@/lib/unsubscribe';
import { buttonClass, PageTitle, Public } from '@/app/_components/ui';

export const dynamic = 'force-dynamic';

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
      <Public>
        <PageTitle>This link is not valid</PageTitle>
        <p className="text-base">Reply to the email you received, or contact the business directly.</p>
      </Public>
    );
  }
  if (done) {
    return (
      <Public>
        <PageTitle>You are unsubscribed</PageTitle>
        <p className="text-base">You will not receive more messages from this business on any channel.</p>
      </Public>
    );
  }
  return (
    <Public>
      <PageTitle>Stop messages from this business?</PageTitle>
      <p className="mb-4 text-base">This stops all messages from the business to you, by email and text.</p>
      <form method="post" action={`/api/unsubscribe?token=${encodeURIComponent(token)}&ui=1`}>
        <button type="submit" className={buttonClass}>Unsubscribe</button>
      </form>
    </Public>
  );
}
