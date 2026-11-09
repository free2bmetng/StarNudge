import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentSession } from '@/lib/auth';
import { logInAction } from '@/app/actions/auth';
import { buttonClass, Flash, inputClass, labelClass, param, Public, PageTitle } from '@/app/_components/ui';

export const dynamic = 'force-dynamic';

export default async function LogInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (await currentSession()) redirect('/dashboard');
  const sp = await searchParams;
  return (
    <Public>
      <PageTitle>Log in</PageTitle>
      <Flash error={param(sp.error)} />
      <form action={logInAction} className="space-y-4">
        <div>
          <label htmlFor="email" className={labelClass}>Email</label>
          <input id="email" name="email" type="email" required className={inputClass} autoComplete="email" />
        </div>
        <div>
          <label htmlFor="password" className={labelClass}>Password</label>
          <input id="password" name="password" type="password" required className={inputClass} autoComplete="current-password" />
        </div>
        <button type="submit" className={buttonClass}>Log in</button>
      </form>
      <p className="mt-6 text-base text-stone-800">
        New here? <Link href="/signup" className="underline">Create an account</Link>
      </p>
    </Public>
  );
}
