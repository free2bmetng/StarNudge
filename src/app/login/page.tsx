import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentSession } from '@/lib/auth';
import { logInAction } from '@/app/actions/auth';
import { Button, Card, Flash, inputClass, labelClass, PageTitle, param } from '@/app/_components/ui';
import { PublicFrame } from '@/app/_public/PublicFrame';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Log in',
};

export default async function LogInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (await currentSession()) redirect('/dashboard');
  const sp = await searchParams;
  return (
    <PublicFrame>
      <PageTitle lead="Use the email and password for your account.">Log in</PageTitle>
      <Card>
        <Flash error={param(sp.error)} />
        <form action={logInAction} className="grid gap-6">
          <div>
            <label htmlFor="email" className={labelClass}>Email</label>
            <input id="email" name="email" type="email" required className={inputClass} autoComplete="email" />
          </div>
          <div>
            <label htmlFor="password" className={labelClass}>Password</label>
            <input id="password" name="password" type="password" required className={inputClass} autoComplete="current-password" />
          </div>
          <Button type="submit" className="w-full">Log in</Button>
        </form>
      </Card>
      <p className="mt-6 mb-0 text-body text-ink-soft">
        New here? <Link href="/signup">Create an account</Link>
      </p>
    </PublicFrame>
  );
}
