import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { getTemplate } from '@/lib/services/templates-admin';
import { updateTemplateAction } from '@/app/actions/settings';
import { renderMessage } from '@/lib/templates';
import { buttonClass, cardClass, Flash, hintClass, inputClass, labelClass, param, PageTitle, Section, Shell } from '@/app/_components/ui';

export const dynamic = 'force-dynamic';

export default async function TemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const s = await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const t = await getTemplate(s.businessId, id);
  if (!t) notFound();

  const preview = renderMessage({
    channel: t.channel,
    language: t.language === 'es' ? 'es' : 'en',
    subject: t.subject,
    body: t.body,
    firstName: 'Maria',
    businessName: 'Your Business',
    service: 'Haircut',
    reviewLink: 'https://starnudge.example/r/sample',
    supportLink: 'https://starnudge.example/contact/sample',
    postalAddress: '100 Main Street, Springfield, NY 10001',
    unsubscribeLink: 'https://starnudge.example/unsubscribe/sample',
  });

  return (
    <Shell>
      <p className="mb-2 text-sm"><Link href="/templates" className="underline">Templates</Link> / Edit</p>
      <PageTitle lead="Sample preview uses fake data. The system adds the support link and opt-out text when they are missing.">
        {t.kind === 'service' ? 'Service visit' : 'Retail sale'} · {t.channel === 'sms' ? 'Text' : 'Email'} · {t.language === 'es' ? 'Español' : 'English'}
      </PageTitle>
      <Flash error={param(sp.error)} notice={param(sp.notice)} />

      <Section title="Preview">
        <pre className={`${cardClass} whitespace-pre-wrap text-base`}>{preview.subject ? `Subject: ${preview.subject}\n\n` : ''}{preview.text}</pre>
      </Section>

      <Section title="Edit">
        <form action={updateTemplateAction} className="space-y-4">
          <input type="hidden" name="id" value={t.id} />
          {t.channel === 'email' ? (
            <div>
              <label htmlFor="subject" className={labelClass}>Subject</label>
              <input id="subject" name="subject" required maxLength={120} className={inputClass} defaultValue={t.subject ?? ''} />
            </div>
          ) : null}
          <div>
            <label htmlFor="body" className={labelClass}>Message</label>
            <textarea id="body" name="body" required rows={6} maxLength={1000} className={inputClass} defaultValue={t.body} />
            <p className={hintClass}>
              Fields: {'{first_name}'}, {'{business_name}'}, {'{service}'} (not for dental or medical), {'{review_link}'} (required), {'{support_link}'}.
            </p>
          </div>
          <button type="submit" className={buttonClass}>Save template</button>
        </form>
      </Section>
    </Shell>
  );
}
