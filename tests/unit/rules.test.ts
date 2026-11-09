import { describe, expect, it } from 'vitest';
import { normalizePhone, maskPhone } from '@/lib/phone';
import { normalizeEmail } from '@/lib/email';
import { countSegments, encodingOf } from '@/lib/segments';
import { classifyInbound } from '@/lib/keywords';
import { parseCsv, csvCell } from '@/lib/csv';
import { checkReviewUrl, resolveReviewInput, newShortCode, buildWriteReviewUrl } from '@/lib/review-link';
import { parseUnsubscribeToken, makeUnsubscribeToken } from '@/lib/unsubscribe';
import { encryptField, decryptField, hashContact, hashPassword, verifyPassword } from '@/lib/crypto';

describe('phone normalization (rule: E.164, US detection)', () => {
  it('treats 10 and 11 digit numbers as US', () => {
    expect(normalizePhone('(212) 555-0100')).toEqual({ e164: '+12125550100', isUS: true });
    expect(normalizePhone('1-212-555-0100')).toEqual({ e164: '+12125550100', isUS: true });
  });
  it('keeps explicit international numbers and flags them non-US', () => {
    expect(normalizePhone('+44 20 7946 0958')).toEqual({ e164: '+442079460958', isUS: false });
  });
  it('rejects text that is not a phone number', () => {
    expect(normalizePhone('call me')).toBeNull();
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });
  it('masks all but the last four digits', () => {
    expect(maskPhone('+12125550100')).toBe('•••0100');
  });
});

describe('email normalization', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Maria@Example.COM ')).toBe('maria@example.com');
  });
  it('rejects malformed addresses', () => {
    expect(normalizeEmail('not-an-email')).toBeNull();
    expect(normalizeEmail('a b@example.com')).toBeNull();
  });
});

describe('SMS segments', () => {
  it('counts plain GSM-7 text in 160-character segments', () => {
    expect(countSegments('a'.repeat(160))).toEqual({ encoding: 'GSM-7', units: 160, segments: 1 });
    expect(countSegments('a'.repeat(161)).segments).toBe(2);
  });
  it('counts GSM extension characters as two units', () => {
    expect(countSegments('€'.repeat(80)).units).toBe(160);
  });
  it('switches to UCS-2 for characters outside GSM-7 (for example, á)', () => {
    expect(encodingOf('Gracias por visitar a Ana')).toBe('GSM-7');
    expect(encodingOf('Ramón')).toBe('UCS-2'); // ó is not in the GSM-7 alphabet
    expect(encodingOf('Gracias señora á')).toBe('UCS-2');
    expect(countSegments('á'.repeat(70)).segments).toBe(1);
    expect(countSegments('á'.repeat(71)).segments).toBe(2);
  });
});

describe('inbound keywords', () => {
  it.each([
    ['STOP', 'stop'],
    ['stop.', 'stop'],
    ['  unsubscribe ', 'stop'],
    ['START', 'start'],
    ['UNSTOP', 'start'],
    ['HELP', 'help'],
    ['info', 'help'],
    ['please stop texting me', 'other'],
    ['Can you come earlier?', 'other'],
  ])('%s -> %s', (body, expected) => {
    expect(classifyInbound(body)).toBe(expected);
  });
});

describe('CSV parsing and export safety', () => {
  it('handles quoted commas, doubled quotes, and CRLF', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\r\n')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['1', '2', '3'],
    ]);
  });
  it('skips blank lines and strips a BOM', () => {
    expect(parseCsv('﻿x,y\n\n1,2\n')).toEqual([['x', 'y'], ['1', '2']]);
  });
  it('neutralizes spreadsheet formulas on export', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1 555')).toBe(`'+1 555`);
    expect(csvCell('plain')).toBe('plain');
  });
});

describe('review links (rule: https, allowlisted host, valid Place ID)', () => {
  it('accepts a writereview link with a Place ID', () => {
    const r = checkReviewUrl('https://search.google.com/local/writereview?placeid=ChIJabcdefghijklmnop');
    expect(r.ok).toBe(true);
  });
  it('accepts a g.page short review link', () => {
    expect(checkReviewUrl('https://g.page/r/CabcDEF123/review').ok).toBe(true);
  });
  it('rejects http, look-alike hosts, and unrelated Google paths', () => {
    expect(checkReviewUrl('http://search.google.com/local/writereview?placeid=ChIJabcdefghijklmnop').ok).toBe(false);
    expect(checkReviewUrl('https://search.google.com.evil.example/local/writereview?placeid=ChIJabcdefghijklmnop').ok).toBe(false);
    expect(checkReviewUrl('https://www.google.com/maps/place/x').ok).toBe(false);
    expect(checkReviewUrl('not a url').ok).toBe(false);
  });
  it('builds the link from a Place ID and rejects a bad one', () => {
    const r = resolveReviewInput({ placeId: 'ChIJabcdefghijklmnop' });
    expect(r).toEqual({ ok: true, url: buildWriteReviewUrl('ChIJabcdefghijklmnop') });
    expect(resolveReviewInput({ placeId: 'x' }).ok).toBe(false);
    expect(resolveReviewInput({}).ok).toBe(false);
  });
  it('generates 8-character short codes from the safe alphabet', () => {
    const code = newShortCode();
    expect(code).toMatch(/^[a-hj-km-np-z2-9]{8}$/);
  });
});

describe('crypto', () => {
  it('round-trips encrypted fields and rejects tampering', () => {
    const cipher = encryptField('Maria Lopez');
    expect(cipher).toMatch(/^v1\./);
    expect(decryptField(cipher)).toBe('Maria Lopez');
    const parts = (cipher as string).split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptField(parts.join('.'))).toThrow();
  });
  it('encrypts the same value differently each time', () => {
    expect(encryptField('x')).not.toBe(encryptField('x'));
  });
  it('hashes contacts deterministically and separates phone from email', () => {
    expect(hashContact('phone', '+12125550100')).toBe(hashContact('phone', '+12125550100'));
    expect(hashContact('phone', 'a@b.co')).not.toBe(hashContact('email', 'a@b.co'));
  });
  it('verifies passwords with a salted scrypt hash', async () => {
    const stored = await hashPassword('correct-horse-battery');
    expect(await verifyPassword('correct-horse-battery', stored)).toBe(true);
    expect(await verifyPassword('wrong', stored)).toBe(false);
  });
  it('signs unsubscribe tokens and rejects forged ones', () => {
    const b = '11111111-1111-4111-8111-111111111111';
    const c = '22222222-2222-4222-8222-222222222222';
    const token = makeUnsubscribeToken(b, c);
    expect(parseUnsubscribeToken(token)).toEqual({ businessId: b, customerId: c });
    const forged = token.slice(0, -2) + 'AA';
    expect(parseUnsubscribeToken(forged)).toBeNull();
  });
});
