/** Operational limits and policy constants. Changing these is a compliance decision. */
export const LIMITS = {
  importMaxRows: 5000,
  automationRecencyDays: 7,
  requestExpiryHours: 48,
  maxSendAttempts: 3,
  senderHoldMinutes: 15,
  leaseMinutes: 5,
  frequencyWindowMinDays: 90,
  frequencyWindowMaxDays: 365,
  sessionDays: 14,
  quietMinStart: 8,
  quietMaxEnd: 21,
  retryBaseSeconds: 30,
} as const;

/** Words that make a review request an incentive (rule R3). Whole-word, case-insensitive. */
export const INCENTIVE_WORDS = [
  'discount', 'discounts', 'free', 'reward', 'rewards', 'prize', 'prizes', 'gift', 'gifts',
  'coupon', 'coupons', 'points', 'bonus', 'cash', 'giveaway', 'raffle', 'sweepstakes',
  'voucher', 'freebie',
];

/** Hosts a review link may point to. Exact match only, so look-alike domains fail. */
export const ALLOWED_REVIEW_HOSTS = ['search.google.com', 'www.google.com', 'google.com', 'g.page'];

export interface Config {
  databaseUrl: string;
  appBaseUrl: string;
  sandboxMode: boolean;
  encryptionKey: Buffer;
  hashKey: Buffer;
  cronSecret: string;
  sandboxWebhookSecret: string;
  notifyFromEmail: string;
  twilio: { accountSid: string; authToken: string };
  resend: { apiKey: string; webhookSecret: string };
  stripe: { secretKey: string; webhookSecret: string; priceId: string };
  priceLabel: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return value;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] || fallback;
}

function keyBytes(name: string): Buffer {
  const bytes = Buffer.from(required(name), 'base64');
  if (bytes.length !== 32) throw new Error(`${name} must decode to 32 bytes (generate with: openssl rand -base64 32)`);
  return bytes;
}

/** Reads configuration on every call so tests can change the environment between cases. */
export function cfg(): Config {
  return {
    databaseUrl: required('DATABASE_URL'),
    appBaseUrl: optional('APP_BASE_URL', 'http://localhost:3000').replace(/\/$/, ''),
    sandboxMode: process.env.SANDBOX_MODE !== 'false',
    encryptionKey: keyBytes('APP_ENCRYPTION_KEY'),
    hashKey: Buffer.from(required('APP_HASH_KEY'), 'utf8'),
    cronSecret: optional('CRON_SECRET'),
    sandboxWebhookSecret: optional('SANDBOX_WEBHOOK_SECRET', 'sandbox-webhook-secret'),
    notifyFromEmail: optional('NOTIFY_FROM_EMAIL', 'StarNudge <notify@example.com>'),
    twilio: { accountSid: optional('TWILIO_ACCOUNT_SID'), authToken: optional('TWILIO_AUTH_TOKEN') },
    resend: { apiKey: optional('RESEND_API_KEY'), webhookSecret: optional('RESEND_WEBHOOK_SECRET') },
    stripe: {
      secretKey: optional('STRIPE_SECRET_KEY'),
      webhookSecret: optional('STRIPE_WEBHOOK_SECRET'),
      priceId: optional('STRIPE_PRICE_ID'),
    },
    priceLabel: optional('PRICE_LABEL', 'Price to be set by the owner'),
  };
}
