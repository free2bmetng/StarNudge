import { submitContactAction } from '@/app/actions/contact';
import { buttonClass, Flash, hintClass, inputClass, labelClass, param, PageTitle, Public } from '@/app/_components/ui';
import { q } from '@/lib/db';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code } = await params;
  const sp = await searchParams;
  const found = await q<{ business_id: string | null }>(pool(), 'select business_id from find_short_link($1)', [code]);
  const exists = Boolean(found[0]?.business_id);
  return (
    <Public>
      <PageTitle lead="Tell the business what went wrong. Your message goes straight to the owner.">Have a problem? Contact us</PageTitle>
      {!exists ? (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-base text-red-900">
          This link is no longer valid.
        </p>
      ) : sp.sent ? (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-base text-emerald-900">
          Thank you. The business has your message.
        </p>
      ) : (
        <>
          <Flash error={param(sp.error)} />
          <form action={submitContactAction} className="space-y-4">
            <input type="hidden" name="code" value={code} />
            <div>
              <label htmlFor="message" className={labelClass}>Your message</label>
              <textarea id="message" name="message" required minLength={5} maxLength={2000} rows={5} className={inputClass} />
            </div>
            <div>
              <label htmlFor="replyTo" className={labelClass}>How should they reach you? (optional)</label>
              <input id="replyTo" name="replyTo" maxLength={200} className={inputClass} autoComplete="email" />
              <p className={hintClass}>An email address or phone number.</p>
            </div>
            <button type="submit" className={buttonClass}>Send message</button>
          </form>
        </>
      )}
    </Public>
  );
}
