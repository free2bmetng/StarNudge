'use server';

import { redirect } from 'next/navigation';
import { submitContact } from '@/lib/services/inbound';
import { back, text } from './_form';

/** Public contact form linked from every message. Deliberately needs no login. */
export async function submitContactAction(form: FormData): Promise<void> {
  const code = text(form, 'code');
  const result = await submitContact(code, text(form, 'message'), text(form, 'replyTo'));
  if (!result.ok) back(`/contact/${encodeURIComponent(code)}`, result.error);
  redirect(`/contact/${encodeURIComponent(code)}?sent=1`);
}
