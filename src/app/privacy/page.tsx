import type { Metadata } from 'next';
import { Icon } from '@/app/_components/icons';
import { PageTitle } from '@/app/_components/ui';
import { PublicFrame } from '@/app/_public/PublicFrame';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Privacy notice',
};

const SECTIONS: Array<{ title: string; body: string }> = [
  {
    title: 'Who we are',
    body: '[Legal entity name, address, and contact email to be filled in by the operator.]',
  },
  {
    title: 'What we process',
    body: 'For businesses: account details, the review link, sender registration details, and billing status. For their customers: name, phone number or email, the service or purchase, consent records, and the messages sent and received.',
  },
  {
    title: 'Why',
    body: 'To send review requests the business asked for, to honor opt-outs, and to answer messages from customers. Customer contact details are never sold or reused for other marketing.',
  },
  {
    title: 'Protection',
    body: 'Personal fields are encrypted at rest. Each business can only reach its own data. Phone numbers and email addresses are stored as keyed hashes for matching and suppression.',
  },
  {
    title: 'Your choices',
    body: 'Every message has an opt-out. Customers can ask the business for their data or for deletion. Deletion removes personal fields and keeps a hashed record so a re-import cannot message them again.',
  },
  {
    title: 'Retention',
    body: '[Periods to be set by counsel for consent evidence and suppression records.]',
  },
];

export default function PrivacyPage() {
  return (
    <PublicFrame>
      <PageTitle>Privacy notice</PageTitle>
      <div className="mb-8 flex gap-3 rounded-control border border-warn bg-warn-soft px-4 py-3 text-body text-ink">
        <Icon name="alert" className="mt-1 text-warn" />
        <p className="m-0">DRAFT: pending legal review. This page is not legal advice and must be replaced before launch.</p>
      </div>
      <div>
        {SECTIONS.map((section) => (
          <section key={section.title} className="border-t border-line py-6 first:border-t-0 first:pt-0">
            <h2 className="sn-section-heading">{section.title}</h2>
            <p className="m-0 text-body text-ink">{section.body}</p>
          </section>
        ))}
      </div>
    </PublicFrame>
  );
}
