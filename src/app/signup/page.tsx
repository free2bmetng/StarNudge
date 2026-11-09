import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentSession } from '@/lib/auth';
import { INDUSTRY_LABELS, INDUSTRIES } from '@/lib/templates';
import { signUpAction } from '@/app/actions/auth';
import { buttonClass, Flash, hintClass, inputClass, labelClass, param, Public, PageTitle } from '@/app/_components/ui';

export const dynamic = 'force-dynamic';

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
    <Public>
      <PageTitle lead="Takes about five minutes. You will confirm your review link next.">Create your account</PageTitle>
      <Flash error={param(sp.error)} />
      <form action={signUpAction} className="space-y-4">
        <div>
          <label htmlFor="businessName" className={labelClass}>Business name</label>
          <input id="businessName" name="businessName" required minLength={2} maxLength={80} className={inputClass} autoComplete="organization" />
        </div>
        <div>
          <label htmlFor="industry" className={labelClass}>Industry</label>
          <select id="industry" name="industry" required className={inputClass} defaultValue="restaurant">
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>{INDUSTRY_LABELS[i]}</option>
            ))}
          </select>
          <p className={hintClass}>Sets the starting message templates. You can edit them later.</p>
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
          <textarea id="postalAddress" name="postalAddress" required minLength={10} maxLength={200} rows={2} className={inputClass} autoComplete="street-address" />
          <p className={hintClass}>Required by email law. It appears in the footer of every email.</p>
        </div>
        <div>
          <label htmlFor="email" className={labelClass}>Email</label>
          <input id="email" name="email" type="email" required className={inputClass} autoComplete="email" />
        </div>
        <div>
          <label htmlFor="password" className={labelClass}>Password</label>
          <input id="password" name="password" type="password" required minLength={10} className={inputClass} autoComplete="new-password" />
          <p className={hintClass}>At least 10 characters.</p>
        </div>
        <button type="submit" className={buttonClass}>Create account</button>
      </form>
      <p className="mt-6 text-base text-stone-800">
        Already have an account? <Link href="/login" className="underline">Log in</Link>
      </p>
    </Public>
  );
}
