import { pool, q, withTenant } from '@/lib/db';
import { checkReviewUrl } from '@/lib/review-link';

export const dynamic = 'force-dynamic';

/**
 * The one app short link for a business. Every customer gets the same link (rule R1).
 * Records a click, then sends the browser to the review link.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const { code } = await params;
  const found = await q<{ business_id: string | null; short_link_id: string | null }>(
    pool(),
    'select business_id, short_link_id from find_short_link($1)',
    [code],
  );
  const row = found[0];
  if (!row?.business_id || !row.short_link_id) return new Response('Not found', { status: 404 });
  const businessId = row.business_id;
  const target = await withTenant(businessId, async (tx) => {
    await tx.query('insert into short_link_clicks (business_id, short_link_id) values ($1, $2)', [businessId, row.short_link_id]);
    const links = await q<{ url: string; confirmed_at: Date | null }>(
      tx,
      'select url, confirmed_at from review_links where business_id = $1',
      [businessId],
    );
    return links[0] ?? null;
  });
  if (!target || !target.confirmed_at) return new Response('Not available', { status: 404 });
  const check = checkReviewUrl(target.url);
  if (!check.ok) return new Response('Not available', { status: 404 });
  return Response.redirect(check.url, 302);
}
