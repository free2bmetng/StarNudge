import { q, withTenant } from '../db';
import { addDays } from '../time';
import { now as clockNow } from '../clock';

export interface Dashboard {
  periodDays: number;
  sent: number;
  delivered: number | 'unknown';
  failed: number;
  optedOut: number;
  clicks: number;
  ownerReviews: number;
  customers: number;
  smsConsented: number;
  pending: number;
  requestsLastSevenDays: number;
  reviewLinkConfirmed: boolean;
  senderStatus: string;
  subscriptionStatus: string;
  next: { text: string; href: string; label: string };
}

export async function getDashboard(businessId: string, at: Date = clockNow()): Promise<Dashboard> {
  const since = addDays(at, -30);
  const sevenDaysAgo = addDays(at, -7);
  return withTenant(businessId, async (tx) => {
    const c = (
      await q<Record<string, number>>(
        tx,
        `select
           (select count(*)::int from review_requests where sent_at >= $1) as sent,
           (select count(*)::int from review_requests where delivered_at >= $1) as delivered,
           (select count(*)::int from messages where kind = 'review_request' and status in ('delivered','undelivered') and updated_at >= $1) as receipts,
           (select count(*)::int from review_requests where status = 'failed' and updated_at >= $1) as failed,
           (select count(*)::int from opt_outs where created_at >= $1) as opted_out,
           (select count(*)::int from short_link_clicks where clicked_at >= $1) as clicks,
           (select count(*)::int from owner_logged_reviews where logged_at >= $1) as owner_reviews,
           (select count(*)::int from customers where deleted_at is null) as customers,
           (select count(*)::int from consents k join customers cu on cu.id = k.customer_id
              where k.type = 'sms_pew' and k.revoked_at is null and cu.deleted_at is null) as sms_consented,
           (select count(*)::int from review_requests where status in ('queued','deferred')) as pending,
           (select count(*)::int from review_requests where created_at >= $2) as requests_7d`,
        [since, sevenDaysAgo],
      )
    )[0];
    const link = await q<{ confirmed_at: Date | null }>(tx, 'select confirmed_at from review_links where business_id = $1', [businessId]);
    const sender = await q<{ status: string }>(tx, 'select status from sender_registrations where business_id = $1', [businessId]);
    const biz = await q<{ subscription_status: string }>(tx, 'select subscription_status from businesses where id = $1', [businessId]);

    const reviewLinkConfirmed = Boolean(link[0]?.confirmed_at);
    const senderStatus = sender[0]?.status ?? 'not_started';
    const subscriptionStatus = biz[0]?.subscription_status ?? 'none';
    const delivered = c.sent > 0 && c.receipts === 0 ? 'unknown' : c.delivered;

    let next: Dashboard['next'];
    if (!reviewLinkConfirmed) {
      next = { text: 'Confirm your Google review link. Nothing sends until it is confirmed.', href: '/onboarding', label: 'Set up review link' };
    } else if (senderStatus !== 'approved' && c.sms_consented > 0) {
      next = {
        text: `Your SMS sender is ${senderStatus.replace('_', ' ')}. Text requests wait until it is approved.`,
        href: '/onboarding',
        label: 'Check sender',
      };
    } else if (c.customers === 0) {
      next = { text: 'Add your first customer or import a CSV file.', href: '/customers', label: 'Add customers' };
    } else if (c.requests_7d === 0) {
      next = { text: 'No requests in 7 days. Add customers or turn on automations.', href: '/customers', label: 'Add customers' };
    } else {
      next = { text: 'Requests are going out. Check the inbox for replies from customers.', href: '/inbox', label: 'Open inbox' };
    }

    return {
      periodDays: 30,
      sent: c.sent,
      delivered,
      failed: c.failed,
      optedOut: c.opted_out,
      clicks: c.clicks,
      ownerReviews: c.owner_reviews,
      customers: c.customers,
      smsConsented: c.sms_consented,
      pending: c.pending,
      requestsLastSevenDays: c.requests_7d,
      reviewLinkConfirmed,
      senderStatus,
      subscriptionStatus,
      next,
    };
  });
}
