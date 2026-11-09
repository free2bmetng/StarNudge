# Compliance map

Each rule from the build brief, where the code enforces it, and the tests that check it.
Status values: **Enforced + tested**, **Enforced, not tested**, **Partial**, **Operator task**.
Items that need legal review are listed in `docs/decisions.md`.

## Hard rules (Section 2)

| Rule ID | Requirement | Where enforced (file and function) | Test names | Status |
|---|---|---|---|---|
| R1 | Same ask: every customer gets the same review link and the same wording for their language. Merge fields change only the text. | `src/lib/templates.ts` `renderMessage`; `src/lib/services/pipeline.ts` `planRequest` picks one template per channel, kind, and language; the dispatch function takes no customer-specific copy input. | `renders the support link and opt-out text`, `default templates for every industry pass lint` | Enforced, partly tested. No test compares two customers’ messages directly. |
| R2 | No gating: eligibility never depends on review, rating, feedback, sentiment, or complaints. | `src/lib/dispatch.ts` `evaluateDispatch`, `DISPATCH_INPUT_KEYS`. The input type has no such fields. | `rule R2: eligibility has no rating, review, feedback, sentiment, or complaint input` | Enforced + tested (the test checks field names, not behavior). |
| R3 | No incentives, quotas, or changes to reviews. Every template passes lint before save and before send. | `src/lib/lint.ts` `lintTemplate`; `src/lib/services/templates-admin.ts` `updateTemplate` (blocks saving); `src/lib/services/pipeline.ts` `planRequest` (re-lints before send, suppresses as `template_invalid`). No kiosk or tablet mode exists in the UI. | `blocks rating language`, `blocks incentive words as whole words`, `blocks asking someone to change or remove a review`, `blocks presenting the support link as a replacement for leaving a review`, `an owner cannot save wording that fails lint`, `a template that fails lint is held back and the owner is told` | Enforced + tested. Quotas and kiosk modes are absent by design, not tested. |
| R4 | Honest billing: monthly, public prices, no contract, no setup or renewal fees, one-action cancellation. | `src/lib/services/billing.ts` `startSubscription`, `cancelSubscription`; `src/app/settings/page.tsx`; prices come from `PRICE_LABEL` (placeholder). | None automated. | Partial. Prices are placeholders, and billing has no automated test. |
| R5 | Opt-outs are immediate and business-wide, on any channel, and no import, merge, or provider default can reverse one. | `src/lib/services/inbound.ts` `recordOptOut`, `handleInboundSms`, `unsubscribeWithToken`; dispatch check 1 in `src/lib/dispatch.ts`; import check in `src/lib/services/imports.ts`; table `opt_outs` and `suppressions` in `db/migrations/001_init.sql`. | `STOP by text blocks every channel for the business (rule R5)`, `START does not re-subscribe the customer`, `re-importing an opted-out customer does not re-enable sending`, `a bare STOP from an unknown number is recorded as a suppression`, `accepts a signed STOP and blocks the customer`, `a one-click POST with a valid token opts the customer out of every channel` | Enforced + tested. |
| R6 | Requests and displays only. The app never creates, edits, or deletes a review or rating. | No code path writes to a Google review. `reviews` and `review_replies` exist only as empty Phase 2 tables (`db/migrations/002_phase2.sql`). | None automated. | Enforced by design. The Phase 2 adapter is a no-op (`src/lib/adapters/google-business.ts`). |
| R7 | SMS consent: never send from an unregistered sender; US marketing texts need written consent (PEWC); no SMS to non-US numbers by default. | Dispatch checks 3 and 4 in `src/lib/dispatch.ts`; `src/lib/services/customers.ts` `createCustomer` and `addConsent` (US number required); `src/lib/import-rules.ts` `validateImport`. | `no consent means no message at all`, `an unapproved SMS sender holds the request and never sends by email instead`, `text consent needs a US number`, `SMS consent needs a US phone number`, `email requires email_opt_in`, `the eligibility function…` (see R2) | Enforced + tested. The wording of the consent disclosure is a legal item. |
| R8 | Email: physical postal address in the footer, a working unsubscribe link, and one-click unsubscribe headers. | `src/lib/templates.ts` `renderMessage` (footer); `src/lib/services/pipeline.ts` `planRequest` (`List-Unsubscribe`, `List-Unsubscribe-Post` headers); `src/app/api/unsubscribe/route.ts`. | `email gets the postal address and unsubscribe footer`, `a one-click POST with a valid token opts the customer out of every channel`, `a forged token does nothing` | Enforced + tested. |
| R9 | Privacy: encrypt at rest and in transit; owners can export and delete; never sell or reuse contact data; privacy policy is a draft. | `src/lib/crypto.ts` `encryptField` (AES-256-GCM per field), `hashContact` (keyed hashes); `src/lib/services/deletion.ts` `processDeletion`; `src/lib/services/customers.ts` `requestDeletion`, `exportCustomer`; `src/app/api/customers/[id]/export/route.ts`; `src/app/privacy/page.tsx` (draft). | `round-trips encrypted fields and rejects tampering`, `encrypts the same value differently each time`, `cancels pending requests now, removes personal data on the worker, and keeps the block` | Enforced + tested for field encryption and deletion. Encryption of the disk and backups is an operator task (see README). |

## Send pipeline checks (Section 6)

| Check | Requirement | Where enforced | Test names | Status |
|---|---|---|---|---|
| 1 | Opt-out: suppressed (`opted_out`). | `evaluateDispatch` | `opt-out beats everything else` | Enforced + tested |
| 2 | Contact status: deleted, or a contact-wide suppression. | `evaluateDispatch`; suppressions with channel `all` | `check 2: deleted customers and contact-wide suppressions stop the request` | Enforced + tested |
| 3 | Channel: SMS needs PEWC and a US number; email needs an opt-in; otherwise `no_basis`. Channel-specific suppressions move the request to the other channel. | `evaluateDispatch` | `check 3: SMS needs written consent…`, `check 3: a channel-specific suppression moves the request…`, `an email bounce blocks further email to that address`, `a permanent invalid-number error suppresses the SMS channel for that contact` | Enforced + tested. Deviation from the literal brief, recorded in `docs/decisions.md`. |
| 4 | Sender: an unapproved SMS sender holds the request; the channel never switches. | `evaluateDispatch` | `check 4: an unapproved SMS sender holds the request…`, `an unapproved SMS sender holds the request and never sends by email instead` | Enforced + tested |
| 5 | Frequency cap: 90 days, manual and automated both count. | `evaluateDispatch`; the count query in `planRequest` | `check 5: the frequency cap suppresses…`, `a second request to the same customer hits the 90-day cap` | Enforced + tested |
| 6 | Quiet hours: 08:00 to 21:00 in the customer’s time zone; deferred to the next 08:00. | `isInSendWindow`, `nextLocalHour` in `src/lib/time.ts`; `evaluateDispatch` | `check 6: quiet hours defer…`, `check 6: a customer time zone overrides…`, `quiet hours defer to 08:00 the next morning, not drop the request`, `send window is [start, end)`, `finds the next 08:00 across a daylight-saving change` | Enforced + tested |
| 7 | Template passes lint at send time. | `planRequest` re-lints; `evaluateDispatch` check 7 | `check 7: a template that fails lint suppresses the request`, `a template that fails lint is held back and the owner is told` | Enforced + tested |
| 8 | Idempotency: one message per request attempt; duplicate enqueue creates nothing. | Unique index `messages_request_attempt_uq` and unique key `review_requests (business_id, idempotency_key)` in `db/migrations/001_init.sql`; `enqueueAutomation`. | `the request-attempt uniqueness index blocks a second message for the same attempt`, `enqueueAutomation is idempotent for the same visit` | Enforced + tested |

## Tenant isolation and data access

| Concern | Enforcement | Test names | Status |
|---|---|---|---|
| A business cannot read or change another business’s rows. | Row-level security on every tenant table, keyed to `app.business_id`, set per transaction in `src/lib/db.ts` `withTenant`. The runtime role is not the owner. | `a business only sees its own customers`, `cannot update another business’s rows`, `cannot insert a row that claims another business`, `the tenant setting does not leak…` | Enforced + tested |
| No tenant set, no rows. | RLS with a null tenant returns nothing. | `without a tenant set, the runtime role sees no tenant rows at all` | Enforced + tested |
| Cross-tenant lookups (webhooks, worker, short links) are narrow. | `SECURITY DEFINER` functions in `db/migrations/001_init.sql` return only IDs. | Exercised by the webhook, worker, and short-link tests. | Enforced, indirectly tested |

## Security controls

| Concern | Enforcement | Test names | Status |
|---|---|---|---|
| Webhooks must be signed. | `src/lib/webhook-verify.ts` (sandbox HMAC, Stripe, Svix, Twilio). Forged requests get 401 or 403 before any database write. | `rejects a forged signature with 401 and changes nothing`, `rejects an unsigned bounce`, `Stripe: checks the signature and the five-minute tolerance`, `Svix (Resend): verifies…`, `Twilio: verifies…` | Enforced + tested. Live header formats are unverified (see decisions). |
| The cron endpoint needs a secret. | `src/app/api/cron/dispatch/route.ts` | `refuses calls without the secret`, `runs a tick with the right secret` | Enforced + tested |
| Sandbox actions cannot run in live mode. | `src/app/actions/sandbox.ts` `requireSandbox`; the sandbox page returns 404 outside sandbox mode. | None automated. | Enforced, not tested |
| Retries never duplicate an ambiguous send. | `src/lib/services/pipeline.ts` `finalize`: ambiguous outcomes are not retried. | `an ambiguous outcome is never retried, so no duplicate text goes out` | Enforced + tested |
| Retries are limited to three attempts. | `finalize` with `LIMITS.maxSendAttempts`. | `retries a transient error up to three attempts, then fails for good` | Enforced + tested |
| Accessibility and mobile layout. | Playwright checks at 360px and axe (WCAG 2.2 AA) on sign-up and log-in. | `public pages fit a 360px screen…`, `sign-up and log-in pass axe WCAG 2.2 AA checks`, `the dashboard fits a 360px screen` | Partial. Axe covers two pages only. |

## Operator tasks (not enforced by code)

- Keep `APP_ENCRYPTION_KEY`, `APP_HASH_KEY`, and `CRON_SECRET` out of source control and rotate them under a plan.
- Enable disk encryption on the database host and back up with encryption. Backups keep personal data until they expire; see the README.
- Complete the legal review items in `docs/decisions.md` before any live send.
- Register the SMS sender with the carrier registry and update the sender status to match, since no automatic registry feed is built.
