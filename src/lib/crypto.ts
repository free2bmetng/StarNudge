import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { cfg } from './config';

/** Field-level encryption (AES-256-GCM) for personal data at rest. Format: v1.iv.tag.data */
export function encryptField(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain === '') return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', cfg().encryptionKey, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), data.toString('base64url')].join('.');
}

export function decryptField(value: string | null | undefined): string | null {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Unrecognized ciphertext format');
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv('aes-256-gcm', cfg().encryptionKey, Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8');
}

/** Keyed hash of a normalized contact, used for dedupe and suppression lookups without storing the value. */
export function hashContact(kind: 'phone' | 'email', normalized: string): string {
  return createHmac('sha256', cfg().hashKey).update(`${kind}:${normalized}`).digest('hex');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function signValue(value: string): string {
  return createHmac('sha256', cfg().hashKey).update(value).digest('base64url');
}

export function verifySignedValue(value: string, signature: string): boolean {
  const expected = Buffer.from(signValue(value));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function scryptAsync(password: string, salt: Buffer, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, length, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, saltB64, keyB64] = stored.split('$');
  if (algorithm !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64url');
  const key = await scryptAsync(password, Buffer.from(saltB64, 'base64url'), expected.length);
  return timingSafeEqual(key, expected);
}
