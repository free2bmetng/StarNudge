import type { ReactNode } from 'react';
import { Badge } from '@/app/_components/ui';

/*
 * Shared pieces for the owner tools: templates, inbox, QR code and sandbox.
 * Built here (not in ui.tsx) so the design-system files stay untouched.
 * Colours come from the tokens in globals.css; nothing here hard-codes a palette.
 */

/** Page heading with a lead and an optional row of status badges under it. */
export function PageHead({ title, lead, children }: { title: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  return (
    <div className="sn-page-head">
      <h1 className="sn-page-title">{title}</h1>
      {lead ? <p className="sn-page-lead">{lead}</p> : null}
      {children ? <div className="mt-4 flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

/** A titled surface for one group of controls or one decision. */
export function Panel({
  id,
  title,
  index,
  lead,
  className,
  children,
}: {
  id: string;
  title: string;
  index?: string;
  lead?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={`sn-card ${className ?? ''}`.trim()}>
      <div className="flex items-baseline gap-3">
        {index ? <span className="font-mono text-meta text-ink-muted">{index}</span> : null}
        <h2 id={id} className="sn-section-heading">
          {title}
        </h2>
      </div>
      {lead ? <p className="-mt-1 mb-4 text-meta text-ink-soft">{lead}</p> : null}
      {children}
    </section>
  );
}

/** Lint status as a badge. The words carry the meaning; the icon repeats it. */
export function LintBadge({ status }: { status: string }) {
  return status === 'passed' ? (
    <Badge tone="good">Passes the wording check</Badge>
  ) : (
    <Badge tone="crit">Needs fixing</Badge>
  );
}

/** The problems the wording check found, one per line, in plain words. */
export function ProblemList({ problems }: { problems: string[] }) {
  if (problems.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-meta font-semibold text-ink">Problems to fix:</p>
      <ul className="list-disc space-y-1 pl-5 text-meta text-ink-soft">
        {problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A date and time in the business's time zone, as a <time> element.
 * Owners read these times in the business's clock, not the server's.
 */
export function When({ date, timeZone, className }: { date: Date; timeZone: string; className?: string }) {
  const label = new Intl.DateTimeFormat('en-US', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(date);
  return (
    <time dateTime={date.toISOString()} className={className}>
      {label}
    </time>
  );
}
