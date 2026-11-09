import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { getCustomerDetail } from '@/lib/services/customers';
import { localParts } from '@/lib/time';
import { getBusinessTimeZone } from '@/lib/services/views';
import {
  addConsentAction,
  logReviewAction,
  recordVisitAction,
  requestDeletionAction,
  sendNowAction,
} from '@/app/actions/customers';
import {
  buttonClass,
  cardClass,
  dangerButtonClass,
  Flash,
  hintClass,
  inputClass,
  labelClass,
  param,
  PageTitle,
  Section,
  Shell,
} from '@/app/_components/ui';

export const dynamic = 'force-dynamic';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  deferred: 'Held',
  suppressed: 'Not sent',
  sending: 'Sending',
  sent: 'Sent',
  delivered: 'Delivered',
  failed: 'Failed',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const s = await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const c = await getCustomerDetail(s.businessId, id);
  if (!c) notFound();

  const tz = await getBusinessTimeZone(s.businessId);
  const now = localParts(new Date(), tz);
  const defaultWhen = `${now.year}-${pad(now.month)}-${pad(now.day)}T${pad(now.hour)}:${pad(now.minute)}`;
  const nonce = randomUUID();
  const hasSms = c.consents.some((k) => k.type === 'sms_pew' && !k.revoked_at);

  return (
    <Shell>
      <p className="mb-2 text-sm"><Link href="/customers" className="underline">Customers</Link> / {c.firstName} {c.lastName}</p>
      <PageTitle>{c.firstName} {c.lastName}</PageTitle>
      <Flash error={param(sp.error)} notice={param(sp.notice)} />

      {c.optOut ? (
        <p role="status" className="mb-4 rounded-md border border-stone-400 bg-stone-100 px-3 py-2 text-base text-stone-900">
          Opted out ({c.optOut.channel}). No messages will be sent to this customer on any channel.
        </p>
      ) : null}
      {c.deletionPending ? (
        <p className="mb-4 rounded-md border border-stone-400 bg-stone-100 px-3 py-2 text-base text-stone-900">
          Deletion pending. Personal data will be removed shortly.
        </p>
      ) : null}

      <Section title="Contact">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-base">
          <dt className="font-medium">Phone</dt>
          <dd>{c.phone || 'None'}</dd>
          <dt className="font-medium">Email</dt>
          <dd className="break-all">{c.email || 'None'}</dd>
          <dt className="font-medium">Language</dt>
          <dd>{c.language === 'es' ? 'Español' : 'English'}</dd>
        </dl>
        <p className="mt-4 text-base">
          <a href={`/api/customers/${c.id}/export`} className="underline">Download this customer’s data (JSON)</a>
        </p>
      </Section>

      <Section title="Send a review request now">
        <p className="mb-3 text-base text-stone-800">
          The same checks run as for an automated request: opt-outs, consent, the sender, the 90-day cap, and quiet hours.
        </p>
        <form action={sendNowAction}>
          <input type="hidden" name="customerId" value={c.id} />
          <input type="hidden" name="nonce" value={nonce} />
          <button type="submit" className={buttonClass}>Send request</button>
        </form>
      </Section>

      <Section title="Permission">
        {c.consents.length === 0 ? (
          <p className="mb-3 text-base text-stone-800">No permission on file. No texts or emails will be sent.</p>
        ) : (
          <ul className="mb-4 space-y-2 text-base">
            {c.consents.map((k) => (
              <li key={k.id} className={`${cardClass} p-3`}>
                <p className="font-medium">{k.type === 'sms_pew' ? 'Text messages' : k.type === 'email_opt_in' ? 'Email' : k.type}{k.revoked_at ? ' (revoked)' : ''}</p>
                <p className="text-sm text-stone-700">Source: {k.source}. Recorded {new Date(k.recorded_at).toLocaleDateString('en-US')}.</p>
              </li>
            ))}
          </ul>
        )}
        <form action={addConsentAction} className="space-y-3 border-t border-stone-200 pt-4">
          <input type="hidden" name="customerId" value={c.id} />
          <div>
            <label htmlFor="channel" className={labelClass}>Channel</label>
            <select id="channel" name="channel" className={inputClass} defaultValue="sms">
              <option value="sms">Text messages (written permission)</option>
              <option value="email">Email (opt-in)</option>
            </select>
          </div>
          <div>
            <label htmlFor="source" className={labelClass}>Where the customer gave permission</label>
            <input id="source" name="source" required maxLength={200} className={inputClass} placeholder="For example: signed intake form" />
          </div>
          <label className="flex items-start gap-3 text-base">
            <input type="checkbox" name="confirmed" required className="mt-1 h-5 w-5" />
            <span>I confirm the customer gave this permission.</span>
          </label>
          <button type="submit" className={buttonClass}>Record permission</button>
          {!hasSms ? <p className={hintClass}>Text messages need written permission and a US mobile number.</p> : null}
        </form>
      </Section>

      <Section title="Record a visit">
        <p className="mb-3 text-base text-stone-800">A visit in the last 7 days starts an automatic request after the delay in Settings.</p>
        <form action={recordVisitAction} className="space-y-3">
          <input type="hidden" name="customerId" value={c.id} />
          <div>
            <label htmlFor="serviceName" className={labelClass}>What they bought or booked</label>
            <input id="serviceName" name="serviceName" required maxLength={120} className={inputClass} />
          </div>
          <div>
            <label htmlFor="visitType" className={labelClass}>Type</label>
            <select id="visitType" name="visitType" className={inputClass} defaultValue="service">
              <option value="service">Service or booking</option>
              <option value="sale">Retail sale</option>
            </select>
          </div>
          <div>
            <label htmlFor="completedAt" className={labelClass}>When it was completed (business time zone)</label>
            <input id="completedAt" name="completedAt" type="datetime-local" required defaultValue={defaultWhen} className={inputClass} />
          </div>
          <button type="submit" className={buttonClass}>Record visit</button>
        </form>
      </Section>

      <Section title="Visits">
        {c.visits.length === 0 ? <p className="text-base">No visits yet.</p> : (
          <ul className="space-y-2 text-base">
            {c.visits.map((v) => (
              <li key={v.id}>{v.service_name} · {new Date(v.completed_at).toLocaleDateString('en-US')} · {v.source}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Review requests">
        {c.requests.length === 0 ? <p className="text-base">No requests yet.</p> : (
          <ul className="space-y-2 text-base">
            {c.requests.map((r) => (
              <li key={r.id} className={`${cardClass} p-3`}>
                <p className="font-medium">{STATUS_LABEL[r.status] ?? r.status}{r.channel ? ` by ${r.channel === 'sms' ? 'text' : 'email'}` : ''}</p>
                <p className="text-sm text-stone-700">
                  {r.source === 'manual' ? 'Sent by hand' : 'Automatic'} · created {new Date(r.created_at).toLocaleDateString('en-US')}
                  {r.status_reason ? ` · ${r.status_reason.replace(/_/g, ' ')}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Log a review from this customer">
        <form action={logReviewAction} className="space-y-3">
          <input type="hidden" name="customerId" value={c.id} />
          <input name="note" maxLength={200} className={inputClass} placeholder="Optional note" aria-label="Note" />
          <button type="submit" className={buttonClass}>Log owner-reported review</button>
        </form>
      </Section>

      <Section title="Delete this customer">
        <p className="mb-3 text-base text-stone-800">
          Pending requests stop right away. Personal details and message text are removed. A hashed record stays so a
          re-import cannot text them again, and consent evidence is kept as your records require.
        </p>
        <form action={requestDeletionAction} className="space-y-3">
          <input type="hidden" name="customerId" value={c.id} />
          <label className="flex items-start gap-3 text-base">
            <input type="checkbox" name="confirmed" required className="mt-1 h-5 w-5" />
            <span>I want to delete this customer’s personal data.</span>
          </label>
          <button type="submit" className={dangerButtonClass}>Delete customer data</button>
        </form>
      </Section>
    </Shell>
  );
}
