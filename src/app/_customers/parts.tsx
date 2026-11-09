import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/app/_components/icons';
import { initialsOf } from './format';

function join(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* Shared primitives for the customer pages. Colours come from the design tokens in globals.css. */

/** Round initials for a customer. Decorative, because the full name is written next to it. */
export function Initials({ first, last, size = 'md' }: { first: string; last: string; size?: 'md' | 'lg' }) {
  return (
    <span
      aria-hidden="true"
      className={join(
        'inline-grid shrink-0 place-items-center rounded-pill border border-line bg-sunken font-semibold tabular-nums text-ink',
        size === 'lg' ? 'size-16 text-title' : 'size-11 text-meta',
      )}
    >
      {initialsOf(first, last)}
    </span>
  );
}

/** A trail back to the customer list. The current page is marked for assistive tech. */
export function Crumbs({ current }: { current: string }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-ink-soft">
        <li>
          <Link href="/customers" className="font-medium">
            Customers
          </Link>
        </li>
        <li aria-hidden="true" className="inline-flex text-ink-muted">
          <Icon name="chevron" />
        </li>
        <li aria-current="page" className="min-w-0 font-medium text-ink">
          {current}
        </li>
      </ol>
    </nav>
  );
}

type PanelTone = 'default' | 'primary' | 'danger';

const PANEL_TONE: Record<PanelTone, string> = {
  default: 'border-line shadow-rest',
  primary: 'border-accent shadow-raised',
  danger: 'border-crit shadow-rest',
};

const PANEL_ICON_TONE: Record<PanelTone, string> = {
  default: 'border border-line bg-sunken text-ink-soft',
  primary: 'bg-accent-soft text-accent',
  danger: 'bg-crit-soft text-crit',
};

/**
 * A titled section card. `primary` marks the one main action on a screen (raised, berry border).
 * `danger` marks work that cannot be undone. Headings are h2, so sub-blocks use Divided (h3).
 */
export function Panel({
  id,
  title,
  icon,
  eyebrow,
  lead,
  tone = 'default',
  className,
  children,
}: {
  id: string;
  title: string;
  icon?: IconName;
  eyebrow?: string;
  lead?: string;
  tone?: PanelTone;
  className?: string;
  children: ReactNode;
}) {
  const headingId = `${id}-heading`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={join('scroll-mt-20 rounded-card border bg-surface p-4 text-ink sm:p-6', PANEL_TONE[tone], className)}
    >
      <header className="mb-6 grid gap-2">
        {eyebrow ? (
          <p className={join('text-meta font-semibold uppercase tracking-wide', tone === 'danger' ? 'text-crit' : 'text-ink-soft')}>
            {eyebrow}
          </p>
        ) : null}
        <div className="flex items-center gap-3">
          {icon ? (
            <span className={join('grid size-9 shrink-0 place-items-center rounded-pill', PANEL_ICON_TONE[tone])}>
              <Icon name={icon} />
            </span>
          ) : null}
          <h2 id={headingId} className={join('sn-section-heading mb-0 min-w-0', tone === 'danger' && 'text-crit')}>
            {title}
          </h2>
        </div>
        {lead ? <p className="max-w-[65ch] text-body text-ink-soft">{lead}</p> : null}
      </header>
      {children}
    </section>
  );
}

/**
 * An empty state for use inside a card. Same parts as EmptyState from ui.tsx, with a solid, quieter edge
 * so it does not read as a dashed box inside a box.
 */
export function EmptyNote({
  icon,
  title,
  children,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="sn-empty border-solid border-line bg-sunken">
      {icon ? (
        <span className="sn-empty-icon">
          <Icon name={icon} />
        </span>
      ) : null}
      <h3 className="sn-empty-title">{title}</h3>
      {children ? <div className="sn-empty-body">{children}</div> : null}
    </div>
  );
}

/** A second task inside a panel, set off by a rule. Heading is h3. */
export function Divided({
  id,
  title,
  lead,
  children,
}: {
  id?: string;
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <div id={id} className="mt-8 grid scroll-mt-20 gap-4 border-t border-line pt-6">
      <div className="grid gap-1">
        <h3 className="text-body font-semibold text-ink">{title}</h3>
        {lead ? <p className="max-w-[65ch] text-body text-ink-soft">{lead}</p> : null}
      </div>
      {children}
    </div>
  );
}
