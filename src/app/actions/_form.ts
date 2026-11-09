import { redirect } from 'next/navigation';

/* Helpers for reading form fields. Not a server action module, so it is not exported to the client. */

export function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

export function flag(form: FormData, key: string): boolean {
  return form.get(key) === 'on';
}

export function int(form: FormData, key: string): number {
  const n = Number(text(form, key));
  return Number.isFinite(n) ? Math.trunc(n) : Number.NaN;
}

/** Sends the user back to a page with a flash message in the query string. */
export function back(path: string, message: string, kind: 'error' | 'notice' = 'error'): never {
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);
}
