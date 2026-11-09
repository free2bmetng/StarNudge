import { SendError, type SmsAdapter } from './types';

const PERMANENT_CODES = new Set([21211, 21212, 21214, 21217, 21408, 21614]);

/**
 * Live SMS through the Twilio REST API. Not exercised against a live account in this build
 * (see docs/decisions.md). Request shape and error mapping are covered by unit tests.
 */
export function twilioSms(opts: {
  accountSid: string;
  authToken: string;
  statusCallbackUrl: string;
  fetchImpl?: typeof fetch;
}): SmsAdapter {
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    name: 'twilio',
    async send({ to, from, body, clientRef }) {
      const params = new URLSearchParams({ To: to, From: from, Body: body });
      params.set('StatusCallback', opts.statusCallbackUrl);
      let res: Response;
      try {
        res = await doFetch(`https://api.twilio.com/2010-04-01/Accounts/${opts.accountSid}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${opts.accountSid}:${opts.authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params,
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new SendError('Network error or timeout while sending SMS', 'ambiguous', 'network');
      }
      const json = (await res.json().catch(() => ({}))) as { sid?: string; num_segments?: string; code?: number };
      if (res.status >= 500) throw new SendError(`Twilio server error ${res.status}`, 'ambiguous', String(res.status));
      if (res.status === 429) throw new SendError('Twilio rate limit', 'transient', '429');
      if (!res.ok || !json.sid) {
        const code = json.code ?? res.status;
        throw new SendError(`Twilio rejected the message (${code})`, 'permanent', String(code), PERMANENT_CODES.has(Number(code)));
      }
      void clientRef;
      return { providerMessageId: json.sid, segments: Number(json.num_segments ?? 1) };
    },
  };
}
