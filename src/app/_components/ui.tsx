import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { isSandboxMode } from '@/lib/config';
import { logOutAction } from '@/app/actions/auth';
import { Icon, IconStar, type IconName } from './icons';
import { MoreMenu, SidebarNav, TabBar, type NavGroup, type NavItem } from './nav';

/*
 * Class strings. Pages may add Tailwind utilities to these (utilities win over component classes).
 * The .sn-* classes live in globals.css.
 */
export const buttonClass = 'sn-button sn-button-primary';
export const secondaryButtonClass = 'sn-button sn-button-secondary';
export const dangerButtonClass = 'sn-button sn-button-danger';
export const quietButtonClass = 'sn-button sn-button-quiet';
export const inputClass = 'sn-field';
export const cardClass = 'sn-card';
export const labelClass = 'sn-label';
export const hintClass = 'sn-hint';

function join(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* ---------------------------------------------------------------- Controls */

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'quiet';

const buttonVariantClass: Record<ButtonVariant, string> = {
  primary: buttonClass,
  secondary: secondaryButtonClass,
  danger: dangerButtonClass,
  quiet: quietButtonClass,
};

/** A button with the design-system styles. Pass type="submit" inside forms. Native default is submit. */
export function Button({
  variant = 'primary',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={join(buttonVariantClass[variant], className)} {...rest} />;
}

type BadgeTone = 'neutral' | 'accent' | 'good' | 'warn' | 'crit';

const badgeDefaultIcon: Record<BadgeTone, IconName | null> = {
  neutral: null,
  accent: null,
  good: 'check',
  warn: 'alert',
  crit: 'xcircle',
};

/** A status label. The icon and the words carry the meaning, so colour is never the only signal. */
export function Badge({
  tone = 'neutral',
  icon,
  children,
}: {
  tone?: BadgeTone;
  icon?: IconName | null;
  children: ReactNode;
}) {
  const glyph = icon === undefined ? badgeDefaultIcon[tone] : icon;
  return (
    <span className={`sn-badge sn-badge-${tone}`}>
      {glyph ? <Icon name={glyph} /> : null}
      <span>{children}</span>
    </span>
  );
}

/* ----------------------------------------------------------- Surfaces */

/** A plain surface for content that holds a decision or a group of fields. */
export function Card({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article';
}) {
  return <Tag className={join(cardClass, className)}>{children}</Tag>;
}

type StatTone = 'default' | 'good' | 'warn' | 'crit';

/** A figure with its label. Numbers get thousands separators and tabular numerals. */
export function StatTile({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatTone;
}) {
  const display = typeof value === 'number' ? value.toLocaleString('en-US') : value;
  return (
    <div className={join('sn-stat', tone !== 'default' ? `sn-stat-${tone}` : undefined)}>
      <p className="sn-stat-label">{label}</p>
      <p className="sn-stat-value">{display}</p>
      {hint ? <p className="sn-stat-hint">{hint}</p> : null}
    </div>
  );
}

/** A designed empty list: what will appear here, and how to add the first item. */
export function EmptyState({
  title,
  children,
  action,
  icon,
  level = 3,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  icon?: IconName;
  level?: 2 | 3 | 4;
}) {
  const Heading: 'h2' | 'h3' | 'h4' = level === 2 ? 'h2' : level === 4 ? 'h4' : 'h3';
  return (
    <div className="sn-empty">
      {icon ? (
        <span className="sn-empty-icon">
          <Icon name={icon} />
        </span>
      ) : null}
      <Heading className="sn-empty-title">{title}</Heading>
      {children ? <div className="sn-empty-body">{children}</div> : null}
      {action ? <div className="sn-empty-action">{action}</div> : null}
    </div>
  );
}

export function Flash({ error, notice }: { error?: string; notice?: string }) {
  if (!error && !notice) return null;
  return (
    <div className="sn-flash-stack">
      {error ? (
        <p role="alert" className="sn-flash sn-flash-error">
          <Icon name="alert" />
          <span>{error}</span>
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="sn-flash sn-flash-notice">
          <Icon name="check" />
          <span>{notice}</span>
        </p>
      ) : null}
    </div>
  );
}

export function PageTitle({ children, lead }: { children: ReactNode; lead?: string }) {
  return (
    <div className="sn-page-head">
      <h1 className="sn-page-title">{children}</h1>
      {lead ? <p className="sn-page-lead">{lead}</p> : null}
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = `s-${title.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <section className={join(cardClass, 'sn-section')} aria-labelledby={id}>
      <h2 id={id} className="sn-section-heading">
        {title}
      </h2>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------- Shell */

const NAV = {
  dashboard: { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  customers: { href: '/customers', label: 'Customers', icon: 'customers' },
  inbox: { href: '/inbox', label: 'Inbox', icon: 'inbox' },
  templates: { href: '/templates', label: 'Templates', icon: 'templates' },
  settings: { href: '/settings', label: 'Settings', icon: 'settings' },
  qr: { href: '/qr', label: 'QR code', icon: 'qr' },
  sandbox: { href: '/sandbox', label: 'Sandbox', icon: 'sandbox' },
} satisfies Record<string, NavItem>;

/* Phone tab bar: exactly these five destinations, in this order. */
const TAB_ITEMS: NavItem[] = [NAV.dashboard, NAV.customers, NAV.inbox, NAV.templates, NAV.settings];

function Brand({ href }: { href: string }) {
  return (
    <Link href={href} className="sn-brand">
      <span className="sn-brand-mark" aria-hidden="true">
        <IconStar fill="currentColor" />
      </span>
      <span className="sn-brand-word">StarNudge</span>
    </Link>
  );
}

function LogOutForm() {
  return (
    <form action={logOutAction}>
      <button type="submit" className={quietButtonClass}>
        Log out
      </button>
    </form>
  );
}

function SandboxBanner() {
  return (
    <div className="sn-sandbox">
      <Icon name="alert" />
      <span>SANDBOX: no real texts or emails are sent.</span>
    </div>
  );
}

function SkipLink() {
  return (
    <a href="#main-content" className="sn-skip-link">
      Skip to content
    </a>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const sandbox = isSandboxMode();
  const groups: NavGroup[] = [
    { label: 'Work', items: [NAV.dashboard, NAV.customers, NAV.inbox] },
    {
      label: 'Setup',
      items: [NAV.templates, NAV.qr, NAV.settings],
    },
  ];
  if (sandbox) groups.push({ label: 'Testing', items: [NAV.sandbox] });
  const overflow: NavItem[] = sandbox ? [NAV.qr, NAV.sandbox] : [NAV.qr];

  return (
    <div className="sn-app">
      <SkipLink />
      <SidebarNav brand={<Brand href="/dashboard" />} groups={groups} footer={<LogOutForm />} />
      <div className="sn-column">
        {sandbox ? <SandboxBanner /> : null}
        <header className="sn-topbar">
          <div className="sn-topbar-inner">
            <Brand href="/dashboard" />
            <div className="sn-topbar-actions">
              <LogOutForm />
              <MoreMenu items={overflow} />
            </div>
          </div>
        </header>
        <main id="main-content" className="sn-content">
          {children}
        </main>
        <TabBar items={TAB_ITEMS} />
      </div>
    </div>
  );
}

/* Signed-out pages: header, one centred column, 360px and up. */
export function Public({ children }: { children: ReactNode }) {
  const sandbox = isSandboxMode();
  return (
    <div className="sn-public">
      <SkipLink />
      {sandbox ? <SandboxBanner /> : null}
      <header className="sn-public-header">
        <div className="sn-public-bar">
          <Brand href="/" />
          <Link href="/privacy" className="sn-header-link">
            Privacy
          </Link>
        </div>
      </header>
      <main id="main-content" className="sn-public-main">
        {children}
      </main>
    </div>
  );
}

export function param(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
