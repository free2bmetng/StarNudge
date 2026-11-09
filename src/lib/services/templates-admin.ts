import { q, withTenant } from '../db';
import { lintTemplate } from '../lint';
import { audit } from './audit';
import type { Outcome } from './accounts';

export interface TemplateView {
  id: string;
  language: string;
  channel: 'sms' | 'email';
  kind: 'service' | 'retail';
  subject: string | null;
  body: string;
  version: number;
  lintStatus: string;
  lintProblems: string[];
}

export async function listTemplates(businessId: string): Promise<TemplateView[]> {
  const rows = await withTenant(businessId, (tx) =>
    q<{
      id: string;
      language: string;
      channel: 'sms' | 'email';
      kind: 'service' | 'retail';
      subject: string | null;
      body: string;
      version: number;
      lint_status: string;
      lint_problems: string[];
    }>(
      tx,
      `select id, language, channel, kind, subject, body, version, lint_status, lint_problems
       from templates order by kind, channel, language`,
    ),
  );
  return rows.map((r) => ({
    id: r.id,
    language: r.language,
    channel: r.channel,
    kind: r.kind,
    subject: r.subject,
    body: r.body,
    version: r.version,
    lintStatus: r.lint_status,
    lintProblems: r.lint_problems ?? [],
  }));
}

export async function getTemplate(businessId: string, id: string): Promise<TemplateView | null> {
  return (await listTemplates(businessId)).find((t) => t.id === id) ?? null;
}

/** Saves new wording only if it passes lint. Failing copy is never stored as sendable. */
export async function updateTemplate(
  businessId: string,
  userId: string,
  id: string,
  input: { subject: string; body: string },
): Promise<Outcome<{ problems: string[] }>> {
  return withTenant(businessId, async (tx) => {
    const rows = await q<{ industry: string; channel: 'sms' | 'email' }>(
      tx,
      `select t.industry, t.channel from templates t where t.id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) return { ok: false as const, error: 'Template not found.' };
    const subject = row.channel === 'email' ? input.subject.trim() : null;
    const lint = lintTemplate({ body: input.body, subject, channel: row.channel, industry: row.industry });
    if (!lint.ok) return { ok: false as const, error: lint.problems.join(' '), problems: lint.problems };
    await tx.query(
      `update templates set subject = $2, body = $3, version = version + 1, lint_status = 'passed',
              lint_problems = '[]'::jsonb, updated_at = now() where id = $1`,
      [id, subject, input.body.trim()],
    );
    await audit(tx, businessId, `owner:${userId}`, 'template.updated', 'template', id);
    return { ok: true as const, problems: [] };
  });
}
