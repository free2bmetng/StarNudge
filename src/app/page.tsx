import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentSession } from '@/lib/auth';
import { buttonClass, Public, secondaryButtonClass } from './_components/ui';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  if (await currentSession()) redirect('/dashboard');
  return (
    <Public>
      <h1 className="text-3xl font-semibold text-stone-900">Get more Google reviews, the right way.</h1>
      <p className="mt-3 text-base text-stone-800">
        StarNudge sends one honest review request to every customer, on a schedule that respects quiet hours and
        opt-outs. No review gating, no incentives, and no fake reviews.
      </p>
      <div className="mt-6 flex flex-col gap-3">
        <Link href="/signup" className={buttonClass}>
          Create your account
        </Link>
        <Link href="/login" className={secondaryButtonClass}>
          Log in
        </Link>
      </div>
    </Public>
  );
}
