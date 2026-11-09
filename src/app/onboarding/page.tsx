import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { cfg } from '@/lib/config';
import { getOnboardingState, listCustomerOptions } from '@/lib/services/views';
import { confirmReviewLinkAction, saveReviewLinkAction, submitSenderAction } from '@/app/actions/onboarding';
import {
  buttonClass,
  Flash,
  hintClass,
  inputClass,
  labelClass,
  param,
  PageTitle,
  secondaryButtonClass,
  Shell,
} from '@/app/_components/ui';
import { Icon } from '@/app/_components/icons';
import { FieldGroup, SenderBadge, SetupProgress, StepCard, type StepState } from '@/app/_setup/parts';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const state = await getOnboardingState(s.businessId);
  const customers = await listCustomerOptions(s.businessId);
  const sandbox = cfg().sandboxMode;
  const senderFields = state.sender?.fields ?? {};
  const senderStatus = state.sender?.status ?? 'not_started';

  // Steps run in order. The first step that is not done is current, and the steps after it are waiting.
  const linkDone = Boolean(state.link?.confirmed_at);
  const senderDone = senderStatus === 'approved';
  const customersDone = customers.length > 0;
  const linkState: StepState = linkDone ? 'done' : 'current';
  const senderState: StepState = senderDone ? 'done' : linkDone ? 'current' : 'waiting';
  const customerState: StepState = customersDone ? 'done' : linkDone && senderDone ? 'current' : 'waiting';

  return (
    <Shell>
      <PageTitle lead="Three steps. Requests can go out once the review link is confirmed. Text messages also need an approved sender.">
        Set up StarNudge
      </PageTitle>
      <Flash error={param(sp.error)} notice={param(sp.notice)} />

      <div className="grid gap-6">
        <SetupProgress
          steps={[
            { label: 'Review link', state: linkState },
            { label: 'Text sender', state: senderState },
            { label: 'First customer', state: customerState },
          ]}
        />

        <StepCard n={1} total={3} title="Your Google review link" state={linkState}>
          <p className="m-0 max-w-prose">
            Open your Google Business Profile, choose <strong>Get more reviews</strong>, and copy the link. If you cannot
            find it, paste your Place ID instead.
          </p>
          <form action={saveReviewLinkAction} className="mt-4 grid gap-4">
            <div>
              <label htmlFor="url" className={labelClass}>Review link</label>
              <input id="url" name="url" type="url" placeholder="https://g.page/r/…" className={inputClass} defaultValue={state.link?.url ?? ''} />
            </div>
            <div>
              <label htmlFor="placeId" className={labelClass}>Or your Place ID</label>
              <input id="placeId" name="placeId" className={inputClass} defaultValue={state.link?.place_id ?? ''} />
              <p className={hintClass}>Used only if the review link above is empty.</p>
            </div>
            <div>
              <button type="submit" className={state.link ? secondaryButtonClass : buttonClass}>Save review link</button>
            </div>
          </form>

          {state.link ? (
            <div className="mt-6 grid gap-4 border-t border-line pt-6">
              <div className="grid gap-2">
                <h3 className="m-0 text-body font-semibold">What you are checking</h3>
                <p className="m-0 max-w-prose">
                  Customers reach your review box through your short link, from texts and the QR code. That short link
                  only works after you confirm this one. Open the link below in a private browser window, which shows
                  what a new customer sees, and check that the review box for your business appears.
                </p>
                <p className="m-0 max-w-prose text-ink-soft">
                  If the box does not appear, paste a different link above, save it, and check again.
                </p>
              </div>

              <div>
                <a href={state.link.url} target="_blank" rel="noreferrer" className={secondaryButtonClass}>
                  Open my review link
                </a>
                <p className={hintClass}>Opens in a new tab.</p>
              </div>

              {state.link.confirmed_at ? (
                <p className="m-0 flex items-start gap-3 rounded-control bg-good-soft p-3">
                  <Icon name="check" className="mt-1 text-good" />
                  <span>Confirmed. Requests can be sent.</span>
                </p>
              ) : (
                <form action={confirmReviewLinkAction} className="grid gap-4">
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-control border border-line-strong bg-surface p-3">
                    <input type="checkbox" name="confirmed" className="mt-0.5" required />
                    <span>I opened the link and the review box appeared.</span>
                  </label>
                  <div>
                    <button type="submit" className={linkState === 'current' ? buttonClass : secondaryButtonClass}>
                      Confirm review link
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : null}
        </StepCard>

        <StepCard n={2} total={3} title="Text-message sender" state={senderState}>
          {senderStatus === 'approved' ? (
            <p className="m-0 flex items-start gap-3 rounded-control bg-good-soft p-3">
              <Icon name="check" className="mt-1 text-good" />
              <span>
                Approved{sandbox ? ' in the sandbox' : ''}: sending from <span className="font-mono">{state.sender?.sender_number}</span>.
              </span>
            </p>
          ) : (
            <>
              <p className="m-0 flex flex-wrap items-center gap-2">
                <span className="text-ink-soft">Status</span>
                <SenderBadge status={senderStatus} />
              </p>
              <p className="mt-3 max-w-prose">
                US text messages need a registered sender (10DLC). Email works without this.
              </p>
              {senderStatus === 'rejected' ? (
                <p className="mt-2 max-w-prose">The registration was rejected. Fix the details below and submit again.</p>
              ) : null}
              {senderStatus === 'submitted' || senderStatus === 'pending' ? (
                <p className="mt-2 max-w-prose">Submitted. Approval can take time, and email works in the meantime.</p>
              ) : null}

              <form action={submitSenderAction} className="mt-6 grid gap-6">
                <FieldGroup legend="Business details">
                  <div>
                    <label htmlFor="legalName" className={labelClass}>Legal business name</label>
                    <input id="legalName" name="legalName" required className={inputClass} defaultValue={senderFields.legalName ?? ''} />
                  </div>
                  <div>
                    <label htmlFor="website" className={labelClass}>Website</label>
                    <input id="website" name="website" type="url" className={inputClass} defaultValue={senderFields.website ?? ''} />
                    <p className={hintClass}>Optional.</p>
                  </div>
                </FieldGroup>

                <FieldGroup legend="Your messages">
                  <div>
                    <label htmlFor="useCase" className={labelClass}>Use case</label>
                    <textarea id="useCase" name="useCase" required rows={2} minLength={20} className={inputClass} defaultValue={senderFields.useCase ?? ''} />
                    <p className={hintClass}>Example: asking recent customers to share a review of their visit.</p>
                  </div>
                  <div>
                    <label htmlFor="sampleMessage" className={labelClass}>Sample message</label>
                    <textarea id="sampleMessage" name="sampleMessage" required rows={2} minLength={10} className={inputClass} defaultValue={senderFields.sampleMessage ?? ''} />
                  </div>
                </FieldGroup>

                <FieldGroup legend="Customer consent">
                  <div>
                    <label htmlFor="consentDescription" className={labelClass}>How customers gave text consent</label>
                    <textarea id="consentDescription" name="consentDescription" required rows={2} minLength={20} className={inputClass} defaultValue={senderFields.consentDescription ?? ''} />
                    <p className={hintClass}>Example: a line on the guest card where the customer agrees to texts.</p>
                  </div>
                </FieldGroup>

                <div>
                  <button type="submit" className={senderState === 'current' ? buttonClass : secondaryButtonClass}>
                    Submit sender registration
                  </button>
                </div>
              </form>
            </>
          )}
        </StepCard>

        <StepCard n={3} total={3} title="First customer" state={customerState}>
          <p className="m-0 max-w-prose">
            {customersDone ? 'Customers are added. Add more on the customers page.' : 'Add the first customers you want to ask for a review.'}
          </p>
          {!customersDone && !senderDone ? (
            <p className={`${hintClass} max-w-prose`}>Email works without a text sender, so you can add customers now.</p>
          ) : null}
          <div className="mt-4">
            <Link href="/customers" className={customerState === 'current' ? buttonClass : secondaryButtonClass}>
              Go to customers
            </Link>
          </div>
        </StepCard>
      </div>
    </Shell>
  );
}
