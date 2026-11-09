import { decryptField } from '../crypto';
import { q, withTenant } from '../db';
import { cfg } from '../config';

/** Read-only queries for pages. Each one runs inside the tenant so RLS applies. */

export async function getBusinessProfile(businessId: string) {
  const rows = await withTenant(businessId, (tx) =>
    q<{
      name: string;
      industry: string;
      time_zone: string;
      postal_address: string;
      quiet_start_hour: number;
      quiet_end_hour: number;
      frequency_window_days: number;
      subscription_status: string;
      period_end: Date | null;
    }>(
      tx,
      `select name, industry, time_zone, postal_address, quiet_start_hour, quiet_end_hour,
              frequency_window_days, subscription_status, period_end
       from businesses where id = $1`,
      [businessId],
    ),
  );
  return rows[0] ?? null;
}

export async function getBusinessTimeZone(businessId: string): Promise<string> {
  const rows = await withTenant(businessId, (tx) =>
    q<{ time_zone: string }>(tx, 'select time_zone from businesses where id = $1', [businessId]),
  );
  return rows[0]?.time_zone ?? 'UTC';
}

export async function getAutomationRules(businessId: string) {
  return withTenant(businessId, (tx) =>
    q<{ visit_kind: 'service' | 'retail'; delay_minutes: number; enabled: boolean }>(
      tx,
      'select visit_kind, delay_minutes, enabled from automation_rules order by visit_kind',
    ),
  );
}

export async function getOnboardingState(businessId: string) {
  return withTenant(businessId, async (tx) => {
    const link = (
      await q<{ url: string; place_id: string | null; confirmed_at: Date | null }>(
        tx,
        'select url, place_id, confirmed_at from review_links where business_id = $1',
        [businessId],
      )
    )[0] ?? null;
    const sender = (
      await q<{ status: string; sender_number: string | null; fields: Record<string, string> }>(
        tx,
        'select status, sender_number, fields from sender_registrations where business_id = $1',
        [businessId],
      )
    )[0];
    const short = (await q<{ code: string }>(tx, 'select code from short_links where business_id = $1', [businessId]))[0];
    return { link, sender, shortCode: short?.code ?? null };
  });
}

export async function getQrTarget(businessId: string): Promise<{ url: string; shortUrl: string } | null> {
  const short = await withTenant(businessId, (tx) =>
    q<{ code: string }>(tx, 'select code from short_links where business_id = $1', [businessId]),
  );
  if (!short[0]) return null;
  const shortUrl = `${cfg().appBaseUrl}/r/${short[0].code}`;
  return { url: shortUrl, shortUrl };
}

export interface InboxItem {
  id: string;
  kind: 'reply' | 'message';
  channel: string;
  keyword: string | null;
  body: string;
  customerName: string | null;
  createdAt: Date;
  status: string | null;
}

export async function listInbox(businessId: string): Promise<InboxItem[]> {
  const rows = await withTenant(businessId, (tx) =>
    q<{
      id: string;
      kind: 'reply' | 'message';
      channel: string;
      keyword: string | null;
      body_enc: string | null;
      customer_first: string | null;
      created_at: Date;
      status: string | null;
    }>(
      tx,
      `(select i.id, 'reply' as kind, i.channel, i.keyword, i.body_enc,
              c.first_name_enc as customer_first, i.received_at as created_at, null::text as status
         from inbound_messages i left join customers c on c.id = i.customer_id)
       union all
       (select t.id, 'message' as kind, t.source as channel, null::text as keyword, t.body_enc,
               c.first_name_enc as customer_first, t.created_at, t.status
          from support_threads t left join customers c on c.id = t.customer_id)
       order by created_at desc
       limit 200`,
    ),
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    channel: r.channel,
    keyword: r.keyword,
    body: decryptField(r.body_enc) ?? '',
    customerName: decryptField(r.customer_first),
    createdAt: r.created_at,
    status: r.status,
  }));
}

export async function listCustomerOptions(businessId: string): Promise<{ id: string; name: string }[]> {
  const rows = await withTenant(businessId, (tx) =>
    q<{ id: string; first_name_enc: string | null }>(
      tx,
      'select id, first_name_enc from customers where deleted_at is null order by created_at desc limit 50',
    ),
  );
  return rows.map((r) => ({ id: r.id, name: decryptField(r.first_name_enc) ?? 'Customer' }));
}

export async function getImportBatch(businessId: string, batchId: string | null) {
  return withTenant(businessId, async (tx) => {
    const rows = batchId
      ? await q<{ id: string; filename: string; total_rows: number; created_rows: number; merged_rows: number; skipped_rows: number; errors: { line: number; message: string }[]; created_at: Date }>(
          tx,
          'select id, filename, total_rows, created_rows, merged_rows, skipped_rows, errors, created_at from import_batches where id = $1',
          [batchId],
        )
      : await q<{ id: string; filename: string; total_rows: number; created_rows: number; merged_rows: number; skipped_rows: number; errors: { line: number; message: string }[]; created_at: Date }>(
          tx,
          'select id, filename, total_rows, created_rows, merged_rows, skipped_rows, errors, created_at from import_batches order by created_at desc limit 1',
        );
    return rows[0] ?? null;
  });
}
