import type { BillingAdapter } from './types';

/**
 * Live billing through the Stripe API (Checkout for subscriptions, cancel at period end).
 * Not exercised against a live account in this build (see docs/decisions.md).
 */
export function stripeBilling(opts: {
  secretKey: string;
  priceId: string;
  appBaseUrl: string;
  fetchImpl?: typeof fetch;
}): BillingAdapter {
  const doFetch = opts.fetchImpl ?? fetch;
  const headers = (): Record<string, string> => ({
    Authorization: `Bearer ${opts.secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  });
  return {
    name: 'stripe',
    async startSubscription({ businessId, ownerEmail, stripeCustomerId }) {
      const params = new URLSearchParams({
        mode: 'subscription',
        'line_items[0][price]': opts.priceId,
        'line_items[0][quantity]': '1',
        success_url: `${opts.appBaseUrl}/settings?notice=Subscription+started`,
        cancel_url: `${opts.appBaseUrl}/settings?error=Checkout+cancelled`,
        client_reference_id: businessId,
      });
      if (stripeCustomerId) params.set('customer', stripeCustomerId);
      else params.set('customer_email', ownerEmail);
      const res = await doFetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: headers(),
        body: params,
        signal: AbortSignal.timeout(10_000),
      });
      const json = (await res.json()) as { url?: string; error?: { message?: string } };
      if (!res.ok || !json.url) throw new Error(`Stripe checkout failed: ${json.error?.message ?? res.status}`);
      return { kind: 'redirect', url: json.url };
    },
    async cancelAtPeriodEnd(stripeSubscriptionId) {
      if (!stripeSubscriptionId) throw new Error('No Stripe subscription to cancel');
      const res = await doFetch(`https://api.stripe.com/v1/subscriptions/${stripeSubscriptionId}`, {
        method: 'POST',
        headers: headers(),
        body: new URLSearchParams({ cancel_at_period_end: 'true' }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Stripe cancel failed (${res.status})`);
    },
  };
}
