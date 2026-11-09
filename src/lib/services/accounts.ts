import { randomUUID } from 'node:crypto';
import { cfg, LIMITS } from '../config';
import { hashPassword, randomToken, sha256Hex, verifyPassword } from '../crypto';
import { pool, q, withTenant } from '../db';
import { normalizeEmail } from '../email';
import { lintTemplate } from '../lint';
import { checkReviewUrl, newShortCode, resolveReviewInput } from '../review-link';
import { addDays, isValidTimeZone } from '../time';
import { now as clockNow } from '../clock';
import { defaultTemplates, INDUSTRIES, type Industry } from '../templates';
import { audit } from './audit';

export type Outcome<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface SignUpInput {
  email: string;
  password: string;
  businessName: string;
  industry: string;
  timeZone: string;
  postalAddress: string;
}

export async function signUp(input: SignUpInput, now: Date = clockNow()): Promise<Outcome<{ businessId: string; userId: string }>> {
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, error: 'Enter a valid email address.' };
  if (input.password.length < 10) return { ok: false, error: 'Use a password of at least 10 characters.' };
  const businessName = input.businessName.trim();
  if (businessName.length < 2 || businessName.length > 80) return { ok: false, error: 'Business name must be 2 to 80 characters.' };
  if (!(INDUSTRIES as readonly string[]).includes(input.industry)) return { ok: false, error: 'Choose an industry.' };
  if (!isValidTimeZone(input.timeZone)) return { ok: false, error: 'Choose a valid time zone.' };
  const postal = input.postalAddress.trim();
  if (postal.length < 10 || postal.length > 200) {
    return { ok: false, error: 'Enter your postal address. It appears in every email we send for you.' };
  }
  const existing = await q(pool(), 'select 1 from users where email = $1', [email]);
  if (existing.length > 0) return { ok: false, error: 'An account already exists for that email. Log in instead.' };

  const industry = input.industry as Industry;
  const passwordHash = await hashPassword(input.password);
  const userId = randomUUID();
  const businessId = randomUUID();
  await pool().query('insert into users (id, email, password_hash) values ($1, $2, $3)', [userId, email, passwordHash]);

  await withTenant(businessId, async (tx) => {
    await tx.query(
      'insert into businesses (id, name, industry, time_zone, postal_address) values ($1, $2, $3, $4, $5)',
      [businessId, businessName, industry, input.timeZone, postal],
    );
    await tx.query('insert into memberships (business_id, user_id) values ($1, $2)', [businessId, userId]);
    await tx.query('insert into locations (business_id, name) values ($1, $2)', [businessId, businessName]);
    await tx.query(
      `insert into automation_rules (business_id, visit_kind, delay_minutes)
       values ($1, 'service', $2), ($1, 'retail', $3)`,
      [businessId, 180, 1440],
    );
    for (const t of defaultTemplates(industry)) {
      const lint = lintTemplate({ body: t.body, subject: t.subject, channel: t.channel, industry });
      await tx.query(
        `insert into templates (business_id, industry, language, channel, kind, subject, body, lint_status, lint_problems)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
        [businessId, industry, t.language, t.channel, t.kind, t.subject, t.body, lint.ok ? 'passed' : 'failed', JSON.stringify(lint.problems)],
      );
    }
    let code = newShortCode();
    while ((await q(tx, 'select 1 from find_short_link($1)', [code])).length > 0) code = newShortCode();
    await tx.query('insert into short_links (business_id, code) values ($1, $2)', [businessId, code]);
    await tx.query(
      'insert into sender_registrations (business_id, provider) values ($1, $2)',
      [businessId, cfg().sandboxMode ? 'sandbox' : 'twilio'],
    );
    await audit(tx, businessId, `owner:${userId}`, 'business.created', 'business', businessId);
  });
  void now;
  return { ok: true, businessId, userId };
}

export async function logIn(email: string, password: string): Promise<Outcome<{ userId: string; businessId: string }>> {
  const normalized = normalizeEmail(email);
  const failure = { ok: false as const, error: 'Email or password is incorrect.' };
  if (!normalized) return failure;
  const users = await q<{ id: string; password_hash: string }>(
    pool(),
    'select id, password_hash from users where email = $1',
    [normalized],
  );
  const user = users[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) return failure;
  const membership = await q<{ business_id: string | null }>(pool(), 'select membership_for_user($1) as business_id', [user.id]);
  const businessId = membership[0]?.business_id;
  if (!businessId) return failure;
  return { ok: true, userId: user.id, businessId };
}

/** Writes a session row under the business's tenant and returns the raw token for the cookie. */
export async function createSessionRow(userId: string, businessId: string, now: Date = clockNow()): Promise<string> {
  const token = randomToken(32);
  await withTenant(businessId, (tx) =>
    tx.query(
      'insert into sessions (token_hash, business_id, user_id, expires_at) values ($1, $2, $3, $4)',
      [sha256Hex(token), businessId, userId, addDays(now, LIMITS.sessionDays)],
    ),
  );
  return token;
}

export async function saveReviewLink(
  businessId: string,
  userId: string,
  input: { url?: string; placeId?: string },
): Promise<Outcome> {
  const check = resolveReviewInput(input);
  if (!check.ok) return check;
  const placeId = input.placeId?.trim() || null;
  await withTenant(businessId, async (tx) => {
    await tx.query(
      `insert into review_links (business_id, url, place_id) values ($1, $2, $3)
       on conflict (business_id) do update set url = excluded.url, place_id = excluded.place_id,
         confirmed_at = null, confirmed_by = null`,
      [businessId, check.url, placeId],
    );
    await audit(tx, businessId, `owner:${userId}`, 'review_link.saved', 'review_link', businessId);
  });
  return { ok: true };
}

/** The owner opened the link and saw the review box. Nothing sends until this is set. */
export async function confirmReviewLink(businessId: string, userId: string, now: Date = clockNow()): Promise<Outcome> {
  return withTenant(businessId, async (tx) => {
    const rows = await q<{ url: string }>(tx, 'select url from review_links where business_id = $1', [businessId]);
    if (!rows[0]) return { ok: false as const, error: 'Save your review link first.' };
    if (!checkReviewUrl(rows[0].url).ok) return { ok: false as const, error: 'The saved review link is not valid. Save it again.' };
    await tx.query(
      'update review_links set confirmed_at = $2, confirmed_by = $3 where business_id = $1',
      [businessId, now, userId],
    );
    await audit(tx, businessId, `owner:${userId}`, 'review_link.confirmed', 'review_link', businessId);
    return { ok: true as const };
  });
}

export interface SenderFields {
  legalName: string;
  website: string;
  useCase: string;
  sampleMessage: string;
  consentDescription: string;
}

export async function submitSenderRegistration(businessId: string, userId: string, fields: SenderFields): Promise<Outcome> {
  const clean = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.trim()])) as SenderFields;
  if (clean.legalName.length < 2) return { ok: false, error: 'Enter the legal business name.' };
  if (clean.useCase.length < 20) return { ok: false, error: 'Describe the use case in a sentence or two (at least 20 characters).' };
  if (clean.consentDescription.length < 20) return { ok: false, error: 'Describe how customers gave written permission.' };
  if (clean.sampleMessage.length < 10) return { ok: false, error: 'Paste a sample message.' };
  return withTenant(businessId, async (tx) => {
    const rows = await q<{ status: string }>(tx, 'select status from sender_registrations where business_id = $1', [businessId]);
    if (rows[0]?.status === 'approved') return { ok: false as const, error: 'Your SMS sender is already approved.' };
    await tx.query(
      `update sender_registrations set status = 'submitted', fields = $2::jsonb, updated_at = now() where business_id = $1`,
      [businessId, JSON.stringify(clean)],
    );
    await audit(tx, businessId, `owner:${userId}`, 'sender.submitted', 'sender_registration', businessId);
    return { ok: true as const };
  });
}

export interface SettingsInput {
  name: string;
  postalAddress: string;
  timeZone: string;
  quietStartHour: number;
  quietEndHour: number;
  frequencyWindowDays: number;
  serviceDelayMinutes: number;
  retailDelayMinutes: number;
  serviceEnabled: boolean;
  retailEnabled: boolean;
}

/** Owners can narrow quiet hours and lengthen the frequency window. They cannot widen either. */
export async function updateSettings(businessId: string, userId: string, input: SettingsInput): Promise<Outcome> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) return { ok: false, error: 'Business name must be 2 to 80 characters.' };
  const postal = input.postalAddress.trim();
  if (postal.length < 10 || postal.length > 200) return { ok: false, error: 'Enter a valid postal address.' };
  if (!isValidTimeZone(input.timeZone)) return { ok: false, error: 'Choose a valid time zone.' };
  if (input.quietStartHour < LIMITS.quietMinStart || input.quietStartHour > 20) {
    return { ok: false, error: 'Sending can start no earlier than 8:00 and no later than 20:00.' };
  }
  if (input.quietEndHour > LIMITS.quietMaxEnd || input.quietEndHour < 9) {
    return { ok: false, error: 'Sending must end by 21:00 at the latest.' };
  }
  if (input.quietEndHour <= input.quietStartHour) return { ok: false, error: 'The end of the sending window must be after its start.' };
  if (input.frequencyWindowDays < LIMITS.frequencyWindowMinDays || input.frequencyWindowDays > LIMITS.frequencyWindowMaxDays) {
    return { ok: false, error: 'The frequency window must be between 90 and 365 days.' };
  }
  for (const d of [input.serviceDelayMinutes, input.retailDelayMinutes]) {
    if (!Number.isInteger(d) || d < 0 || d > 10080) return { ok: false, error: 'Delays must be between 0 and 10080 minutes.' };
  }
  return withTenant(businessId, async (tx) => {
    await tx.query(
      `update businesses set name = $2, postal_address = $3, time_zone = $4, quiet_start_hour = $5,
              quiet_end_hour = $6, frequency_window_days = $7 where id = $1`,
      [businessId, name, postal, input.timeZone, input.quietStartHour, input.quietEndHour, input.frequencyWindowDays],
    );
    await tx.query('update automation_rules set delay_minutes = $2, enabled = $3 where business_id = $1 and visit_kind = $4', [businessId, input.serviceDelayMinutes, input.serviceEnabled, 'service']);
    await tx.query('update automation_rules set delay_minutes = $2, enabled = $3 where business_id = $1 and visit_kind = $4', [businessId, input.retailDelayMinutes, input.retailEnabled, 'retail']);
    await audit(tx, businessId, `owner:${userId}`, 'settings.updated', 'business', businessId);
    return { ok: true as const };
  });
}
