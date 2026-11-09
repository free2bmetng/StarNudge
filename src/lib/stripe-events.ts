export type BillingStatus = 'active' | 'canceled_at_period_end' | 'canceled';

export type BillingUpdate =
  | {
      kind: 'checkout_completed';
      businessId: string;
      stripeCustomerId: string;
      stripeSubscriptionId: string | null;
    }
  | {
      kind: 'subscription_changed';
      stripeCustomerId: string;
      stripeSubscriptionId: string;
      status: BillingStatus;
      periodEnd: Date | null;
    }
  | { kind: 'ignored' };

interface StripeEvent {
  type: string;
  data: { object: Record<string, unknown> };
}

/** Maps the Stripe events we use onto local billing state. Pure, so it can be tested without Stripe. */
export function mapStripeEvent(event: StripeEvent): BillingUpdate {
  const obj = event.data.object;
  if (event.type === 'checkout.session.completed') {
    const businessId = obj.client_reference_id;
    const customer = obj.customer;
    if (typeof businessId !== 'string' || typeof customer !== 'string') return { kind: 'ignored' };
    return {
      kind: 'checkout_completed',
      businessId,
      stripeCustomerId: customer,
      stripeSubscriptionId: typeof obj.subscription === 'string' ? obj.subscription : null,
    };
  }
  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const customer = obj.customer;
    const subscription = obj.id;
    if (typeof customer !== 'string' || typeof subscription !== 'string') return { kind: 'ignored' };
    let status: BillingStatus = 'active';
    if (event.type === 'customer.subscription.deleted' || obj.status === 'canceled') status = 'canceled';
    else if (obj.cancel_at_period_end === true) status = 'canceled_at_period_end';
    const periodEnd = typeof obj.current_period_end === 'number' ? new Date(obj.current_period_end * 1000) : null;
    return { kind: 'subscription_changed', stripeCustomerId: customer, stripeSubscriptionId: subscription, status, periodEnd };
  }
  return { kind: 'ignored' };
}
