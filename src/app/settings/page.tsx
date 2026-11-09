import { requireSession } from '@/lib/auth';
import { cfg } from '@/lib/config';
import { getAutomationRules, getBusinessProfile, getOnboardingState } from '@/lib/services/views';
import { INDUSTRY_LABELS, type Industry } from '@/lib/templates';
import { cancelSubscriptionAction, startSubscriptionAction, updateSettingsAction } from '@/app/actions/settings';
import {
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
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const TIME_ZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix',
  'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'Europe/London',
];

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

  return (
    <Shell>
      <PageTitle lead="You can narrow sending hours and lengthen the frequency window. You cannot widen either.">Settings</PageTitle>
      <Flash error={param(sp.error)} notice={param(sp.notice)} />

      <Section title="Business and sending rules">
        <form action={updateSettingsAction} className="space-y-4">
          <div>
            <label htmlFor="name" className={labelClass}>Business name</label>
            <input id="name" name="name" required minLength={2} maxLength={80} defaultValue={profile.name} className={inputClass} />
            <p className={hintClass}>{INDUSTRY_LABELS[profile.industry as Industry]}</p>
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
          <div>
            <label htmlFor="frequencyWindowDays" className={labelClass}>Days between requests to the same customer</label>
            <input id="frequencyWindowDays" name="frequencyWindowDays" type="number" min={90} max={365} required defaultValue={profile.frequency_window_days} className={inputClass} />
            <p className={hintClass}>At least 90 days.</p>
          </div>
          <fieldset className="space-y-3 rounded-md border border-stone-200 p-3">
            <legend className="px-1 text-base font-medium">Automatic requests after a visit</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="serviceDelayMinutes" className={labelClass}>Service visits: minutes after</label>
                <input id="serviceDelayMinutes" name="serviceDelayMinutes" type="number" min={0} max={10080} required defaultValue={service?.delay_minutes ?? 180} className={inputClass} />
              </div>
              <label className="flex items-center gap-3 text-base sm:mt-7">
                <input type="checkbox" name="serviceEnabled" defaultChecked={service?.enabled ?? true} className="h-5 w-5" />
                On
              </label>
              <div>
                <label htmlFor="retailDelayMinutes" className={labelClass}>Retail sales: minutes after</label>
                <input id="retailDelayMinutes" name="retailDelayMinutes" type="number" min={0} max={10080} required defaultValue={retail?.delay_minutes ?? 1440} className={inputClass} />
              </div>
              <label className="flex items-center gap-3 text-base sm:mt-7">
                <input type="checkbox" name="retailEnabled" defaultChecked={retail?.enabled ?? true} className="h-5 w-5" />
                On
              </label>
            </div>
          </fieldset>
          <button type="submit" className={buttonClass}>Save settings</button>
        </form>
      </Section>

      <Section title="Review link and text sender">
        <p className="mb-3 text-base">
          Review link: {onboarding.link?.confirmed_at ? 'confirmed' : 'not confirmed'}. Text sender:{' '}
          {(onboarding.sender?.status ?? 'not_started').replace(/_/g, ' ')}.
        </p>
        <Link href="/onboarding" className={secondaryButtonClass}>Manage on the setup page</Link>
      </Section>

      <Section title="Subscription">
        <p className="mb-3 text-base">
          Status: <strong>{profile.subscription_status.replace(/_/g, ' ')}</strong>
          {profile.period_end ? ` · current period ends ${new Date(profile.period_end).toLocaleDateString('en-US')}` : ''}
        </p>
        <p className="mb-4 text-base text-stone-800">Plan price: {cfg().priceLabel}. Monthly, with no contract and no setup or renewal fees.</p>
        {profile.subscription_status === 'active' ? (
          <form action={cancelSubscriptionAction}>
            <button type="submit" className={dangerButtonClass}>Cancel at end of period</button>
          </form>
        ) : profile.subscription_status === 'canceled_at_period_end' ? null : (
          <form action={startSubscriptionAction}>
            <button type="submit" className={buttonClass}>{sandbox ? 'Start subscription (sandbox)' : 'Subscribe'}</button>
          </form>
        )}
      </Section>
    </Shell>
  );
}
