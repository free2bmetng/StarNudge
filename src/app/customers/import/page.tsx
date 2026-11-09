import { requireSession } from '@/lib/auth';
import { getImportBatch } from '@/lib/services/views';
import { importCsvAction } from '@/app/actions/customers';
import { Icon } from '@/app/_components/icons';
import {
  Badge,
  buttonClass,
  Flash,
  hintClass,
  labelClass,
  param,
  PageTitle,
  Shell,
  StatTile,
} from '@/app/_components/ui';
import { IMPORT_HEADERS } from '@/lib/import-rules';
import { Crumbs, Divided, EmptyNote, Panel } from '@/app/_customers/parts';
import { formatDateTime, isoTime } from '@/app/_customers/format';

export const dynamic = 'force-dynamic';

/** What each expected column holds. Typed by header, so a new column in IMPORT_HEADERS must be described here too. */
const COLUMN_NOTES: Record<(typeof IMPORT_HEADERS)[number], { need: string; note: string }> = {
  first_name: { need: 'Optional.', note: 'The customer’s first name.' },
  last_name: { need: 'Optional.', note: 'The customer’s last name.' },
  phone: { need: 'Phone or email.', note: 'One is required per row. A US number is needed for text consent.' },
  email: { need: 'Phone or email.', note: 'One is required per row. Email consent needs an address.' },
  service_or_purchase: { need: 'Required.', note: 'What the customer bought or booked.' },
  visit_date: { need: 'Required.', note: 'Like 2026-03-14, or 2026-03-14 16:30. Cannot be in the future.' },
  visit_type: { need: 'Optional.', note: 'service (the default) or sale.' },
  language: { need: 'Optional.', note: 'en (the default) or es.' },
  consent_type: { need: 'Optional.', note: 'sms_pew for text messages, or email_opt_in for email. Leave blank for no consent.' },
  consent_source: { need: 'Needed with consent_type.', note: 'Where the customer gave permission.' },
  consent_date: { need: 'Needed with consent_type.', note: 'Like 2026-03-14.' },
};

export default async function ImportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const batchId = param(sp.batch) ?? null;
  const batch = await getImportBatch(s.businessId, batchId);

  return (
    <Shell>
      <Crumbs current="Import" />
      <PageTitle lead="Upload a CSV with one row per visit. Up to 5,000 rows.">Import customers</PageTitle>
      <Flash error={param(sp.error)} notice={param(sp.notice)} />

      <div className="grid gap-6">
        <Panel id="upload" title="Upload a file" icon="upload">
          <form action={importCsvAction} className="grid gap-4">
            <div>
              <label htmlFor="file" className={labelClass}>CSV file</label>
              <div className="flex flex-col items-center gap-4 rounded-card border-2 border-dashed border-line-strong bg-sunken p-6 text-center sm:p-8">
                <span aria-hidden="true" className="grid size-12 place-items-center rounded-pill bg-accent-soft text-accent">
                  <Icon name="upload" className="text-title" />
                </span>
                <p className="text-body text-ink-soft">Choose a CSV file with your customers and visits.</p>
                <input
                  id="file"
                  name="file"
                  type="file"
                  accept=".csv,text/csv"
                  required
                  className="block w-full max-w-md text-body text-ink file:mr-4 file:inline-flex file:min-h-[2.75rem] file:cursor-pointer file:items-center file:rounded-control file:border file:border-line-strong file:bg-surface file:px-4 file:font-semibold file:text-ink file:shadow-rest hover:file:bg-sunken"
                />
              </div>
            </div>
            <div>
              <button type="submit" className={`${buttonClass} w-full sm:w-auto`}>
                Upload and import
              </button>
            </div>
          </form>
          <p className={`${hintClass} mt-4`}>Visits in the last 7 days can start requests. Older visits are stored only.</p>

          <Divided
            title="Expected columns"
            lead="Put these names in the first row. Each row needs a phone or an email and a visit date. Text consent needs a US phone and a consent source."
          >
            <ul className="grid gap-3 sm:grid-cols-2">
              {IMPORT_HEADERS.map((h) => (
                <li key={h} className="rounded-control border border-line bg-sunken p-4 sm:last:col-span-2">
                  <code className="font-mono text-meta font-semibold text-ink">{h}</code>
                  <p className="mt-1 text-meta text-ink-soft">
                    <span className="font-semibold text-ink">{COLUMN_NOTES[h].need}</span> {COLUMN_NOTES[h].note}
                  </p>
                </li>
              ))}
            </ul>
            <p className="text-body">
              <a href="/customers/import/sample.csv" className="font-medium">
                Download a sample file
              </a>
            </p>
          </Divided>
        </Panel>

        {batch ? (
          <Panel id="last-import" title={`Last import: ${batch.filename}`} icon="check">
            <p className="text-meta text-ink-soft">
              Imported <time dateTime={isoTime(batch.created_at)}>{formatDateTime(batch.created_at)}</time>
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile label="Rows in file" value={batch.total_rows} />
              <StatTile label="New customers" value={batch.created_rows} />
              <StatTile label="Matched" value={batch.merged_rows} hint="Already on file" />
              <StatTile
                label="Skipped"
                value={batch.skipped_rows}
                tone={batch.skipped_rows > 0 ? 'warn' : 'default'}
                hint={batch.errors.length > 0 ? 'Listed below' : undefined}
              />
            </div>

            {batch.errors.length > 0 ? (
              <div className="mt-8">
                <h3 className="text-body font-semibold text-ink">
                  {batch.errors.length === 1 ? '1 row has an error' : `${batch.errors.length} rows have errors`}
                </h3>
                <p className="mt-1 max-w-[65ch] text-body text-ink-soft">
                  Each row is checked on its own. Fix these rows, then import the file again.
                </p>
                <ul className="mt-4 divide-y divide-line rounded-control border border-line">
                  {batch.errors.map((e, i) => (
                    <li key={`${e.line}-${i}`} className="grid gap-2 p-4 sm:grid-cols-[7rem_minmax(0,1fr)] sm:items-start sm:gap-4">
                      <div>
                        <Badge tone="crit" icon="alert">
                          Line {e.line}
                        </Badge>
                      </div>
                      <p className="text-body text-ink">{e.message}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-4">
                <Badge tone="good" icon="check">
                  No row errors
                </Badge>
              </p>
            )}
          </Panel>
        ) : (
          <Panel id="last-import" title="Last import">
            <EmptyNote icon="upload" title="No imports yet">
              <p>The result of your last import appears here, with the rows added, matched and skipped, and any row errors.</p>
            </EmptyNote>
          </Panel>
        )}
      </div>
    </Shell>
  );
}
