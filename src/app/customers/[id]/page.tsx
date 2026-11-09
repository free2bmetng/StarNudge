import type { ReactNode } from 'react';
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
import { Icon } from '@/app/_components/icons';
import {
  Badge,
  buttonClass,
  dangerButtonClass,
  Flash,
  hintClass,
  inputClass,
  labelClass,
  param,
  quietButtonClass,
  secondaryButtonClass,
  Shell,
} from '@/app/_components/ui';
import { Crumbs, Divided, EmptyNote, Initials, Panel } from '@/app/_customers/parts';
import {
  CONSENT_TYPE_LABEL,
  formatDay,
  isoTime,
  requestStatus,
  VISIT_SOURCE_LABEL,
  VISIT_TYPE_LABEL,
} from '@/app/_customers/format';

export const dynamic = 'force-dynamic';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** One label and value in the contact list. Stacks on phones, two columns from 640px up. */
function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-ink-soft">{term}</dt>
      <dd className="m-0 min-w-0 font-medium tabular-nums">{children}</dd>
    </div>
  );
}

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
  const hasEmail = c.consents.some((k) => k.type === 'email_opt_in' && !k.revoked_at);

  return (
    <Shell>
      <Crumbs current={`${c.firstName} ${c.lastName}`} />
      <header className="sn-page-head flex items-center gap-4 sm:gap-6">
        <Initials first={c.firstName} last={c.lastName} size="lg" />
        <div className="min-w-0">
          <h1 className="sn-page-title">
            {c.firstName} {c.lastName}
          </h1>
          <div className="mt-3 flex flex-wrap gap-2">
            {c.optOut ? (
              <Badge tone="crit" icon="xcircle">
                Opted out
              </Badge>
            ) : (
              <Badge tone="neutral" icon="check">
                Not opted out
              </Badge>
            )}
            {hasSms ? (
              <Badge tone="good" icon="check">
                Text consent on file
              </Badge>
            ) : (
              <Badge tone="neutral" icon={null}>
                No text consent
              </Badge>
            )}
            {hasEmail ? (
              <Badge tone="good" icon="check">
                Email opt-in on file
              </Badge>
            ) : null}
          </div>
        </div>
      </header>

      <Flash error={param(sp.error)} notice={param(sp.notice)} />

      {c.optOut ? (
        <p role="status" className="mb-6 flex items-start gap-3 rounded-control border border-crit bg-crit-soft p-4 text-body text-ink">
          <Icon name="xcircle" className="mt-0.5 text-crit" />
          <span>Opted out ({c.optOut.channel}). No messages will be sent to this customer on any channel.</span>
        </p>
      ) : null}
      {c.deletionPending ? (
        <p className="mb-6 flex items-start gap-3 rounded-control border border-warn bg-warn-soft p-4 text-body text-ink">
          <Icon name="clock" className="mt-0.5 text-warn" />
          <span>Deletion pending. Personal data will be removed shortly.</span>
        </p>
      ) : null}

      <div className="grid gap-6">
        <Panel id="contact" title="Contact" icon="mail">
          <dl className="grid gap-4">
            <Row term="Phone">{c.phone || 'None'}</Row>
            <Row term="Email">
              <span className="break-all">{c.email || 'None'}</span>
            </Row>
            <Row term="Language">{c.language === 'es' ? 'Español' : 'English'}</Row>
          </dl>
          <p className="mt-6">
            <a href={`/api/customers/${c.id}/export`} className={`${quietButtonClass} -ml-3`}>
              Download this customer’s data (JSON)
            </a>
          </p>
        </Panel>

        <Panel
          id="send-request"
          tone="primary"
          icon="send"
          title="Send a review request now"
          lead="The same checks run as for an automated request: opt-outs, consent, the sender, the 90-day cap, and quiet hours."
        >
          <form action={sendNowAction}>
            <input type="hidden" name="customerId" value={c.id} />
            <input type="hidden" name="nonce" value={nonce} />
            <button type="submit" className={`${buttonClass} w-full sm:w-auto`}>
              <Icon name="send" />
              Send request
            </button>
          </form>
        </Panel>

        <Panel id="permission" title="Permission" icon="shield">
          {c.consents.length === 0 ? (
            <EmptyNote icon="shield" title="No permission on file">
              <p>No texts or emails will be sent.</p>
            </EmptyNote>
          ) : (
            <ul className="grid gap-3">
              {c.consents.map((k) => (
                <li
                  key={k.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-control border border-line bg-sunken p-4"
                >
                  <div className="grid min-w-0 gap-1">
                    <p className="font-semibold">{CONSENT_TYPE_LABEL[k.type] ?? k.type}</p>
                    <p className="text-meta text-ink-soft">
                      Source: {k.source}. Recorded {formatDay(k.recorded_at)}.
                      {k.revoked_at ? ` Revoked ${formatDay(k.revoked_at)}.` : ''}
                    </p>
                  </div>
                  {k.revoked_at ? (
                    <Badge tone="crit" icon="xcircle">
                      Revoked
                    </Badge>
                  ) : (
                    <Badge tone="good" icon="check">
                      On file
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}

          <Divided title="Record new permission" lead="Record it only when the customer has given it, and write down where.">
            <form action={addConsentAction} className="grid gap-4">
              <input type="hidden" name="customerId" value={c.id} />
              <div className="grid gap-4 sm:grid-cols-2">
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
              </div>
              <label className="flex items-start gap-3 text-body">
                <input type="checkbox" name="confirmed" required className="mt-0.5" />
                <span>I confirm the customer gave this permission.</span>
              </label>
              <div>
                <button type="submit" className={`${secondaryButtonClass} w-full sm:w-auto`}>
                  Record permission
                </button>
                {!hasSms ? <p className={hintClass}>Text messages need written permission and a US mobile number.</p> : null}
              </div>
            </form>
          </Divided>
        </Panel>

        <Panel id="visits" title="Visits" icon="clock">
          {c.visits.length === 0 ? (
            <EmptyNote icon="clock" title="No visits yet">
              <p>Visits appear here once recorded. Record one below to log what they bought or booked.</p>
            </EmptyNote>
          ) : (
            <ul className="divide-y divide-line">
              {c.visits.map((v) => (
                <li
                  key={v.id}
                  className="grid gap-2 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4"
                >
                  <div className="grid min-w-0 gap-1">
                    <p className="font-semibold">{v.service_name}</p>
                    <p className="text-meta text-ink-soft">
                      <time dateTime={isoTime(v.completed_at)}>{formatDay(v.completed_at)}</time>
                      {' · '}
                      {VISIT_SOURCE_LABEL[v.source] ?? v.source}
                    </p>
                  </div>
                  <div>
                    <Badge tone={v.visit_type === 'sale' ? 'accent' : 'neutral'}>
                      {VISIT_TYPE_LABEL[v.visit_type] ?? v.visit_type}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Divided
            id="record-visit"
            title="Record a visit"
            lead="A visit in the last 7 days starts an automatic request after the delay in Settings."
          >
            <form action={recordVisitAction} className="grid gap-4">
              <input type="hidden" name="customerId" value={c.id} />
              <div>
                <label htmlFor="serviceName" className={labelClass}>What they bought or booked</label>
                <input id="serviceName" name="serviceName" required maxLength={120} className={inputClass} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="visitType" className={labelClass}>Type</label>
                  <select id="visitType" name="visitType" className={inputClass} defaultValue="service">
                    <option value="service">Service or booking</option>
                    <option value="sale">Retail sale</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="completedAt" className={labelClass}>When it was completed (business time zone)</label>
                  <input
                    id="completedAt"
                    name="completedAt"
                    type="datetime-local"
                    required
                    defaultValue={defaultWhen}
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <button type="submit" className={`${secondaryButtonClass} w-full sm:w-auto`}>
                  Record visit
                </button>
              </div>
            </form>
          </Divided>
        </Panel>

        <Panel id="requests" title="Review requests" icon="message">
          {c.requests.length === 0 ? (
            <EmptyNote icon="message" title="No requests yet">
              <p>Requests appear here once one is sent. Use Send request above, or record a recent visit to start an automatic one.</p>
            </EmptyNote>
          ) : (
            <ul className="grid gap-3">
              {c.requests.map((r) => {
                const status = requestStatus(r.status);
                const channel = r.channel ? ` by ${r.channel === 'sms' ? 'text' : 'email'}` : '';
                return (
                  <li key={r.id} className="grid gap-2 rounded-control border border-line bg-sunken p-4">
                    <div>
                      <Badge tone={status.tone} icon={status.icon}>
                        {status.label}
                        {channel}
                      </Badge>
                    </div>
                    <p className="text-meta text-ink-soft">
                      {r.source === 'manual' ? 'Sent by hand' : 'Automatic'} · created {formatDay(r.created_at)}
                      {r.status_reason ? ` · ${r.status_reason.replace(/_/g, ' ')}` : ''}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel
          id="owner-review"
          title="Log a review from this customer"
          icon="star"
          lead="Use this when the customer tells you they left a review. It is logged as owner-reported."
        >
          <form action={logReviewAction} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <input type="hidden" name="customerId" value={c.id} />
            <div>
              <label htmlFor="note" className={labelClass}>Note</label>
              <input id="note" name="note" maxLength={200} className={inputClass} placeholder="Optional note" />
            </div>
            <div>
              <button type="submit" className={`${secondaryButtonClass} w-full sm:w-auto`}>
                Log owner-reported review
              </button>
            </div>
          </form>
        </Panel>

        <Panel id="delete" tone="danger" icon="alert" eyebrow="Danger zone" title="Delete this customer">
          <form action={requestDeletionAction} className="grid gap-4">
            <input type="hidden" name="customerId" value={c.id} />
            <p className="max-w-[65ch] text-body text-ink-soft">
              Pending requests stop right away. Personal details and message text are removed. A hashed record stays so a
              re-import cannot text them again, and consent evidence is kept as your records require.
            </p>
            <label className="flex items-start gap-3 text-body">
              <input type="checkbox" name="confirmed" required className="mt-0.5" />
              <span>I want to delete this customer’s personal data.</span>
            </label>
            <div>
              <button type="submit" className={`${dangerButtonClass} w-full sm:w-auto`}>
                Delete customer data
              </button>
            </div>
          </form>
        </Panel>
      </div>
    </Shell>
  );
}
