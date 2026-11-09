import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { getTemplate } from '@/lib/services/templates-admin';
import { updateTemplateAction } from '@/app/actions/settings';
import { renderMessage } from '@/lib/templates';
import { buttonClass, Flash, hintClass, inputClass, labelClass, param, Shell } from '@/app/_components/ui';
import { Icon } from '@/app/_components/icons';
import { EmailPreview, SmsPreview } from '@/app/_ops/preview';
import { LintBadge, PageHead, Panel, ProblemList } from '@/app/_ops/ops';

export const metadata: Metadata = { title: 'Edit template' };
export const dynamic = 'force-dynamic';

const WORDING_RULES = [
  'Include {review_link}.',
  'A text must include {business_name}.',
  'An email needs a subject line.',
  'No ratings, star counts, incentives or requests to change reviews.',
];

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
      <nav aria-label="Breadcrumb" className="mb-3">
        <ol className="flex flex-wrap items-center gap-2 text-meta text-ink-soft">
          <li>
            <Link href="/templates" className="font-semibold">
              Templates
            </Link>
          </li>
          <li aria-hidden="true" className="flex items-center">
            <Icon name="chevron" />
          </li>
          <li aria-current="page" className="text-ink">
            Edit
          </li>
        </ol>
      </nav>

      <PageHead
        title={
          <>
            {t.kind === 'service' ? 'Service visit' : 'Retail sale'} · {t.channel === 'sms' ? 'Text' : 'Email'} · {t.language === 'es' ? 'Español' : 'English'}
          </>
        }
        lead="Sample preview uses fake data. The system adds the support link and opt-out text when they are missing."
      >
        <LintBadge status={t.lintStatus} />
      </PageHead>
      <Flash error={param(sp.error)} notice={param(sp.notice)} />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-2">
        <Panel id="s-edit" title="Edit" index="01">
          {t.lintStatus === 'passed' ? null : (
            <div className="mb-5 rounded-[var(--radius-control)] border border-crit bg-crit-soft p-4">
              <ProblemList problems={t.lintProblems} />
              <p className="mt-2 text-meta text-ink-soft">Fix these and save. Requests use this template only after it passes.</p>
            </div>
          )}

          <form action={updateTemplateAction} className="flex flex-col gap-5">
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
                Fields: <Token>{'{first_name}'}</Token>, <Token>{'{business_name}'}</Token>, <Token>{'{service}'}</Token> (not for dental or
                medical), <Token>{'{review_link}'}</Token> (required), <Token>{'{support_link}'}</Token>.
              </p>
            </div>
            <div>
              <button type="submit" className={buttonClass}>Save template</button>
            </div>
          </form>

          <div className="mt-6 border-t border-line pt-5">
            <h3 className="text-body font-semibold text-ink">Wording check</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-meta text-ink-soft">
              {WORDING_RULES.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </div>
        </Panel>

        <div className="lg:sticky lg:top-8">
          <Panel id="s-preview" title="Preview" index="02" lead="Sample data: first name Maria, service Haircut, business Your Business.">
            {t.channel === 'sms' ? (
              <SmsPreview recipient="Maria" text={preview.text} />
            ) : (
              <EmailPreview sender="Your Business" subject={preview.subject ?? ''} text={preview.text} />
            )}
          </Panel>
        </div>
      </div>
    </Shell>
  );
}

/** A merge field shown as a token, so it reads as code and not as prose. */
function Token({ children }: { children: string }) {
  return <code className="rounded-md bg-sunken px-1.5 py-0.5 font-mono text-[0.9em] text-ink">{children}</code>;
}
