import Link from 'next/link';
import type { Metadata } from 'next';
import { requireSession } from '@/lib/auth';
import { listTemplates } from '@/lib/services/templates-admin';
import { Badge, EmptyState, Flash, param, Shell } from '@/app/_components/ui';
import { Icon } from '@/app/_components/icons';
import { LintBadge, PageHead, ProblemList } from '@/app/_ops/ops';

export const metadata: Metadata = { title: 'Message templates' };
export const dynamic = 'force-dynamic';

const KIND: Record<string, string> = { service: 'Service visit', retail: 'Retail sale' };

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const templates = await listTemplates(s.businessId);

  return (
    <Shell>
      <PageHead
        title="Message templates"
        lead="Every template must include the review link and pass the wording check (no ratings, no incentives, no requests to change reviews)."
      />
      <Flash error={param(sp.error)} notice={param(sp.notice)} />

      {templates.length === 0 ? (
        <EmptyState level={2} icon="templates" title="No templates yet">
          <p>Starter templates are created when your business is set up. Each one needs the review link and must pass the wording check.</p>
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
          {templates.map((t) => {
            const passed = t.lintStatus === 'passed';
            const headline = t.channel === 'email' ? t.subject || 'Email message' : t.body;
            return (
              <li
                key={t.id}
                className="sn-card relative flex flex-col gap-3 transition-[border-color,box-shadow] duration-150 ease-out hover:border-line-strong hover:shadow-raised has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge icon={t.channel === 'sms' ? 'message' : 'mail'}>
                    {t.channel === 'sms' ? 'Text' : 'Email'}
                  </Badge>
                  <Badge>{t.language === 'es' ? 'Español' : 'English'}</Badge>
                  <Badge>{KIND[t.kind] ?? t.kind}</Badge>
                </div>

                <h2 className="line-clamp-2 text-body font-semibold leading-snug text-ink">
                  <Link
                    href={`/templates/${t.id}`}
                    className="text-ink no-underline after:absolute after:inset-0 after:rounded-[var(--radius-card)] after:content-['']"
                  >
                    {headline}
                  </Link>
                </h2>

                <div className="flex flex-col gap-2">
                  <div>
                    <LintBadge status={t.lintStatus} />
                  </div>
                  {passed ? null : <ProblemList problems={t.lintProblems} />}
                </div>

                <span className="mt-auto inline-flex items-center gap-2 text-meta font-semibold text-accent">
                  Edit message
                  <Icon name="arrow" />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Shell>
  );
}
