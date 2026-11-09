import Link from 'next/link';
import type { ReactNode } from 'react';
import { isSandboxMode } from '@/lib/config';
import { logOutAction } from '@/app/actions/auth';

export const inputClass =
  'w-full rounded-md border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 placeholder:text-stone-500';
export const buttonClass =
  'inline-flex items-center justify-center rounded-md bg-stone-900 px-4 py-2.5 text-base font-medium text-white hover:bg-stone-700';
export const secondaryButtonClass =
  'inline-flex items-center justify-center rounded-md border border-stone-400 bg-white px-4 py-2.5 text-base font-medium text-stone-900 hover:bg-stone-100';
export const dangerButtonClass =
  'inline-flex items-center justify-center rounded-md bg-red-800 px-4 py-2.5 text-base font-medium text-white hover:bg-red-700';
export const cardClass = 'rounded-lg border border-stone-200 bg-white p-4 sm:p-5';
export const labelClass = 'mb-1 block text-base font-medium text-stone-800';
export const hintClass = 'mt-1 text-sm text-stone-600';

export function Flash({ error, notice }: { error?: string; notice?: string }) {
  if (!error && !notice) return null;
  return (
    <div className="mb-4 space-y-2">
      {error ? (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-base text-red-900">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-base text-emerald-900">
          {notice}
        </p>
      ) : null}
    </div>
  );
}

export function PageTitle({ children, lead }: { children: ReactNode; lead?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-semibold text-stone-900">{children}</h1>
      {lead ? <p className="mt-1 text-base text-stone-700">{lead}</p> : null}
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={`${cardClass} mb-4`} aria-labelledby={`s-${title.replace(/\W+/g, '-').toLowerCase()}`}>
      <h2 id={`s-${title.replace(/\W+/g, '-').toLowerCase()}`} className="mb-3 text-lg font-semibold text-stone-900">
        {title}
      </h2>
      {children}
    </section>
  );
}

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/customers', label: 'Customers' },
  { href: '/templates', label: 'Templates' },
  { href: '/inbox', label: 'Inbox' },
  { href: '/settings', label: 'Settings' },
  { href: '/qr', label: 'QR code' },
];

export function Shell({ children }: { children: ReactNode }) {
  const sandbox = isSandboxMode();
  const nav = sandbox ? [...NAV, { href: '/sandbox', label: 'Sandbox' }] : NAV;
  return (
    <div className="min-h-screen">
      {sandbox ? (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900">
          SANDBOX: no real texts or emails are sent.
        </div>
      ) : null}
      <header className="border-b border-stone-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <Link href="/dashboard" className="text-lg font-semibold text-stone-900">
            StarNudge
          </Link>
          <form action={logOutAction}>
            <button type="submit" className="text-base text-stone-800 underline">
              Log out
            </button>
          </form>
        </div>
        <nav aria-label="Main" className="mx-auto mt-2 flex max-w-3xl flex-wrap gap-x-4 gap-y-1">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="text-base text-stone-800 underline-offset-2 hover:underline">
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}

export function Public({ children }: { children: ReactNode }) {
  const sandbox = isSandboxMode();
  return (
    <div className="min-h-screen">
      {sandbox ? (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900">
          SANDBOX: no real texts or emails are sent.
        </div>
      ) : null}
      <header className="border-b border-stone-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/" className="text-lg font-semibold text-stone-900">
            StarNudge
          </Link>
          <Link href="/privacy" className="text-base text-stone-800 underline">
            Privacy
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 py-8">{children}</main>
    </div>
  );
}

export function param(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
