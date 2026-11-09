import type { Metadata } from 'next';
import { submitContactAction } from '@/app/actions/contact';
import { Button, Card, Flash, hintClass, inputClass, labelClass, param, PageTitle } from '@/app/_components/ui';
import { PublicFrame } from '@/app/_public/PublicFrame';
import { pool, q } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Contact the business',
};

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
    <PublicFrame>
      <PageTitle lead="Tell the business what went wrong. Your message goes straight to the owner.">Have a problem? Contact us</PageTitle>
      {!exists ? (
        <Flash error="This link is no longer valid." />
      ) : sp.sent ? (
        <Flash notice="Thank you. The business has your message." />
      ) : (
        <Card>
          <Flash error={param(sp.error)} />
          <form action={submitContactAction} className="grid gap-6">
            <input type="hidden" name="code" value={code} />
            <div>
              <label htmlFor="message" className={labelClass}>Your message</label>
              <textarea id="message" name="message" required minLength={5} maxLength={2000} rows={5} className={inputClass} />
            </div>
            <div>
              <label htmlFor="replyTo" className={labelClass}>How should they reach you? (optional)</label>
              <input id="replyTo" name="replyTo" maxLength={200} className={inputClass} autoComplete="email" aria-describedby="replyTo-hint" />
              <p id="replyTo-hint" className={hintClass}>An email address or phone number.</p>
            </div>
            <Button type="submit" className="w-full">Send message</Button>
          </form>
        </Card>
      )}
    </PublicFrame>
  );
}
