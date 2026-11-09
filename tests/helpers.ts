import { Client } from 'pg';
import { closeDb, pool, withTenant } from '../src/lib/db';
import { signUp } from '../src/lib/services/accounts';
import { confirmReviewLink, saveReviewLink, submitSenderRegistration, type SenderFields } from '../src/lib/services/accounts';
import { approveSender } from '../src/lib/services/sandbox-service';
import { createCustomer, recordVisit, type CustomerInput } from '../src/lib/services/customers';

export const TEST_ADMIN_URL = process.env.MIGRATION_DATABASE_URL ?? 'postgres://postgres@localhost:5432/starnudge_test';

/** A fixed reference instant: noon in New York on a Monday. Keeps quiet hours deterministic. */
export const NOON_NY = new Date('2026-11-09T17:00:00.000Z');

/** Empties every table and restarts sequences. Runs as the owner, since the runtime role cannot truncate. */
export async function resetDb(): Promise<void> {
  const client = new Client({ connectionString: TEST_ADMIN_URL });
  await client.connect();
  try {
    await client.query(
      'truncate table users, businesses, webhook_events, import_batches restart identity cascade',
    );
    await client.query('alter sequence sandbox_sender_seq restart with 150');
  } finally {
    await client.end();
  }
}

export async function closeTestDb(): Promise<void> {
  await closeDb();
}

/**
 * A fixed-offset zone (Etc/GMT±N) in which the local hour is 12 right now.
 * Lets worker tests use the real clock without depending on the hour they run at.
 */
export function zoneWhereItIsNoon(at: Date = new Date()): string {
  const utcHour = at.getUTCHours();
  let offset = (((12 - utcHour) % 24) + 24) % 24;
  if (offset > 12) offset -= 24;
  if (offset === 0) return 'Etc/UTC';
  return offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
}

export interface TestBusiness {
  businessId: string;
  userId: string;
  email: string;
}

let counter = 0;

/** Creates a business through the real signup service, with a unique owner email. */
export async function createBusiness(overrides: { industry?: string; timeZone?: string } = {}): Promise<TestBusiness> {
  counter += 1;
  const email = `owner${counter}-${Date.now()}@example.com`;
  const result = await signUp({
    email,
    password: 'correct-horse-battery',
    businessName: `Test Business ${counter}`,
    industry: overrides.industry ?? 'restaurant',
    timeZone: overrides.timeZone ?? 'America/New_York',
    postalAddress: '100 Main Street, Springfield, NY 10001',
  });
  if (!result.ok) throw new Error(`signup failed: ${result.error}`);
  return { businessId: result.businessId, userId: result.userId, email };
}

/** Business that can send: review link confirmed and SMS sender approved in the sandbox. */
export async function readyBusiness(overrides: { industry?: string; timeZone?: string } = {}): Promise<TestBusiness> {
  const biz = await createBusiness(overrides);
  const link = await saveReviewLink(biz.businessId, biz.userId, { placeId: 'ChIJTestPlaceId000001' });
  if (!link.ok) throw new Error(link.error);
  await confirmReviewLink(biz.businessId, biz.userId, NOON_NY);
  const fields: SenderFields = {
    legalName: 'Test Business LLC',
    website: 'https://example.com',
    useCase: 'Asking recent customers to share a review of their visit.',
    sampleMessage: 'Hi there, thanks for visiting! Share your experience: https://example.com/r',
    consentDescription: 'Customers sign a paper intake form with a text consent line.',
  };
  const sender = await submitSenderRegistration(biz.businessId, biz.userId, fields);
  if (!sender.ok) throw new Error(sender.error);
  const approved = await approveSender(biz.businessId, biz.userId);
  if (!approved.ok) throw new Error(approved.error);
  return biz;
}

export async function addCustomer(
  biz: TestBusiness,
  input: Partial<CustomerInput> & { phone?: string; email?: string; smsSource?: string } = {},
): Promise<string> {
  const result = await createCustomer(biz.businessId, biz.userId, {
    firstName: input.firstName ?? 'Maria',
    lastName: input.lastName ?? 'Lopez',
    phone: input.phone ?? '',
    email: input.email ?? '',
    language: input.language ?? 'en',
    smsConsentSource: input.smsSource ?? '',
    emailConsentSource: input.emailConsentSource ?? '',
  }, NOON_NY);
  if (!result.ok) throw new Error(result.error);
  return result.id;
}

export async function addVisit(
  biz: TestBusiness,
  customerId: string,
  completedAt: Date,
  visitType: 'service' | 'sale' = 'service',
  at: Date = NOON_NY,
): Promise<string | null> {
  const result = await recordVisit(biz.businessId, biz.userId, customerId, {
    serviceName: 'Dinner for two',
    visitType,
    completedAt,
  }, at);
  if (!result.ok) throw new Error(result.error);
  return result.requestId;
}

/** Reads rows as the tenant, to check what the app stored. */
export async function tenantRows<T = Record<string, unknown>>(businessId: string, sql: string, values: unknown[] = []): Promise<T[]> {
  return withTenant(businessId, async (tx) => (await tx.query(sql, values)).rows as T[]);
}

export { pool };
