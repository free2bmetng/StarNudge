import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { getDashboard } from '@/lib/services/dashboard';
import { logReviewAction } from '@/app/actions/customers';
import { buttonClass, cardClass, Flash, inputClass, labelClass, param, PageTitle, Section, Shell } from '@/app/_components/ui';

export const dynamic = 'force-dynamic';

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className={cardClass}>
      <p className="text-sm font-medium text-stone-700">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-stone-900">{value}</p>
      {hint ? <p className="mt-1 text-sm text-stone-600">{hint}</p> : null}
    </div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const d = await getDashboard(s.businessId);

  return (
    <Shell>
      <PageTitle lead={`Last ${d.periodDays} days`}>Dashboard</PageTitle>
      <Flash error={param(sp.error)} notice={param(sp.notice)} />

      <div className={`${cardClass} mb-4 border-amber-300 bg-amber-50`}>
        <p className="text-sm font-semibold uppercase tracking-wide text-amber-900">Next step</p>
        <p className="mt-1 text-base text-stone-900">{d.next.text}</p>
        <Link href={d.next.href} className="mt-3 inline-block font-medium underline">{d.next.label}</Link>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat label="Requests sent" value={d.sent} />
        <Stat
          label="Delivered"
          value={d.delivered === 'unknown' ? 'Unknown' : d.delivered}
          hint={d.delivered === 'unknown' ? 'No delivery receipts yet' : undefined}
        />
        <Stat label="Failed" value={d.failed} />
        <Stat label="Opted out" value={d.optedOut} />
        <Stat label="Link clicks" value={d.clicks} hint="Scanners can inflate this" />
        <Stat label="Owner-reported reviews" value={d.ownerReviews} hint="Google does not link reviews to requests" />
        <Stat label="Waiting to send" value={d.pending} />
        <Stat label="Customers" value={d.customers} />
      </div>

      <Section title="Log a review you received">
        <p className="mb-3 text-base text-stone-800">
          Record reviews you see on Google. These are counted as owner-reported, because Google does not tell
          StarNudge which request a review came from.
        </p>
        <form action={logReviewAction} className="space-y-3">
          <div>
            <label htmlFor="note" className={labelClass}>Note (optional)</label>
            <input id="note" name="note" maxLength={200} className={inputClass} placeholder="For example: 5-star review, Tuesday" />
          </div>
          <button type="submit" className={buttonClass}>Log review</button>
        </form>
      </Section>

      <Section title="Status">
        <ul className="space-y-1 text-base text-stone-800">
          <li>Review link: {d.reviewLinkConfirmed ? 'confirmed' : 'not confirmed'}</li>
          <li>Text sender: {d.senderStatus.replace(/_/g, ' ')}</li>
          <li>Subscription: {d.subscriptionStatus.replace(/_/g, ' ')}</li>
        </ul>
      </Section>
    </Shell>
  );
}
