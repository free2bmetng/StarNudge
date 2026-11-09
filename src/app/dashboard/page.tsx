import { requireSession } from '@/lib/auth';
import { getDashboard } from '@/lib/services/dashboard';
import { logReviewAction } from '@/app/actions/customers';
import { Button, Flash, inputClass, labelClass, param, PageTitle, Shell, StatTile } from '@/app/_components/ui';
import { NextStep, Panel, QuietStats, StatusList, type QuietRow, type StatusItem, type Tone } from '@/app/_dashboard/parts';

export const dynamic = 'force-dynamic';

const count = (n: number): string => n.toLocaleString('en-US');

/* Database values such as "not_started" read as a sentence: "Not started". */
const words = (s: string): string => {
  const plain = s.replace(/_/g, ' ');
  return plain.charAt(0).toUpperCase() + plain.slice(1);
};

function senderTone(status: string): Tone {
  if (status === 'approved') return 'good';
  if (status === 'submitted') return 'warn';
  if (status === 'rejected' || status === 'failed') return 'crit';
  return 'neutral';
}

function subscriptionTone(status: string): Tone {
  if (status === 'active') return 'good';
  if (status === 'canceled_at_period_end') return 'warn';
  if (status === 'past_due' || status === 'unpaid' || status === 'canceled') return 'crit';
  return 'neutral';
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const d = await getDashboard(s.businessId);

  const quiet: QuietRow[] = [
    { label: 'Failed', value: count(d.failed) },
    { label: 'Opted out', value: count(d.optedOut) },
    { label: 'Link clicks', value: count(d.clicks), hint: 'Scanners can inflate this' },
    { label: 'Owner-reported reviews', value: count(d.ownerReviews), hint: 'Google does not link reviews to requests' },
    { label: 'Customers', value: count(d.customers) },
  ];

  const status: StatusItem[] = [
    d.reviewLinkConfirmed
      ? { label: 'Review link', tone: 'good', text: 'Confirmed' }
      : { label: 'Review link', tone: 'warn', text: 'Not confirmed' },
    { label: 'Text sender', tone: senderTone(d.senderStatus), text: words(d.senderStatus) },
    { label: 'Subscription', tone: subscriptionTone(d.subscriptionStatus), text: words(d.subscriptionStatus) },
  ];

  return (
    <Shell>
      <PageTitle lead={`Last ${d.periodDays} days`}>Dashboard</PageTitle>
      <Flash error={param(sp.error)} notice={param(sp.notice)} />

      <div className="flex flex-col gap-6 sm:gap-8">
        <NextStep text={d.next.text} href={d.next.href} label={d.next.label} />

        <div className="flex flex-col gap-3 sm:gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            <div className="col-span-2 grid sm:col-span-1">
              <StatTile label="Requests sent" value={d.sent} />
            </div>
            <div className="grid">
              <StatTile
                label="Waiting to send"
                value={d.pending}
                hint="Not sent yet"
                tone={d.pending > 0 ? 'warn' : 'default'}
              />
            </div>
            <div className="grid">
              <StatTile
                label="Delivered"
                value={d.delivered === 'unknown' ? 'Unknown' : count(d.delivered)}
                hint={d.delivered === 'unknown' ? 'No delivery receipts yet' : undefined}
              />
            </div>
          </div>
          <QuietStats rows={quiet} />
        </div>

        <Panel id="dash-log-review" title="Log a review you received">
          <p className="m-0 mb-4 max-w-prose text-body text-ink-soft">
            Record reviews you see on Google. These are counted as owner-reported, because Google does not tell StarNudge
            which request a review came from.
          </p>
          <form action={logReviewAction} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div>
              <label htmlFor="note" className={labelClass}>
                Note (optional)
              </label>
              <input
                id="note"
                name="note"
                maxLength={200}
                className={inputClass}
                placeholder="For example: 5-star, Tuesday"
              />
            </div>
            <Button type="submit" variant="secondary" className="w-full sm:w-auto">
              Log review
            </Button>
          </form>
        </Panel>

        <Panel id="dash-status" title="Status">
          <StatusList items={status} />
        </Panel>
      </div>
    </Shell>
  );
}
