import { IconStar } from '@/app/_components/icons';

/*
 * Product visual for the landing page: one review request as a customer receives it.
 * The wording follows the real SMS format: the request, the review link, the support
 * line, then the opt-out line that every message carries. Sample names and links only.
 */
export function PhoneMock() {
  return (
    <figure className="m-0 mx-auto w-full max-w-[19rem]">
      <figcaption className="sr-only">Example review request text message</figcaption>
      <div className="rounded-[2.5rem] border border-line-strong bg-sunken p-2.5 shadow-float">
        <div className="overflow-hidden rounded-[2rem] border border-line bg-canvas">
          <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3">
            <span className="sn-brand-mark" aria-hidden="true">
              <IconStar fill="currentColor" />
            </span>
            <div className="min-w-0">
              <p className="m-0 text-body font-semibold leading-snug text-ink">Your business</p>
              <p className="m-0 text-meta leading-snug text-ink-muted">Text message</p>
            </div>
          </div>
          <div className="px-3 pb-6 pt-5">
            <p className="m-0 text-center text-meta text-ink-muted">Today</p>
            <div className="mt-4 max-w-[92%] rounded-[1.25rem] rounded-tl-sm border border-line bg-surface px-4 py-3 shadow-rest">
              <p className="m-0 text-body text-ink">
                Hi Maria, thanks for your visit. Would you share a few words about it?
              </p>
              <p className="m-0 mt-2 text-body">
                <span className="text-accent underline underline-offset-4">https://g.page/r/example</span>
              </p>
              <p className="m-0 mt-3 text-meta text-ink-soft">
                Have a problem? Contact us: https://sn.example/c/k7x2
              </p>
              <p className="m-0 mt-1 text-meta text-ink-soft">Reply STOP to opt out.</p>
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}
