import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentSession } from '@/lib/auth';
import { INDUSTRY_LABELS, INDUSTRIES } from '@/lib/templates';
import { signUpAction } from '@/app/actions/auth';
import { Button, Card, Flash, hintClass, inputClass, labelClass, PageTitle, param } from '@/app/_components/ui';
import { PublicFrame } from '@/app/_public/PublicFrame';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Create your account',
};

const TIME_ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
];

export default async function SignUpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (await currentSession()) redirect('/dashboard');
  const sp = await searchParams;
  return (
    <PublicFrame>
      <PageTitle lead="Takes about five minutes. You will confirm your review link next.">Create your account</PageTitle>
      <Card>
        <Flash error={param(sp.error)} />
        <form action={signUpAction} className="grid gap-8">
          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className="sn-section-heading">About your business</legend>
            <div className="grid gap-6">
              <div>
                <label htmlFor="businessName" className={labelClass}>Business name</label>
                <input id="businessName" name="businessName" required minLength={2} maxLength={80} className={inputClass} autoComplete="organization" />
              </div>
              <div>
                <label htmlFor="industry" className={labelClass}>Industry</label>
                <select id="industry" name="industry" required className={inputClass} defaultValue="restaurant" aria-describedby="industry-hint">
                  {INDUSTRIES.map((i) => (
                    <option key={i} value={i}>{INDUSTRY_LABELS[i]}</option>
                  ))}
                </select>
                <p id="industry-hint" className={hintClass}>Sets the starting message templates. You can edit them later.</p>
              </div>
              <div>
                <label htmlFor="timeZone" className={labelClass}>Time zone</label>
                <select id="timeZone" name="timeZone" required className={inputClass} defaultValue="America/New_York">
                  {TIME_ZONES.map((z) => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="postalAddress" className={labelClass}>Postal address</label>
                <textarea id="postalAddress" name="postalAddress" required minLength={10} maxLength={200} rows={2} className={inputClass} autoComplete="street-address" aria-describedby="postalAddress-hint" />
                <p id="postalAddress-hint" className={hintClass}>Required by email law. It appears in the footer of every email.</p>
              </div>
            </div>
          </fieldset>
          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className="sn-section-heading">Sign-in details</legend>
            <div className="grid gap-6">
              <div>
                <label htmlFor="email" className={labelClass}>Email</label>
                <input id="email" name="email" type="email" required className={inputClass} autoComplete="email" />
              </div>
              <div>
                <label htmlFor="password" className={labelClass}>Password</label>
                <input id="password" name="password" type="password" required minLength={10} className={inputClass} autoComplete="new-password" aria-describedby="password-hint" />
                <p id="password-hint" className={hintClass}>At least 10 characters.</p>
              </div>
            </div>
          </fieldset>
          <Button type="submit" className="w-full">Create account</Button>
        </form>
      </Card>
      <p className="mt-6 mb-0 text-body text-ink-soft">
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </PublicFrame>
  );
}
