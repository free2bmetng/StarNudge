import type { ReactNode } from 'react';
import { Badge, cardClass } from '@/app/_components/ui';
import { Icon } from '@/app/_components/icons';

/*
 * Primitives for the setup and settings pages. Colour comes from the tokens in globals.css,
 * so light and dark themes follow the same rules. A state is always shown as a word, never colour alone.
 */

export type StepState = 'done' | 'current' | 'waiting';
export type Tone = 'neutral' | 'accent' | 'good' | 'warn' | 'crit';

const STATE_WORD: Record<StepState, string> = { done: 'Done', current: 'Current', waiting: 'Waiting' };

const MARKER_CLASS: Record<StepState, string> = {
  done: 'bg-good text-surface',
  current: 'bg-accent text-accent-ink',
  waiting: 'border border-line-strong bg-surface text-ink-soft',
};

/* A bar along the top edge of a card. The current step also lifts, because it holds the decision. */
const STEP_EDGE: Record<StepState, string> = {
  done: '[box-shadow:inset_0_3px_0_var(--good),var(--elev-rest)]',
  current: '[box-shadow:inset_0_3px_0_var(--accent),var(--elev-raised)]',
  waiting: '',
};

/** The state of a step as a badge. Done has a check, waiting has a clock. */
export function StateBadge({ state }: { state: StepState }) {
  if (state === 'done') return <Badge tone="good">Done</Badge>;
  if (state === 'current') return <Badge tone="accent" icon={null}>Current</Badge>;
  return <Badge tone="neutral" icon="clock">Waiting</Badge>;
}

function StepMarker({ n, state }: { n: number; state: StepState }) {
  return (
    <span
      aria-hidden="true"
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-pill text-body font-semibold ${MARKER_CLASS[state]}`}
    >
      {state === 'done' ? <Icon name="check" className="text-title" /> : n}
    </span>
  );
}

/** Progress through the setup steps: a count, then one marker per step joined by a line. */
export function SetupProgress({ steps }: { steps: { label: string; state: StepState }[] }) {
  const done = steps.filter((step) => step.state === 'done').length;
  return (
    <div className="grid gap-3">
      <p className="m-0 font-semibold text-ink-soft">
        {done} of {steps.length} steps done
      </p>
      <ol aria-label="Setup progress" className="m-0 grid list-none grid-cols-3 gap-x-3 p-0">
        {steps.map((step, i) => {
          const last = i === steps.length - 1;
          return (
            <li
              key={step.label}
              aria-current={step.state === 'current' ? 'step' : undefined}
              className="flex min-w-0 flex-col gap-2"
            >
              <div className="flex items-center">
                <StepMarker n={i + 1} state={step.state} />
                {last ? null : (
                  <span
                    aria-hidden="true"
                    className={`ml-2 h-0.5 min-w-4 flex-1 rounded-pill ${step.state === 'done' ? 'bg-good' : 'bg-line-strong'}`}
                  />
                )}
              </div>
              <p className="m-0 text-meta text-ink-soft">{STATE_WORD[step.state]}</p>
              <p className="m-0 font-semibold leading-snug text-ink">{step.label}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** One numbered step of the setup. The body lines up with the title, and on phones it sits below it. */
export function StepCard({
  n,
  total,
  title,
  state,
  children,
}: {
  n: number;
  total: number;
  title: string;
  state: StepState;
  children: ReactNode;
}) {
  const id = `step-${n}-title`;
  return (
    <section aria-labelledby={id} data-state={state} className={`${cardClass} ${STEP_EDGE[state]}`}>
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <StepMarker n={n} state={state} />
          <h2 id={id} className="sn-section-heading mb-0 min-w-0">
            <span className="sr-only">Step {n} of {total}: </span>
            {title}
          </h2>
        </div>
        <StateBadge state={state} />
      </header>
      <div className="mt-4 sm:pl-12">{children}</div>
    </section>
  );
}

/** A group of related fields in a form. The legend names the group, and groups are divided by a rule. */
export function FieldGroup({ legend, children }: { legend: string; children: ReactNode }) {
  // The rule sits on a wrapper, not on the fieldset: a legend would otherwise break the fieldset's own border.
  return (
    <div className="border-t border-line pt-6 first:border-t-0 first:pt-0">
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-4 p-0 text-body font-semibold text-ink">{legend}</legend>
        <div className="grid gap-4">{children}</div>
      </fieldset>
    </div>
  );
}

/** The danger area. It is set apart by a red border and fill, and it names the action it contains. */
export function DangerZone({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-6 rounded-card border border-crit bg-crit-soft p-4 sm:p-6">
      <p className="m-0 text-meta font-semibold text-crit">Danger zone</p>
      <h3 id={id} className="m-0 mt-1 text-body font-semibold text-ink">
        {title}
      </h3>
      <div className="mt-2 max-w-prose text-ink">{children}</div>
    </section>
  );
}

/** A label and value per row, as a definition list. */
export function StatusList({ children }: { children: ReactNode }) {
  return <dl className="m-0 divide-y divide-line">{children}</dl>;
}

export function StatusRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="m-0 min-w-0 text-ink sm:text-right">{children}</dd>
    </div>
  );
}

const SENDER: Record<string, { label: string; tone: Tone; icon?: 'clock' }> = {
  not_started: { label: 'Not started', tone: 'neutral' },
  submitted: { label: 'Submitted', tone: 'accent', icon: 'clock' },
  pending: { label: 'Pending approval', tone: 'accent', icon: 'clock' },
  approved: { label: 'Approved', tone: 'good' },
  rejected: { label: 'Rejected', tone: 'crit' },
};

/** The text sender's registration status. */
export function SenderBadge({ status }: { status: string }) {
  const entry = SENDER[status];
  if (!entry) return <Badge>{status.replace(/_/g, ' ')}</Badge>;
  return (
    <Badge tone={entry.tone} icon={entry.icon}>
      {entry.label}
    </Badge>
  );
}
