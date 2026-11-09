import { describe, expect, it } from 'vitest';
import { twilioSms } from '@/lib/adapters/twilio';
import { resendEmail } from '@/lib/adapters/resend';
import { SendError } from '@/lib/adapters/types';

/** Builds a fetch stub that returns the given status and JSON body. */
function stubFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as typeof fetch;
}

function failingFetch(): typeof fetch {
  return (async () => {
    throw new Error('socket hang up');
  }) as typeof fetch;
}

const sms = { to: '+12125550100', from: '+12125550150', body: 'Hi', clientRef: 'ref-1' };

describe('Twilio adapter error mapping', () => {
  const adapter = (fetchImpl: typeof fetch) =>
    twilioSms({ accountSid: 'AC123', authToken: 'tok', statusCallbackUrl: 'https://app.example/api/webhooks/sms', fetchImpl });

  it('returns the provider id and segment count on success', async () => {
    const result = await adapter(stubFetch(201, { sid: 'SM1', num_segments: '2' })).send(sms);
    expect(result).toEqual({ providerMessageId: 'SM1', segments: 2 });
  });

  it('treats a rate limit as transient (safe to retry)', async () => {
    await expect(adapter(stubFetch(429, {})).send(sms)).rejects.toMatchObject({ kind: 'transient' });
  });

  it('treats a server error as ambiguous (never retried automatically)', async () => {
    await expect(adapter(stubFetch(503, {})).send(sms)).rejects.toMatchObject({ kind: 'ambiguous' });
  });

  it('treats a network failure as ambiguous', async () => {
    await expect(adapter(failingFetch()).send(sms)).rejects.toBeInstanceOf(SendError);
    await expect(adapter(failingFetch()).send(sms)).rejects.toMatchObject({ kind: 'ambiguous' });
  });

  it('flags an invalid number as permanent and as a contact problem', async () => {
    const err = await adapter(stubFetch(400, { code: 21211 })).send(sms).catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: 'permanent', contactInvalid: true, code: '21211' });
  });

  it('sends the status callback and basic auth', async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const spy = (async (url: string, init: RequestInit) => {
      captured = { url, init };
      return new Response(JSON.stringify({ sid: 'SM2' }), { status: 201 });
    }) as typeof fetch;
    await adapter(spy).send(sms);
    expect(captured).not.toBeNull();
    const c = captured as unknown as { url: string; init: RequestInit };
    expect(c.url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
    expect((c.init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('AC123:tok').toString('base64')}`);
    expect(String(c.init.body)).toContain('StatusCallback=https%3A%2F%2Fapp.example%2Fapi%2Fwebhooks%2Fsms');
  });
});

describe('Resend adapter error mapping', () => {
  const adapter = (fetchImpl: typeof fetch) => resendEmail({ apiKey: 're_test', fetchImpl });
  const email = { to: 'a@example.com', from: 'StarNudge <n@example.com>', subject: 'Hi', text: 'Body', headers: {}, clientRef: 'ref-2' };

  it('returns the message id on success', async () => {
    expect(await adapter(stubFetch(200, { id: 'em_1' })).send(email)).toEqual({ providerMessageId: 'em_1' });
  });

  it('sends the client reference as the idempotency key', async () => {
    let key: string | undefined;
    const spy = (async (_url: string, init: RequestInit) => {
      key = (init.headers as Record<string, string>)['Idempotency-Key'];
      return new Response(JSON.stringify({ id: 'em_2' }), { status: 200 });
    }) as typeof fetch;
    await adapter(spy).send(email);
    expect(key).toBe('ref-2');
  });

  it('maps a 500 to ambiguous and a rejected address to permanent', async () => {
    await expect(adapter(stubFetch(500, {})).send(email)).rejects.toMatchObject({ kind: 'ambiguous' });
    await expect(adapter(stubFetch(422, { name: 'validation_error' })).send(email)).rejects.toMatchObject({ kind: 'permanent' });
  });
});
