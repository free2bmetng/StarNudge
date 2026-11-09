import { getBillingAdapter } from '../adapters';
import { pool, q, withTenant } from '../db';
import { mapStripeEvent } from '../stripe-events';
import { addDays } from '../time';
import { now as clockNow } from '../clock';
import { audit } from './audit';

export async function startSubscription(
  businessId: string,
  userId: string,
  now: Date = clockNow(),
): Promise<{ ok: true; kind: 'activated' } | { ok: true; kind: 'redirect'; url: string } | { ok: false; error: string }> {
  const rows = await withTenant(businessId, (tx) =>
    q<{ owner_email: string; stripe_customer_id: string | null; subscription_status: string }>(
      tx,
      `select u.email as owner_email, b.stripe_customer_id, b.subscription_status
       from businesses b
       join memberships m on m.business_id = b.id
       join users u on u.id = m.user_id
       where b.id = $1 order by m.created_at limit 1`,
      [businessId],
    ),
  );
  const biz = rows[0];
  if (!biz) return { ok: false, error: 'Business not found.' };
  if (biz.subscription_status === 'active') return { ok: false, error: 'Your subscription is already active.' };
  const result = await getBillingAdapter().startSubscription({
    businessId,
    ownerEmail: biz.owner_email,
    stripeCustomerId: biz.stripe_customer_id,
  });
  if (result.kind === 'activated') {
    await withTenant(businessId, async (tx) => {
      await tx.query(
        `update businesses set subscription_status = 'active', period_end = $2 where id = $1`,
        [businessId, addDays(now, 30)],
      );
      await audit(tx, businessId, `owner:${userId}`, 'billing.started', 'business', businessId);
    });
    return { ok: true, kind: 'activated' };
  }
  return { ok: true, kind: 'redirect', url: result.url };
}

export async function cancelSubscription(businessId: string, userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = await withTenant(businessId, (tx) =>
    q<{ stripe_subscription_id: string | null; subscription_status: string }>(
      tx,
      'select stripe_subscription_id, subscription_status from businesses where id = $1',
      [businessId],
    ),
  );
  const biz = rows[0];
  if (!biz || biz.subscription_status !== 'active') return { ok: false, error: 'There is no active subscription to cancel.' };
  try {
    await getBillingAdapter().cancelAtPeriodEnd(biz.stripe_subscription_id);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Cancellation failed. Try again.' };
  }
  await withTenant(businessId, async (tx) => {
    await tx.query(`update businesses set subscription_status = 'canceled_at_period_end' where id = $1`, [businessId]);
    await audit(tx, businessId, `owner:${userId}`, 'billing.cancel_at_period_end', 'business', businessId);
  });
  return { ok: true };
}

/** Stripe webhooks. Each event id is recorded once, so retries change nothing. */
export async function handleStripeEvent(
  event: { id: string; type: string; data: { object: Record<string, unknown> } },
  now: Date = clockNow(),
): Promise<'processed' | 'duplicate' | 'ignored' | 'unknown'> {
  const update = mapStripeEvent(event);
  if (update.kind === 'ignored') return 'ignored';

  if (update.kind === 'checkout_completed') {
    return withTenant(update.businessId, async (tx) => {
      const fresh = await tx.query(
        `insert into webhook_events (provider, event_id) values ('stripe', $1) on conflict do nothing returning 1`,
        [event.id],
      );
      if (fresh.rowCount === 0) return 'duplicate' as const;
      await tx.query(
        `update businesses set stripe_customer_id = $2, stripe_subscription_id = $3, subscription_status = 'active',
                period_end = $4 where id = $1`,
        [update.businessId, update.stripeCustomerId, update.stripeSubscriptionId, addDays(now, 30)],
      );
      await audit(tx, update.businessId, 'stripe', 'billing.checkout_completed', 'business', update.businessId);
      return 'processed' as const;
    });
  }

  const found = await q<{ business_id: string | null }>(pool(), 'select find_business_by_stripe_customer($1) as business_id', [update.stripeCustomerId]);
  const businessId = found[0]?.business_id;
  if (!businessId) return 'unknown';
  return withTenant(businessId, async (tx) => {
    const fresh = await tx.query(
      `insert into webhook_events (provider, event_id) values ('stripe', $1) on conflict do nothing returning 1`,
      [event.id],
    );
    if (fresh.rowCount === 0) return 'duplicate' as const;
    await tx.query(
      `update businesses set subscription_status = $2, period_end = $3, stripe_subscription_id = $4 where id = $1`,
      [businessId, update.status, update.periodEnd, update.stripeSubscriptionId],
    );
    await audit(tx, businessId, 'stripe', `billing.${update.status}`, 'business', businessId);
    return 'processed' as const;
  });
}
