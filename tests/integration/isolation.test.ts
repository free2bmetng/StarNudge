import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool, withTenant } from '@/lib/db';
import { resetDb, closeTestDb, createBusiness, addCustomer, tenantRows } from '../helpers';

beforeEach(async () => {
  await resetDb();
});
afterAll(closeTestDb);

describe('tenant isolation (row-level security)', () => {
  it('a business only sees its own customers', async () => {
    const a = await createBusiness();
    const b = await createBusiness();
    await addCustomer(a, { firstName: 'Alice', phone: '+12125550101' });
    await addCustomer(b, { firstName: 'Bob', phone: '+12125550102' });

    const seenByA = await tenantRows<{ first_name_enc: string }>(a.businessId, 'select first_name_enc from customers');
    const seenByB = await tenantRows<{ first_name_enc: string }>(b.businessId, 'select first_name_enc from customers');
    expect(seenByA).toHaveLength(1);
    expect(seenByB).toHaveLength(1);
    expect(seenByA[0].first_name_enc).not.toBe(seenByB[0].first_name_enc);
  });

  it('without a tenant set, the runtime role sees no tenant rows at all', async () => {
    const a = await createBusiness();
    await addCustomer(a, { phone: '+12125550103' });
    const res = await pool().query('select count(*)::int as n from customers');
    expect(res.rows[0].n).toBe(0);
  });

  it('cannot update another business’s rows', async () => {
    const a = await createBusiness();
    const b = await createBusiness();
    const bCustomer = await addCustomer(b, { phone: '+12125550104' });
    const updated = await withTenant(a.businessId, async (tx) =>
      (await tx.query('update customers set language = $2 where id = $1', [bCustomer, 'es'])).rowCount,
    );
    expect(updated).toBe(0);
  });

  it('cannot insert a row that claims another business', async () => {
    const a = await createBusiness();
    const b = await createBusiness();
    await expect(
      withTenant(a.businessId, (tx) =>
        tx.query(
          `insert into audit_log (business_id, actor, action, entity) values ($1, 'x', 'forged', 'customer')`,
          [b.businessId],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('the tenant setting does not leak to the next use of a pooled connection', async () => {
    const a = await createBusiness();
    await addCustomer(a, { phone: '+12125550105' });
    await withTenant(a.businessId, async (tx) => tx.query('select 1'));
    const after = await pool().query('select count(*)::int as n from customers');
    expect(after.rows[0].n).toBe(0);
  });
});
