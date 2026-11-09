import QRCode from 'qrcode';
import { requireSession } from '@/lib/auth';
import { getQrTarget } from '@/lib/services/views';
import { cardClass, PageTitle, Shell } from '@/app/_components/ui';

export const dynamic = 'force-dynamic';

export default async function QrPage() {
  const s = await requireSession();
  const target = await getQrTarget(s.businessId);
  const svg = target ? await QRCode.toString(target.url, { type: 'svg', margin: 1, width: 260 }) : null;

  return (
    <Shell>
      <PageTitle lead="This QR code opens your review link. Print it on a counter card or table tent.">QR code</PageTitle>
      {target && svg ? (
        <div className={`${cardClass} flex flex-col items-center gap-4 print:border-0`}>
          <div className="w-64 max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="break-all text-center font-mono text-sm">{target.url}</p>
          <p className="text-center text-sm text-stone-700">
            Use your browser’s print command to print this page. Do not ask customers to scan it while they are in your
            store with a request to review.
          </p>
        </div>
      ) : (
        <p className={cardClass}>Set up your review link first.</p>
      )}
    </Shell>
  );
}
