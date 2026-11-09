import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, resetDb, createBusiness, addCustomer, tenantRows, NOON_NY } from '../helpers';
import { signUp, logIn, saveReviewLink, confirmReviewLink } from '@/lib/services/accounts';
import { createCustomer } from '@/lib/services/customers';
import { importCustomers } from '@/lib/services/imports';
import { getDashboard } from '@/lib/services/dashboard';

beforeEach(async () => {
  await resetDb();
});
afterAll(closeTestDb);

const good = {
  email: 'new-owner@example.com',
  password: 'long-enough-password',
  businessName: 'Corner Cuts',
  industry: 'salon',
  timeZone: 'America/Chicago',
  postalAddress: '12 Elm Street, Springfield, IL 62701',
};

describe('sign-up and log-in', () => {
  it('creates a business with the default templates, short link, and automation rules', async () => {
    const result = await signUp(good);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const templates = await tenantRows(result.businessId, 'select 1 from templates');
    expect(templates).toHaveLength(8);
    const links = await tenantRows(result.businessId, 'select code from short_links');
    expect(links).toHaveLength(1);
    const rules = await tenantRows(result.businessId, 'select visit_kind, delay_minutes from automation_rules order by visit_kind');
    expect(rules).toEqual([
      { visit_kind: 'retail', delay_minutes: 1440 },
      { visit_kind: 'service', delay_minutes: 180 },
    ]);
  });

  it('rejects weak or incomplete sign-ups with a plain message', async () => {
    expect(await signUp({ ...good, email: 'a@example.com', password: 'short' })).toMatchObject({ ok: false });
    expect(await signUp({ ...good, email: 'b@example.com', postalAddress: 'x' })).toMatchObject({ ok: false });
    expect(await signUp({ ...good, email: 'c@example.com', industry: 'casino' })).toMatchObject({ ok: false });
    expect(await signUp({ ...good, email: 'd@example.com', timeZone: 'Mars/Olympus' })).toMatchObject({ ok: false });
  });

  it('refuses a second account for the same email', async () => {
    await signUp(good);
    const again = await signUp(good);
    expect(again).toMatchObject({ ok: false, error: expect.stringMatching(/already exists/) });
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    await signUp(good);
    const wrong = await logIn(good.email, 'not-the-password');
    const unknown = await logIn('nobody@example.com', 'whatever-password');
    expect(wrong).toEqual(unknown);
    expect(wrong.ok).toBe(false);
  });

  it('logs in and finds the owner’s business', async () => {
    const signed = await signUp(good);
    if (!signed.ok) throw new Error(signed.error);
    const login = await logIn(good.email.toUpperCase(), good.password);
    expect(login).toMatchObject({ ok: true, businessId: signed.businessId, userId: signed.userId });
  });
});

describe('review link setup', () => {
  it('rejects links from unlisted hosts and http', async () => {
    const biz = await createBusiness();
    expect((await saveReviewLink(biz.businessId, biz.userId, { url: 'https://evil.example/review' })).ok).toBe(false);
    expect((await saveReviewLink(biz.businessId, biz.userId, { url: 'http://search.google.com/local/writereview?placeid=ChIJabcdefghijklmnop' })).ok).toBe(false);
  });

  it('a new link must be confirmed again before sending', async () => {
    const biz = await createBusiness();
    await saveReviewLink(biz.businessId, biz.userId, { placeId: 'ChIJabcdefghijklmnop' });
    expect((await confirmReviewLink(biz.businessId, biz.userId, NOON_NY)).ok).toBe(true);
    await saveReviewLink(biz.businessId, biz.userId, { placeId: 'ChIJzyxwvutsrqponmlk' });
    const rows = await tenantRows<{ confirmed_at: Date | null }>(biz.businessId, 'select confirmed_at from review_links');
    expect(rows[0].confirmed_at).toBeNull();
  });
});

describe('customer entry', () => {
  it('needs a phone or an email', async () => {
    const biz = await createBusiness();
    const r = await createCustomer(biz.businessId, biz.userId, {
      firstName: 'No', lastName: 'Contact', phone: '', email: '', language: 'en', smsConsentSource: '', emailConsentSource: '',
    }, NOON_NY);
    expect(r).toMatchObject({ ok: false });
  });

  it('text consent needs a US number', async () => {
    const biz = await createBusiness();
    const r = await createCustomer(biz.businessId, biz.userId, {
      firstName: 'Abroad', lastName: '', phone: '+442079460958', email: '', language: 'en', smsConsentSource: 'Form', emailConsentSource: '',
    }, NOON_NY);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/US phone number/) });
  });

  it('refuses a duplicate phone number', async () => {
    const biz = await createBusiness();
    await addCustomer(biz, { phone: '+12125550120' });
    const r = await createCustomer(biz.businessId, biz.userId, {
      firstName: 'Twin', lastName: '', phone: '(212) 555-0120', email: '', language: 'en', smsConsentSource: '', emailConsentSource: '',
    }, NOON_NY);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/already exists/) });
  });
});

describe('CSV import', () => {
  const header = 'first_name,last_name,phone,email,service_or_purchase,visit_date,consent_type,consent_source,consent_date';

  it('creates new customers, merges by phone, and flags email-only matches', async () => {
    const biz = await createBusiness();
    await addCustomer(biz, { phone: '+12125550121', email: 'taken@example.com' });
    const csv = [
      header,
      'Maria,Lopez,(212) 555-0122,,Cut,2026-11-08,sms_pew,Form,2026-11-08',
      'Sam,Rivera,(212) 555-0121,,Color,2026-11-08,,,',
      'Other,Person,,taken@example.com,Cut,2026-11-08,,,',
    ].join('\n');
    const summary = await importCustomers(biz.businessId, biz.userId, 'list.csv', csv, NOON_NY);
    expect(summary).toMatchObject({ ok: true, created: 1, merged: 1, skipped: 1 });
    if (!summary.ok) throw new Error('import failed');
    expect(summary.errors[0].message).toMatch(/another customer/);
    const visits = await tenantRows(biz.businessId, `select 1 from visits where source = 'import'`);
    expect(visits).toHaveLength(2);
  });

  it('re-importing the same file adds no duplicate visits', async () => {
    const biz = await createBusiness();
    const csv = [header, 'Maria,Lopez,(212) 555-0123,,Cut,2026-11-08,,,'].join('\n');
    await importCustomers(biz.businessId, biz.userId, 'a.csv', csv, NOON_NY);
    const again = await importCustomers(biz.businessId, biz.userId, 'a.csv', csv, NOON_NY);
    expect(again).toMatchObject({ ok: true, created: 0, skipped: 1 });
    const visits = await tenantRows(biz.businessId, 'select 1 from visits');
    expect(visits).toHaveLength(1);
  });
});

describe('dashboard', () => {
  it('suggests the next step for a new business', async () => {
    const biz = await createBusiness();
    const d = await getDashboard(biz.businessId, NOON_NY);
    expect(d.next.href).toBe('/onboarding');
    expect(d.delivered).toBe(0);
  });
});
