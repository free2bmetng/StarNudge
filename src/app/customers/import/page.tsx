import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { getImportBatch } from '@/lib/services/views';
import { importCsvAction } from '@/app/actions/customers';
import { buttonClass, Flash, hintClass, inputClass, labelClass, param, PageTitle, Section, Shell } from '@/app/_components/ui';
import { IMPORT_HEADERS } from '@/lib/import-rules';

export const dynamic = 'force-dynamic';

export default async function ImportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const batchId = param(sp.batch) ?? null;
  const batch = await getImportBatch(s.businessId, batchId);

  return (
    <Shell>
      <p className="mb-2 text-sm"><Link href="/customers" className="underline">Customers</Link> / Import</p>
      <PageTitle lead="Upload a CSV with one row per visit. Up to 5,000 rows.">Import customers</PageTitle>
      <Flash error={param(sp.error)} notice={param(sp.notice)} />

      <Section title="Upload a file">
        <p className="mb-3 text-base text-stone-800">
          Columns: <span className="font-mono text-sm">{IMPORT_HEADERS.join(', ')}</span>. Each row needs a phone or an email and a
          visit date. Text consent needs a US phone and a consent source.
        </p>
        <p className="mb-4 text-base">
          <a href="/customers/import/sample.csv" className="underline">Download a sample file</a>
        </p>
        <form action={importCsvAction} className="space-y-3">
          <div>
            <label htmlFor="file" className={labelClass}>CSV file</label>
            <input id="file" name="file" type="file" accept=".csv,text/csv" required className={inputClass} />
          </div>
          <button type="submit" className={buttonClass}>Upload and import</button>
        </form>
        <p className={`${hintClass} mt-3`}>Visits in the last 7 days can start requests. Older visits are stored only.</p>
      </Section>

      {batch ? (
        <Section title={`Last import: ${batch.filename}`}>
          <p className="text-base">
            {batch.total_rows} rows: {batch.created_rows} new, {batch.merged_rows} matched, {batch.skipped_rows} skipped.
          </p>
          {batch.errors.length > 0 ? (
            <ul className="mt-3 space-y-1 text-base">
              {batch.errors.map((e, i) => (
                <li key={`${e.line}-${i}`}>Line {e.line}: {e.message}</li>
              ))}
            </ul>
          ) : null}
        </Section>
      ) : null}
    </Shell>
  );
}
