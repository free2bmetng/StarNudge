import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { cfg } from '@/lib/config';
import { getOnboardingState } from '@/lib/services/views';
import { confirmReviewLinkAction, saveReviewLinkAction, submitSenderAction } from '@/app/actions/onboarding';
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

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const state = await getOnboardingState(s.businessId);
  const sandbox = cfg().sandboxMode;
  const senderFields = state.sender?.fields ?? {};

  return (
    <Shell>
      <PageTitle lead="Two steps before your first request can go out.">Set up StarNudge</PageTitle>
      <Flash error={param(sp.error)} notice={param(sp.notice)} />

      <Section title="1. Your Google review link">
        <p className="mb-3 text-base text-stone-800">
          Open your Google Business Profile, choose <strong>Get more reviews</strong>, and copy the link. If you cannot
          find it, paste your Place ID instead.
        </p>
        <form action={saveReviewLinkAction} className="space-y-3">
          <div>
            <label htmlFor="url" className={labelClass}>Review link</label>
            <input id="url" name="url" type="url" placeholder="https://g.page/r/…" className={inputClass} defaultValue={state.link?.url ?? ''} />
          </div>
          <div>
            <label htmlFor="placeId" className={labelClass}>Or your Place ID</label>
            <input id="placeId" name="placeId" className={inputClass} defaultValue={state.link?.place_id ?? ''} />
            <p className={hintClass}>Used only if the review link above is empty.</p>
          </div>
          <button type="submit" className={buttonClass}>Save review link</button>
        </form>

        {state.link ? (
          <div className="mt-5 border-t border-stone-200 pt-4">
            <p className="mb-3 text-base text-stone-800">
              Open this link in a private browser window and check that the review box appears.{' '}
              <a href={state.link.url} target="_blank" rel="noreferrer" className="font-medium underline">
                Open my review link
              </a>
            </p>
            {state.link.confirmed_at ? (
              <p className="text-base font-medium text-emerald-900">Confirmed. Requests can be sent.</p>
            ) : (
              <form action={confirmReviewLinkAction} className="space-y-3">
                <label className="flex items-start gap-3 text-base">
                  <input type="checkbox" name="confirmed" className="mt-1 h-5 w-5" required />
                  <span>I opened the link and the review box appeared.</span>
                </label>
                <button type="submit" className={buttonClass}>Confirm review link</button>
              </form>
            )}
          </div>
        ) : null}
      </Section>

      <Section title="2. Text-message sender">
        {state.sender?.status === 'approved' ? (
          <p className="text-base text-stone-800">
            Approved{sandbox ? ' in the sandbox' : ''}: sending from <span className="font-mono">{state.sender.sender_number}</span>.
          </p>
        ) : (
          <>
            <p className="mb-3 text-base text-stone-800">
              US text messages need a registered sender (10DLC). Status:{' '}
              <strong>{(state.sender?.status ?? 'not_started').replace(/_/g, ' ')}</strong>. Email works without this.
            </p>
            <form action={submitSenderAction} className="space-y-3">
              <div>
                <label htmlFor="legalName" className={labelClass}>Legal business name</label>
                <input id="legalName" name="legalName" required className={inputClass} defaultValue={senderFields.legalName ?? ''} />
              </div>
              <div>
                <label htmlFor="website" className={labelClass}>Website</label>
                <input id="website" name="website" type="url" className={inputClass} defaultValue={senderFields.website ?? ''} />
              </div>
              <div>
                <label htmlFor="useCase" className={labelClass}>Use case</label>
                <textarea id="useCase" name="useCase" required rows={2} minLength={20} className={inputClass} defaultValue={senderFields.useCase ?? ''} />
                <p className={hintClass}>Example: asking recent customers to share a review of their visit.</p>
              </div>
              <div>
                <label htmlFor="sampleMessage" className={labelClass}>Sample message</label>
                <textarea id="sampleMessage" name="sampleMessage" required rows={2} minLength={10} className={inputClass} defaultValue={senderFields.sampleMessage ?? ''} />
              </div>
              <div>
                <label htmlFor="consentDescription" className={labelClass}>How customers gave text consent</label>
                <textarea id="consentDescription" name="consentDescription" required rows={2} minLength={20} className={inputClass} defaultValue={senderFields.consentDescription ?? ''} />
              </div>
              <button type="submit" className={buttonClass}>Submit sender registration</button>
            </form>
          </>
        )}
      </Section>

      <div className={cardClass}>
        <p className="text-base text-stone-800">When both steps are done, add your first customers.</p>
        <Link href="/customers" className="mt-3 inline-block text-base font-medium underline">Go to customers</Link>
      </div>
    </Shell>
  );
}
