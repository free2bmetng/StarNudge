import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { listCustomers } from '@/lib/services/customers';
import { createCustomerAction } from '@/app/actions/customers';
import {
  buttonClass,
  cardClass,
  Flash,
  hintClass,
  inputClass,
  labelClass,
  param,
  PageTitle,
  Section,
  Shell,
} from '@/app/_components/ui';

export const dynamic = 'force-dynamic';

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const customers = await listCustomers(s.businessId);

  return (
    <Shell>
      <PageTitle lead="Only record a text consent when the customer gave it. Write down where.">Customers</PageTitle>
      <Flash error={param(sp.error)} notice={param(sp.notice)} />

      <div className="mb-4 flex flex-wrap gap-3">
        <Link href="/customers/import" className={buttonClass}>Import a CSV file</Link>
      </div>

      <div className="mb-6 space-y-3">
        {customers.length === 0 ? (
          <p className={cardClass}>No customers yet. Add one below or import a file.</p>
        ) : (
          customers.map((c) => (
            <Link key={c.id} href={`/customers/${c.id}`} className={`${cardClass} block hover:border-stone-400`}>
              <p className="text-base font-semibold text-stone-900">{c.firstName} {c.lastName}</p>
              <p className="text-sm text-stone-700">
                {c.phoneMasked || 'No phone'} · {c.emailMasked || 'No email'}
              </p>
              <p className="mt-1 text-sm text-stone-700">
                {c.optedOut ? 'Opted out' : c.smsConsent ? 'Text consent on file' : 'No text consent'}
                {c.lastVisit ? ` · Last visit ${c.lastVisit.toLocaleDateString('en-US')}` : ''}
              </p>
            </Link>
          ))
        )}
      </div>

      <Section title="Add a customer">
        <form action={createCustomerAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="firstName" className={labelClass}>First name</label>
              <input id="firstName" name="firstName" required maxLength={60} className={inputClass} />
            </div>
            <div>
              <label htmlFor="lastName" className={labelClass}>Last name</label>
              <input id="lastName" name="lastName" maxLength={60} className={inputClass} />
            </div>
          </div>
          <div>
            <label htmlFor="phone" className={labelClass}>Mobile phone</label>
            <input id="phone" name="phone" type="tel" className={inputClass} autoComplete="tel" />
          </div>
          <div>
            <label htmlFor="email" className={labelClass}>Email</label>
            <input id="email" name="email" type="email" className={inputClass} autoComplete="email" />
          </div>
          <div>
            <label htmlFor="language" className={labelClass}>Preferred language</label>
            <select id="language" name="language" className={inputClass} defaultValue="en">
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </div>
          <fieldset className="space-y-2 rounded-md border border-stone-200 p-3">
            <legend className="px-1 text-base font-medium">Permission</legend>
            <label className="flex items-start gap-3 text-base">
              <input type="checkbox" name="smsConsent" className="mt-1 h-5 w-5" />
              <span>The customer gave written permission to receive texts from this business.</span>
            </label>
            <div>
              <label htmlFor="smsConsentSource" className={labelClass}>Where they gave it</label>
              <input id="smsConsentSource" name="smsConsentSource" maxLength={200} className={inputClass} placeholder="For example: signed intake form, 2026-10-02" />
            </div>
            <label className="flex items-start gap-3 text-base">
              <input type="checkbox" name="emailConsent" className="mt-1 h-5 w-5" />
              <span>The customer opted in to receive email from this business.</span>
            </label>
            <div>
              <label htmlFor="emailConsentSource" className={labelClass}>Where they opted in</label>
              <input id="emailConsentSource" name="emailConsentSource" maxLength={200} className={inputClass} placeholder="For example: newsletter signup at checkout" />
            </div>
            <p className={hintClass}>Without permission, the customer gets no text and no email.</p>
          </fieldset>
          <button type="submit" className={buttonClass}>Add customer</button>
        </form>
      </Section>
    </Shell>
  );
}
