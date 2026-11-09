import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge, buttonClass } from '@/app/_components/ui';
import { Icon } from '@/app/_components/icons';

/*
 * Dashboard-only pieces. Shared primitives stay in _components/ui.tsx.
 * Everything here uses design tokens (text-ink, bg-sunken, border-line, ...), never raw palette classes.
 */

export type Tone = 'neutral' | 'good' | 'warn' | 'crit';

/** The single most important action on the page. Its button is the only primary button. */
export function NextStep({ text, href, label }: { text: string; href: string; label: string }) {
  return (
    <section aria-labelledby="dash-next-step" className="sn-card shadow-[inset_0_3px_0_var(--accent),var(--elev-raised)]">
      <h2 id="dash-next-step" className="m-0 text-meta font-semibold uppercase tracking-wide text-ink-soft">
        Next step
      </h2>
      <p className="m-0 mt-2 max-w-prose text-title font-medium text-ink">{text}</p>
      <Link href={href} className={`${buttonClass} mt-4 w-full sm:w-auto`}>
        {label}
        <Icon name="arrow" />
      </Link>
    </section>
  );
}

/** A titled card that holds one group of content. */
export function Panel({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="sn-card">
      <h2 id={id} className="sn-section-heading">
        {title}
      </h2>
      {children}
    </section>
  );
}

export interface QuietRow {
  label: string;
  value: string;
  hint?: string;
}

/**
 * Secondary figures. A recessed panel with ruled rows, so they read as supporting detail
 * beside the raised StatTile figures above them.
 */
export function QuietStats({ rows }: { rows: QuietRow[] }) {
  return (
    <dl className="m-0 rounded-card border border-line bg-sunken px-4 sm:px-6">
      {rows.map((row) => (
        <div
          key={row.label}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 border-t border-line py-3 first:border-t-0"
        >
          <dt className="font-medium text-ink">{row.label}</dt>
          <dd className="m-0 text-title font-semibold tabular-nums text-ink">{row.value}</dd>
          {row.hint ? <dd className="col-start-1 m-0 text-meta text-ink-soft">{row.hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

export interface StatusItem {
  label: string;
  tone: Tone;
  text: string;
}

/** Status rows. Each state is a Badge with its words and an icon, so colour is never the only signal. */
export function StatusList({ items }: { items: StatusItem[] }) {
  return (
    <dl className="m-0">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex flex-col items-start gap-2 border-t border-line py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        >
          <dt className="font-medium text-ink">{item.label}</dt>
          <dd className="m-0">
            <Badge tone={item.tone}>{item.text}</Badge>
          </dd>
        </div>
      ))}
    </dl>
  );
}
