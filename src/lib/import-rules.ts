import { LIMITS } from './config';
import { instantForLocal } from './time';
import { normalizeEmail } from './email';
import { normalizePhone, type NormalizedPhone } from './phone';
import { parseCsv } from './csv';

export const IMPORT_HEADERS = [
  'first_name',
  'last_name',
  'phone',
  'email',
  'service_or_purchase',
  'visit_date',
  'visit_type',
  'language',
  'consent_type',
  'consent_source',
  'consent_date',
] as const;

export interface ImportRowError {
  line: number;
  message: string;
}

export interface ValidImportRow {
  line: number;
  firstName: string;
  lastName: string;
  phone: NormalizedPhone | null;
  email: string | null;
  serviceName: string;
  visitType: 'service' | 'sale';
  visitAt: Date;
  language: 'en' | 'es';
  consent: { type: 'sms_pew' | 'email_opt_in'; source: string; recordedAt: Date } | null;
}

export interface ImportValidation {
  fatal: string | null;
  totalRows: number;
  rows: ValidImportRow[];
  errors: ImportRowError[];
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/;

function parseLocalDate(
  value: string,
  timeZone: string,
  hourIfMissing: number,
): Date | null {
  const m = DATE_RE.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const hour = h === undefined ? hourIfMissing : Number(h);
  const minute = mi === undefined ? 0 : Number(mi);
  return instantForLocal(timeZone, Number(y), Number(mo), Number(d), hour, minute);
}

/**
 * Validates an uploaded customer file. Each row is checked on its own, so one bad row
 * does not stop the others. A file-level problem (missing columns, too many rows) is fatal.
 */
export function validateImport(text: string, opts: { timeZone: string; now: Date }): ImportValidation {
  const grid = parseCsv(text);
  const empty = { totalRows: 0, rows: [] as ValidImportRow[], errors: [] as ImportRowError[] };
  if (grid.length === 0) return { fatal: 'The file is empty.', ...empty };

  const header = grid[0].map((h) => h.trim().toLowerCase());
  const dataRows = grid.slice(1);
  if (!header.includes('phone') && !header.includes('email')) {
    return { fatal: 'The file needs a phone or email column.', ...empty };
  }
  for (const required of ['service_or_purchase', 'visit_date']) {
    if (!header.includes(required)) return { fatal: `The file needs a ${required} column.`, ...empty };
  }
  if (dataRows.length > LIMITS.importMaxRows) {
    return { fatal: `A file can hold at most ${LIMITS.importMaxRows} rows.`, ...empty };
  }

  const rows: ValidImportRow[] = [];
  const errors: ImportRowError[] = [];
  dataRows.forEach((cells, index) => {
    const line = index + 2;
    const get = (name: string): string => {
      const i = header.indexOf(name);
      return i >= 0 ? (cells[i] ?? '').trim() : '';
    };
    const fail = (message: string) => errors.push({ line, message });

    const phoneRaw = get('phone');
    const emailRaw = get('email');
    let phone: NormalizedPhone | null = null;
    let email: string | null = null;
    if (phoneRaw) {
      phone = normalizePhone(phoneRaw);
      if (!phone) return fail(`Phone "${phoneRaw}" is not a valid number`);
    }
    if (emailRaw) {
      email = normalizeEmail(emailRaw);
      if (!email) return fail(`Email "${emailRaw}" is not valid`);
    }
    if (!phone && !email) return fail('Each row needs a phone or an email');

    const serviceName = get('service_or_purchase');
    if (!serviceName) return fail('service_or_purchase is required');

    const visitTypeRaw = (get('visit_type') || 'service').toLowerCase();
    if (visitTypeRaw !== 'service' && visitTypeRaw !== 'sale') return fail('visit_type must be service or sale');

    const visitDate = get('visit_date');
    const visitAt = parseLocalDate(visitDate, opts.timeZone, 12);
    if (!visitAt) return fail('visit_date must look like 2026-03-14 (or 2026-03-14 16:30)');
    if (visitAt.getTime() > opts.now.getTime() + 5 * 60_000) return fail('visit_date is in the future');

    const languageRaw = (get('language') || 'en').toLowerCase();
    if (languageRaw !== 'en' && languageRaw !== 'es') return fail('language must be en or es');

    let consent: ValidImportRow['consent'] = null;
    const consentType = get('consent_type').toLowerCase();
    if (consentType) {
      if (consentType !== 'sms_pew' && consentType !== 'email_opt_in') {
        return fail('consent_type must be sms_pew or email_opt_in (or blank)');
      }
      const source = get('consent_source');
      if (!source) return fail('consent_source is required when consent_type is set');
      const consentDate = get('consent_date');
      const recordedAt = parseLocalDate(consentDate, opts.timeZone, 12);
      if (!recordedAt) return fail('consent_date must look like 2026-03-14');
      if (recordedAt.getTime() > opts.now.getTime() + 5 * 60_000) return fail('consent_date is in the future');
      if (consentType === 'sms_pew' && !(phone && phone.isUS)) {
        return fail('SMS consent needs a US phone number');
      }
      if (consentType === 'email_opt_in' && !email) return fail('Email consent needs an email address');
      consent = { type: consentType, source, recordedAt };
    }

    rows.push({
      line,
      firstName: get('first_name'),
      lastName: get('last_name'),
      phone,
      email,
      serviceName,
      visitType: visitTypeRaw,
      visitAt,
      language: languageRaw,
      consent,
    });
  });

  return { fatal: null, totalRows: dataRows.length, rows, errors };
}

/** Header-only sample file, offered for download on the import page. */
export const SAMPLE_CSV = [
  IMPORT_HEADERS.join(','),
  'Maria,Lopez,(555) 010-0101,maria@example.com,Cleaning,2026-10-02,service,en,sms_pew,Signed intake form,2026-10-02',
  'Sam,Rivera,+1 555 010 0102,,Haircut,2026-10-03,service,en,,,',
  'Ana,Diaz,,ana@example.com,Shoes,2026-10-04,sale,es,email_opt_in,Newsletter signup at checkout,2026-10-04',
  '',
].join('\n');
