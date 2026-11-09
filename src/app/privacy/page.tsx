import { Public, PageTitle } from '@/app/_components/ui';

export const dynamic = 'force-static';

export default function PrivacyPage() {
  return (
    <Public>
      <PageTitle lead="DRAFT: pending legal review. This page is not legal advice and must be replaced before launch.">
        Privacy notice
      </PageTitle>
      <div className="space-y-4 text-base text-stone-900">
        <p>
          <strong>Who we are.</strong> [Legal entity name, address, and contact email to be filled in by the operator.]
        </p>
        <p>
          <strong>What we process.</strong> For businesses: account details, the review link, sender registration details,
          and billing status. For their customers: name, phone number or email, the service or purchase, consent records,
          and the messages sent and received.
        </p>
        <p>
          <strong>Why.</strong> To send review requests the business asked for, to honor opt-outs, and to answer messages
          from customers. Customer contact details are never sold or reused for other marketing.
        </p>
        <p>
          <strong>Protection.</strong> Personal fields are encrypted at rest. Each business can only reach its own data.
          Phone numbers and email addresses are stored as keyed hashes for matching and suppression.
        </p>
        <p>
          <strong>Your choices.</strong> Every message has an opt-out. Customers can ask the business for their data or
          for deletion. Deletion removes personal fields and keeps a hashed record so a re-import cannot message them again.
        </p>
        <p>
          <strong>Retention.</strong> [Periods to be set by counsel for consent evidence and suppression records.]
        </p>
      </div>
    </Public>
  );
}
