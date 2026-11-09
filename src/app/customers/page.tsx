import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { listCustomers, type CustomerListRow } from '@/lib/services/customers';
import { createCustomerAction } from '@/app/actions/customers';
import { Icon } from '@/app/_components/icons';
import {
  Badge,
  buttonClass,
  EmptyState,
  Flash,
  hintClass,
  inputClass,
  labelClass,
  param,
  PageTitle,
  quietButtonClass,
  secondaryButtonClass,
  Shell,
} from '@/app/_components/ui';
import { Initials, Panel } from '@/app/_customers/parts';
import { formatDay, isoTime } from '@/app/_customers/format';

export const dynamic = 'force-dynamic';

function CustomerCard({ c }: { c: CustomerListRow }) {
  return (
    <Link
      href={`/customers/${c.id}`}
      className="flex items-center gap-4 rounded-card border border-line bg-surface p-4 text-ink no-underline shadow-rest transition-[border-color,box-shadow] duration-fast ease-out hover:border-line-strong hover:shadow-raised sm:p-5"
    >
      <Initials first={c.firstName} last={c.lastName} />
      <span className="grid min-w-0 flex-1 gap-2">
        <span className="text-body font-semibold">
          {c.firstName} {c.lastName}
        </span>
        <span className="grid gap-0.5 text-meta tabular-nums text-ink-soft">
          <span>{c.phoneMasked || 'No phone'}</span>
          <span>{c.emailMasked || 'No email'}</span>
        </span>
        <span className="flex flex-wrap gap-2">
          {c.optedOut ? (
            <Badge tone="crit" icon="xcircle">
              Opted out
            </Badge>
          ) : null}
          {c.smsConsent ? (
            <Badge tone="good" icon="check">
              Text consent on file
            </Badge>
          ) : (
            <Badge tone="neutral" icon={null}>
              No text consent
            </Badge>
          )}
        </span>
        <span className="text-meta text-ink-soft">
          {c.lastVisit ? (
            <>
              Last visit <time dateTime={isoTime(c.lastVisit)}>{formatDay(c.lastVisit)}</time>
            </>
          ) : (
            'No visits yet'
          )}
        </span>
      </span>
      <Icon name="chevron" className="text-ink-muted" />
    </Link>
  );
}

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const customers = await listCustomers(s.businessId);

  return (
    <Shell>
      <PageTitle lead="Only record a text consent when the customer gave it. Write down where.">Customers</PageTitle>
      <Flash error={param(sp.error)} notice={param(sp.notice)} />

      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start xl:gap-8">
        <section aria-labelledby="customers-on-file" className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="customers-on-file" className="sn-section-heading mb-0">
              Customers on file
            </h2>
            <div className="flex flex-wrap gap-2">
              <Link href="/customers/import" className={secondaryButtonClass}>
                Import a CSV file
              </Link>
              {customers.length > 0 ? (
                <Link href="#add-customer" className={quietButtonClass}>
                  Add a customer
                </Link>
              ) : null}
            </div>
          </div>

          {customers.length === 0 ? (
            <EmptyState
              icon="customers"
              title="No customers yet"
              action={
                <Link href="#add-customer" className={buttonClass}>
                  Add the first customer
                </Link>
              }
            >
              <p>
                Each customer shows here with their masked contact details, text and email permission, and last visit. Add one
                in the form, or import a CSV file of visits.
              </p>
            </EmptyState>
          ) : (
            <ul className="grid gap-3">
              {customers.map((c) => (
                <li key={c.id}>
                  <CustomerCard c={c} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <Panel
          id="add-customer"
          title="Add a customer"
          icon="plus"
          lead="Add one customer by hand. A first name and a phone number or an email are required."
          className="mt-8 xl:mt-0"
        >
          <form action={createCustomerAction} className="@container grid gap-8">
            <div className="grid gap-4">
              <h3 className="text-body font-semibold text-ink">Who they are</h3>
              <div className="grid gap-4 @md:grid-cols-2">
                <div>
                  <label htmlFor="firstName" className={labelClass}>First name</label>
                  <input id="firstName" name="firstName" required maxLength={60} autoComplete="given-name" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="lastName" className={labelClass}>Last name</label>
                  <input id="lastName" name="lastName" maxLength={60} autoComplete="family-name" className={inputClass} />
                </div>
              </div>
              <div>
                <label htmlFor="language" className={labelClass}>Preferred language</label>
                <select id="language" name="language" className={inputClass} defaultValue="en">
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </select>
                <span className={hintClass}>Review requests use this language.</span>
              </div>
            </div>

            <div className="grid gap-4">
              <h3 className="text-body font-semibold text-ink">How to reach them</h3>
              <div>
                <label htmlFor="phone" className={labelClass}>Mobile phone</label>
                <input id="phone" name="phone" type="tel" autoComplete="tel" className={inputClass} aria-describedby="phone-hint" />
                <span id="phone-hint" className={hintClass}>Text consent needs a US mobile number.</span>
              </div>
              <div>
                <label htmlFor="email" className={labelClass}>Email</label>
                <input id="email" name="email" type="email" autoComplete="email" className={inputClass} aria-describedby="email-hint" />
                <span id="email-hint" className={hintClass}>Email consent needs an email address.</span>
              </div>
            </div>

            <fieldset className="grid gap-4 rounded-card border border-line bg-sunken p-4">
              <legend className="px-1 text-body font-semibold text-ink">Permission</legend>
              <p className="text-body text-ink-soft">Without permission, the customer gets no text and no email.</p>

              <div className="grid gap-3 rounded-control border border-line bg-surface p-4">
                <label className="flex items-start gap-3 text-body">
                  <input type="checkbox" name="smsConsent" className="mt-0.5" />
                  <span>The customer gave written permission to receive texts from this business.</span>
                </label>
                <div className="grid gap-0 @md:pl-8">
                  <label htmlFor="smsConsentSource" className={labelClass}>Where they gave it</label>
                  <input
                    id="smsConsentSource"
                    name="smsConsentSource"
                    maxLength={200}
                    className={inputClass}
                    placeholder="For example: signed intake form, 2026-10-02"
                    aria-describedby="smsConsentSource-hint"
                  />
                  <span id="smsConsentSource-hint" className={hintClass}>Keep this so you can show the permission later.</span>
                </div>
              </div>

              <div className="grid gap-3 rounded-control border border-line bg-surface p-4">
                <label className="flex items-start gap-3 text-body">
                  <input type="checkbox" name="emailConsent" className="mt-0.5" />
                  <span>The customer opted in to receive email from this business.</span>
                </label>
                <div className="grid gap-0 @md:pl-8">
                  <label htmlFor="emailConsentSource" className={labelClass}>Where they opted in</label>
                  <input
                    id="emailConsentSource"
                    name="emailConsentSource"
                    maxLength={200}
                    className={inputClass}
                    placeholder="For example: newsletter signup at checkout"
                    aria-describedby="emailConsentSource-hint"
                  />
                  <span id="emailConsentSource-hint" className={hintClass}>Keep this so you can show the permission later.</span>
                </div>
              </div>
            </fieldset>

            <div>
              <button type="submit" className={`${buttonClass} w-full @md:w-auto`}>
                Add customer
              </button>
            </div>
          </form>
        </Panel>
      </div>
    </Shell>
  );
}
