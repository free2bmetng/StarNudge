import { loadLocalEnv } from '../src/lib/load-env';
import { closeDb, pool, withTenant } from '../src/lib/db';
import { signUp, saveReviewLink, confirmReviewLink, submitSenderRegistration } from '../src/lib/services/accounts';
import { approveSender } from '../src/lib/services/sandbox-service';
import { createCustomer, recordVisit } from '../src/lib/services/customers';
import { recordOptOut } from '../src/lib/services/inbound';
import { hashContact } from '../src/lib/crypto';
import { normalizePhone } from '../src/lib/phone';

loadLocalEnv();

/*
 * Three demo businesses with fictional contacts only. Phone numbers use the 555-01XX range
 * and emails use example.com. Safe to run more than once: existing demo owners are skipped.
 */
const PASSWORD = 'demo-password-123';

const DEMOS = [
  { name: 'Harbor Street Kitchen', industry: 'restaurant', email: 'demo-restaurant@example.com', service: 'Dinner for two', start: 100 },
  { name: 'Studio Nine Salon', industry: 'salon', email: 'demo-salon@example.com', service: 'Haircut and color', start: 110 },
  { name: 'Ridge Plumbing Co', industry: 'home_services', email: 'demo-plumber@example.com', service: 'Drain repair', start: 120 },
] as const;

async function seedOne(demo: (typeof DEMOS)[number]): Promise<void> {
  const existing = await pool().query('select id from users where email = $1', [demo.email]);
  if ((existing.rowCount ?? 0) > 0) {
    console.log(`skip ${demo.name}: already seeded`);
    return;
  }
  const signed = await signUp({
    email: demo.email,
    password: PASSWORD,
    businessName: demo.name,
    industry: demo.industry,
    timeZone: 'America/New_York',
    postalAddress: '100 Demo Street, Springfield, NY 10001',
  });
  if (!signed.ok) throw new Error(`${demo.name}: ${signed.error}`);
  const { businessId, userId } = signed;

  const link = await saveReviewLink(businessId, userId, { placeId: `ChIJDemoPlace${demo.start}abc` });
  if (!link.ok) throw new Error(link.error);
  await confirmReviewLink(businessId, userId);
  await submitSenderRegistration(businessId, userId, {
    legalName: `${demo.name} LLC`,
    website: 'https://example.com',
    useCase: 'Asking recent customers to share a review of their visit.',
    sampleMessage: 'Hi there, thanks for visiting! Share your experience: https://example.com/r',
    consentDescription: 'Customers sign a paper intake form that includes a text consent line.',
  });
  await approveSender(businessId, userId);

  const at = new Date();
  const yesterday = new Date(at.getTime() - 24 * 3_600_000);
  const names = [['Maria', 'Lopez'], ['Sam', 'Rivera'], ['Priya', 'Shah']];
  for (let i = 0; i < names.length; i++) {
    const phone = `+1212555${String(demo.start + i).padStart(4, '0')}`;
    const created = await createCustomer(businessId, userId, {
      firstName: names[i][0],
      lastName: names[i][1],
      phone,
      email: '',
      language: 'en',
      smsConsentSource: 'Signed intake form (demo)',
      emailConsentSource: '',
    }, at);
    if (!created.ok) throw new Error(created.error);
    await recordVisit(businessId, userId, created.id, {
      serviceName: demo.service,
      visitType: 'service',
      completedAt: yesterday,
    }, at);
  }

  // One opted-out contact, so the demo shows opt-outs holding back sends.
  const optOutPhone = normalizePhone(`+1212555${String(demo.start + 9).padStart(4, '0')}`);
  const optOut = await createCustomer(businessId, userId, {
    firstName: 'Jordan',
    lastName: 'Demo',
    phone: optOutPhone?.e164 ?? '',
    email: '',
    language: 'en',
    smsConsentSource: 'Signed intake form (demo)',
    emailConsentSource: '',
  }, at);
  if (optOut.ok && optOutPhone) {
    await withTenant(businessId, (tx) =>
      recordOptOut(tx, businessId, optOut.id, 'sms', 'demo_seed', hashContact('phone', optOutPhone.e164), at),
    );
  }
  console.log(`seeded ${demo.name} (${demo.email} / ${PASSWORD})`);
}

async function main(): Promise<void> {
  for (const demo of DEMOS) await seedOne(demo);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
