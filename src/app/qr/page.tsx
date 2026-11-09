import QRCode from 'qrcode';
import Link from 'next/link';
import type { Metadata } from 'next';
import { requireSession } from '@/lib/auth';
import { getBusinessProfile, getQrTarget } from '@/lib/services/views';
import { EmptyState, secondaryButtonClass, Shell } from '@/app/_components/ui';
import { Icon } from '@/app/_components/icons';
import { PageHead } from '@/app/_ops/ops';
import styles from '@/app/_ops/qr.module.css';

export const metadata: Metadata = { title: 'QR code' };
export const dynamic = 'force-dynamic';

export default async function QrPage() {
  const s = await requireSession();
  const [target, profile] = await Promise.all([getQrTarget(s.businessId), getBusinessProfile(s.businessId)]);
  // margin 4 is the generator's default quiet zone: the white space a camera needs around the code.
  const svg = target ? await QRCode.toString(target.url, { type: 'svg', margin: 4, width: 260 }) : null;

  return (
    <Shell>
      <PageHead title="QR code" lead="This QR code opens your review link. Print it on a counter card or table tent." />

      {target && svg ? (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <div className={styles.printArea}>
            <article className={styles.card} aria-labelledby="qr-card-title">
              {profile?.name ? <p className={styles.business}>{profile.name}</p> : null}
              <h2 id="qr-card-title" className={styles.headline}>
                Share your experience
              </h2>
              <div role="img" aria-label={`QR code that opens ${target.url}`} className={styles.tile} dangerouslySetInnerHTML={{ __html: svg }} />
              <p className={styles.caption}>Scan with your phone camera</p>
              <p className={styles.url}>{target.url}</p>
            </article>
          </div>

          <section aria-labelledby="qr-how" className="sn-card">
            <h2 id="qr-how" className="sn-section-heading">
              How to use the card
            </h2>
            <ol className="flex list-decimal flex-col gap-3 pl-5 text-body text-ink-soft marker:font-semibold marker:text-ink">
              <li>
                Use your browser’s print command to print this page. Only the card prints.
              </li>
              <li>Place the printed card on a counter or in a table tent where customers can see it.</li>
            </ol>
            <div className="mt-5 flex gap-3 rounded-[var(--radius-control)] border border-warn bg-warn-soft p-4 text-body text-ink">
              <Icon name="alert" className="mt-1 text-warn" />
              <p>Do not ask customers to scan it while they are in your store with a request to review.</p>
            </div>
          </section>
        </div>
      ) : (
        <EmptyState
          level={2}
          icon="qr"
          title="Set up your review link first"
          action={
            <Link href="/onboarding" className={secondaryButtonClass}>
              Set up review link
            </Link>
          }
        >
          <p>The QR code opens your review link, so it appears here once that link is saved.</p>
        </EmptyState>
      )}
    </Shell>
  );
}
