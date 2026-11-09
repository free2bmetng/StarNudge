import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { listTemplates } from '@/lib/services/templates-admin';
import { cardClass, Flash, param, PageTitle, Shell } from '@/app/_components/ui';

export const dynamic = 'force-dynamic';

const KIND: Record<string, string> = { service: 'Service visit', retail: 'Retail sale' };

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const templates = await listTemplates(s.businessId);

  return (
    <Shell>
      <PageTitle lead="Every template must include the review link and pass the wording check (no ratings, no incentives, no requests to change reviews).">
        Message templates
      </PageTitle>
      <Flash error={param(sp.error)} notice={param(sp.notice)} />
      <ul className="space-y-3">
        {templates.map((t) => (
          <li key={t.id}>
            <Link href={`/templates/${t.id}`} className={`${cardClass} block hover:border-stone-400`}>
              <p className="text-base font-semibold text-stone-900">
                {KIND[t.kind]} · {t.channel === 'sms' ? 'Text' : 'Email'} · {t.language === 'es' ? 'Español' : 'English'}
              </p>
              <p className="mt-1 text-sm text-stone-700">
                {t.lintStatus === 'passed' ? 'Passes the wording check' : `Needs fixing: ${t.lintProblems.join(' ')}`}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
