import { SendError, type EmailAdapter } from './types';

/**
 * Live email through the Resend API. The clientRef is sent as Idempotency-Key.
 * Not exercised against a live account in this build (see docs/decisions.md).
 */
export function resendEmail(opts: { apiKey: string; fetchImpl?: typeof fetch }): EmailAdapter {
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    name: 'resend',
    async send({ to, from, subject, text, headers, clientRef }) {
      let res: Response;
      try {
        res = await doFetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${opts.apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': clientRef,
          },
          body: JSON.stringify({ from, to: [to], subject, text, headers }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new SendError('Network error or timeout while sending email', 'ambiguous', 'network');
      }
      const json = (await res.json().catch(() => ({}))) as { id?: string; name?: string };
      if (res.status >= 500) throw new SendError(`Resend server error ${res.status}`, 'ambiguous', String(res.status));
      if (res.status === 429) throw new SendError('Resend rate limit', 'transient', '429');
      if (!res.ok || !json.id) {
        throw new SendError(`Resend rejected the email (${json.name ?? res.status})`, 'permanent', json.name ?? String(res.status));
      }
      return { providerMessageId: json.id };
    },
  };
}
