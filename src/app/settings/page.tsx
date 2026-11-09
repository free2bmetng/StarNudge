import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { cfg } from '@/lib/config';
import { getAutomationRules, getBusinessProfile, getOnboardingState } from '@/lib/services/views';
import { INDUSTRY_LABELS, type Industry } from '@/lib/templates';
import { cancelSubscriptionAction, startSubscriptionAction, updateSettingsAction } from '@/app/actions/settings';
import {
  Badge,
  buttonClass,
  dangerButtonClass,
  Flash,
  hintClass,
  inputClass,
  labelClass,
  param,
  PageTitle,
  Section,
  secondaryButtonClass,
  Shell,
} from '@/app/_components/ui';
import { DangerZone, SenderBadge, StatusList, StatusRow } from '@/app/_setup/parts';

export const dynamic = 'force-dynamic';

const TIME_ZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix',
  'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'Europe/London',
];

const SUBSCRIPTION: Record<string, { label: string; tone: 'neutral' | 'good' | 'warn' }> = {
  none: { label: 'Not subscribed', tone: 'neutral' },
  active: { label: 'Active', tone: 'good' },
  canceled_at_period_end: { label: 'Ends at period end', tone: 'warn' },
  canceled: { label: 'Canceled', tone: 'neutral' },
};

function hourOptions(from: number, to: number, current: number) {
  const out = [];
  for (let h = from; h <= to; h++) {
    out.push(<option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>);
  }
  void current;
  return out;
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const profile = await getBusinessProfile(s.businessId);
  if (!profile) return null;
  const rules = await getAutomationRules(s.businessId);
  const onboarding = await getOnboardingState(s.businessId);
  const service = rules.find((r) => r.visit_kind === 'service');
  const retail = rules.find((r) => r.visit_kind === 'retail');
  const sandbox = cfg().sandboxMode;
  const linkConfirmed = Boolean(onboarding.link?.confirmed_at);
  const senderStatus = onboarding.sender?.status ?? 'not_started';
  const sub = SUBSCRIPTION[profile.subscription_status] ?? {
    label: profile.subscription_status.replace(/_/g, ' '),
    tone: 'neutral' as const,
  };

  return (
    <Shell>
      <PageTitle lead="You can narrow sending hours and lengthen the frequency window. You cannot widen either.">Settings</PageTitle>
      <Flash error={param(sp.error)} notice={param(sp.notice)} />

      <div className="grid gap-6 [&_.sn-section]:mb-0">
        <form action={updateSettingsAction} className="grid gap-6">
          <Section title="Business">
            <div className="grid gap-4">
              <div>
                <label htmlFor="name" className={labelClass}>Business name</label>
                <input id="name" name="name" required minLength={2} maxLength={80} defaultValue={profile.name} className={inputClass} />
                <p className={hintClass}>Industry: {INDUSTRY_LABELS[profile.industry as Industry]}</p>
              </div>
              <div>
                <label htmlFor="postalAddress" className={labelClass}>Postal address (shown in every email)</label>
                <textarea id="postalAddress" name="postalAddress" required rows={2} minLength={10} maxLength={200} defaultValue={profile.postal_address} className={inputClass} />
              </div>
              <div>
                <label htmlFor="timeZone" className={labelClass}>Time zone</label>
                <select id="timeZone" name="timeZone" defaultValue={profile.time_zone} className={inputClass}>
                  {[...new Set([profile.time_zone, ...TIME_ZONES])].map((z) => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              </div>
            </div>
          </Section>

          <Section title="Sending rules">
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="quietStartHour" className={labelClass}>Sending starts at</label>
                  <select id="quietStartHour" name="quietStartHour" defaultValue={profile.quiet_start_hour} className={inputClass}>
                    {hourOptions(8, 20, profile.quiet_start_hour)}
                  </select>
                </div>
                <div>
                  <label htmlFor="quietEndHour" className={labelClass}>Sending ends at</label>
                  <select id="quietEndHour" name="quietEndHour" defaultValue={profile.quiet_end_hour} className={inputClass}>
                    {hourOptions(9, 21, profile.quiet_end_hour)}
                  </select>
                </div>
              </div>
              <p className={`${hintClass} mt-0`}>The end must be after the start.</p>
              <div>
                <label htmlFor="frequencyWindowDays" className={labelClass}>Days between requests to the same customer</label>
                <input id="frequencyWindowDays" name="frequencyWindowDays" type="number" min={90} max={365} required defaultValue={profile.frequency_window_days} className={inputClass} />
                <p className={hintClass}>Between 90 and 365 days.</p>
              </div>
            </div>
          </Section>

          <Section title="Automatic requests">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid content-start gap-4 rounded-control bg-sunken p-4">
                <h3 className="m-0 text-body font-semibold">Service visits</h3>
                <label className="flex min-h-11 cursor-pointer items-center gap-3">
                  <input type="checkbox" name="serviceEnabled" defaultChecked={service?.enabled ?? true} />
                  <span>Send requests after service visits</span>
                </label>
                <div>
                  <label htmlFor="serviceDelayMinutes" className={labelClass}>Minutes after a service visit</label>
                  <input id="serviceDelayMinutes" name="serviceDelayMinutes" type="number" min={0} max={10080} required defaultValue={service?.delay_minutes ?? 180} className={inputClass} />
                  <p className={hintClass}>From 0 to 10080 minutes (7 days).</p>
                </div>
              </div>
              <div className="grid content-start gap-4 rounded-control bg-sunken p-4">
                <h3 className="m-0 text-body font-semibold">Retail sales</h3>
                <label className="flex min-h-11 cursor-pointer items-center gap-3">
                  <input type="checkbox" name="retailEnabled" defaultChecked={retail?.enabled ?? true} />
                  <span>Send requests after retail sales</span>
                </label>
                <div>
                  <label htmlFor="retailDelayMinutes" className={labelClass}>Minutes after a retail sale</label>
                  <input id="retailDelayMinutes" name="retailDelayMinutes" type="number" min={0} max={10080} required defaultValue={retail?.delay_minutes ?? 1440} className={inputClass} />
                  <p className={hintClass}>From 0 to 10080 minutes (7 days).</p>
                </div>
              </div>
            </div>
          </Section>

          <div className="flex sm:justify-end">
            <button type="submit" className={`${buttonClass} w-full sm:w-auto`}>Save settings</button>
          </div>
        </form>

        <Section title="Review link and text sender">
          <StatusList>
            <StatusRow label="Review link">
              {linkConfirmed ? <Badge tone="good">Confirmed</Badge> : <Badge tone="warn">Not confirmed</Badge>}
            </StatusRow>
            <StatusRow label="Text sender">
              <SenderBadge status={senderStatus} />
            </StatusRow>
          </StatusList>
          <div className="mt-4">
            <Link href="/onboarding" className={secondaryButtonClass}>Manage on the setup page</Link>
          </div>
        </Section>

        <Section title="Subscription">
          <StatusList>
            <StatusRow label="Status">
              <Badge tone={sub.tone}>{sub.label}</Badge>
            </StatusRow>
            <StatusRow label="Plan price">{cfg().priceLabel}</StatusRow>
            {profile.period_end ? (
              <StatusRow label="Current period ends">
                {new Date(profile.period_end).toLocaleDateString('en-US', { dateStyle: 'long' })}
              </StatusRow>
            ) : null}
          </StatusList>
          <p className="mb-0 mt-3 text-ink-soft">Monthly, with no contract and no setup or renewal fees.</p>

          {profile.subscription_status === 'active' ? (
            <DangerZone id="danger-cancel-subscription" title="Cancel subscription">
              <p className="m-0">Canceling keeps your plan running until the end of the current paid period.</p>
              <form action={cancelSubscriptionAction} className="mt-4">
                <button type="submit" className={dangerButtonClass}>Cancel at end of period</button>
              </form>
            </DangerZone>
          ) : profile.subscription_status === 'canceled_at_period_end' ? (
            <p className="mb-0 mt-4 max-w-prose">Your subscription ends at the close of the current paid period.</p>
          ) : (
            <form action={startSubscriptionAction} className="mt-4">
              <button type="submit" className={buttonClass}>{sandbox ? 'Start subscription (sandbox)' : 'Subscribe'}</button>
            </form>
          )}
        </Section>
      </div>
    </Shell>
  );
}
