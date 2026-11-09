import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentSession } from '@/lib/auth';
import { cfg } from '@/lib/config';
import { Icon } from '@/app/_components/icons';
import { Badge, buttonClass, Card, secondaryButtonClass } from '@/app/_components/ui';
import { PhoneMock } from '@/app/_public/PhoneMock';
import { PublicFrame } from '@/app/_public/PublicFrame';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Review requests done right',
};

const STEPS = [
  {
    title: 'Save your review link',
    body: 'Paste your Google review link. Open it once to confirm the review box appears.',
  },
  {
    title: 'Add customers with permission',
    body: 'Add each customer with the written permission they gave you, and note where they gave it.',
  },
  {
    title: 'Send the request',
    body: 'Each customer gets the same message. It waits for your sending window, which uses your time zone.',
  },
];

const PROMISES = [
  {
    lead: 'The same request for everyone.',
    body: 'Customers are never filtered out by rating before they are asked.',
  },
  {
    lead: 'No incentives.',
    body: 'A review request cannot offer a discount, a gift, or any other reward. Templates with that wording are blocked.',
  },
  {
    lead: 'An opt-out in every message.',
    body: 'A customer can reply STOP or use the unsubscribe link. Either one stops messages from that business by text and email.',
  },
  {
    lead: 'A sending window.',
    body: 'Messages wait until the window opens. The window uses the business time zone.',
  },
  {
    lead: 'Contact details stay private.',
    body: 'Customer details are never sold or reused for other marketing.',
  },
];

function SiteFooter() {
  return (
    <div className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-[64rem] flex-col gap-3 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 text-meta text-ink-soft">Compliant Google review requests for local businesses.</p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6">
          <Link href="/privacy" className="sn-header-link px-0">
            Privacy notice
          </Link>
          <Link href="/login" className="sn-header-link px-0">
            Log in
          </Link>
        </nav>
      </div>
    </div>
  );
}

export default async function HomePage() {
  if (await currentSession()) redirect('/dashboard');
  const { priceLabel } = cfg();

  return (
    <PublicFrame wide headerLink={{ href: '/login', label: 'Log in' }} footer={<SiteFooter />}>
      <section
        aria-labelledby="hero-heading"
        className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-16"
      >
        <div>
          <h1
            id="hero-heading"
            className="m-0 font-display text-hero font-semibold leading-[1.08] tracking-[-0.02em] text-ink"
          >
            Review requests done right.
          </h1>
          <p className="mt-5 mb-0 max-w-[34rem] text-title leading-normal text-ink-soft">
            Every customer gets the same honest ask for a Google review. Nobody is filtered out by rating, nobody is
            offered a reward for leaving one, and every message has an opt-out.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/signup" className={`${buttonClass} w-full sm:w-auto`}>
              Create your account
            </Link>
            <Link href="/login" className={`${secondaryButtonClass} w-full sm:w-auto`}>
              Log in
            </Link>
          </div>
          <ul className="m-0 mt-8 flex flex-wrap gap-2 p-0 list-none">
            <li>
              <Badge tone="good">Same ask for every customer</Badge>
            </li>
            <li>
              <Badge tone="good">No rewards for reviews</Badge>
            </li>
            <li>
              <Badge tone="good">Opt-out in every message</Badge>
            </li>
          </ul>
        </div>
        <PhoneMock />
      </section>

      <section aria-labelledby="how-heading" className="mt-20 sm:mt-28">
        <h2 id="how-heading" className="m-0 font-display text-display font-semibold text-ink">
          How it works
        </h2>
        <ol className="m-0 mt-8 grid list-none gap-8 p-0 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="border-t border-line pt-6">
              <span
                aria-hidden="true"
                className="grid h-9 w-9 place-items-center rounded-pill bg-accent-soft text-body font-semibold text-accent"
              >
                {i + 1}
              </span>
              <h3 className="mt-4 mb-2 text-title font-semibold text-ink">{step.title}</h3>
              <p className="m-0 text-body text-ink-soft">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="promise-heading" className="mt-20 sm:mt-28">
        <h2 id="promise-heading" className="m-0 font-display text-display font-semibold text-ink">
          Compliance promises
        </h2>
        <Card className="mt-8">
          <ul className="m-0 list-none p-0">
            {PROMISES.map((item) => (
              <li
                key={item.lead}
                className="flex gap-4 border-t border-line py-4 first:border-t-0 first:pt-0 last:pb-0"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-pill bg-good-soft text-good"
                >
                  <Icon name="check" />
                </span>
                <p className="m-0 text-body text-ink-soft">
                  <strong className="font-semibold text-ink">{item.lead}</strong> {item.body}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section aria-labelledby="pricing-heading" className="mt-20 mb-4 sm:mt-28">
        <h2 id="pricing-heading" className="m-0 font-display text-display font-semibold text-ink">
          Pricing
        </h2>
        <Card className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="m-0 text-title font-semibold text-ink">{priceLabel}</p>
          <Link href="/signup" className={`${buttonClass} w-full sm:w-auto`}>
            Create your account
          </Link>
        </Card>
      </section>
    </PublicFrame>
  );
}
