# Decisions, assumptions, unverified items, and legal review

This file records every place where the build differs from the brief, every assumption, and every
claim that could not be checked from the code alone. Read it before any live send.

## 1. Decisions made

### Stack
- **Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4.** Plain components instead of shadcn/ui: fewer generated files, and the UI is small.
- **Postgres 16 with `pg`** (no ORM). Migrations are plain SQL in `db/migrations`, applied by `scripts/migrate.ts`, which records them in `schema_migrations`.
- **Local Postgres is required.** The sandbox removes paid services, not the database. `docker-compose.yml` is provided for people without a local server.
- **Playwright 1.63 and `@axe-core/playwright`.** Chromium is taken from the environment path when present.

### Tenant isolation
- The runtime connects as `starnudge_app`, which is not the table owner, so row-level security applies. Every tenant table is keyed by `business_id`.
- `withTenant` sets `app.business_id` inside a transaction, so pooled connections cannot carry a tenant over to another request.
- Cross-tenant lookups go through narrow `SECURITY DEFINER` functions (sender number, provider message ID, short code, Stripe customer, session, due-request claim, pending deletion).

### Data protection
- Personal fields (names, phone, email, message bodies) are encrypted per field with AES-256-GCM. Phone and email matching uses keyed HMAC hashes, so dedupe and suppression never need the plaintext.
- Owner email addresses are in `users` (plaintext) because login needs them. Owner notices copy the address into `messages`, encrypted.

### Sending
- Send path: plan in one transaction, call the provider outside any transaction, then finalize in another. A crash after the provider accepts a message is recorded as `unknown`, never silently resent.
- **Retries:** up to 3 attempts with backoff of 30 s then 60 s. Only definitely-not-accepted errors (rate limits, busy) are retried. Timeouts and 5xx responses are **not** retried, because the provider may already have sent the message. This is stricter than the brief needs and avoids duplicate texts.
- **`sent` means accepted by the provider.** `delivered` comes only from a provider receipt.
- **Status transition added:** `sending` → `queued` on a transient retry. The brief listed no such transition.
- **Expiry:** a request unsent 48 hours after its due time is expired.
- **Pending sender:** holds the request and retries every 15 minutes. It never switches to email.
- **Review link not confirmed:** holds the request with reason `review_link_unconfirmed`, so nothing sends before the owner confirms the link.

### Dispatch rules
- **Channel-specific suppressions (deviation from check 2).** The brief said any bounce or complaint suppression blocks the contact. This build keeps channel-specific suppressions (SMS invalid, email bounce or complaint) and only blocks the whole contact for deletion and opt-out. Reason: an email bounce should not stop a text the customer consented to. If counsel prefers the stricter reading, change the `evaluateDispatch` channel logic and the suppression writes together.
- **Automation recency (7 days) applies to manual visits too,** not only imports. The brief stated it for imports only. Reason: otherwise a back-dated manual entry would message an old visit.
- **Dedupe merges on phone only.** Email-only matches are flagged and skipped for the owner, as the brief asks. The brief left email-only handling open.

### Clicks and attribution
- **Click counts are per business, not per request.** The brief put `clicked_at` on each request. Per-customer tracking would give each customer a different link, which weakens R1 (same ask). Clicks come from one app short link per business. The dashboard labels them as possibly inflated by link scanners.
- Owner-reported reviews live in their own table (`owner_logged_reviews`), not as a column on requests. A review cannot be linked to a request by Google, so a per-request column would imply attribution the app does not have.

### Opt-outs and unsubscribe
- An email unsubscribe is business-wide, like SMS STOP (R5). It blocks texts too. This is intentional and is the strictest reading of R5.
- Unknown numbers that send STOP are recorded as a hashed suppression, so a later import cannot message them.

### Import
- Added an optional `visit_type` column (`service` or `sale`). It defaults to `service`. The brief did not list it, but retail and service templates differ.
- Imports with a `consent_type` create a consent record attributed to the importing owner. The consent date comes from the file. The owner is attesting that consent was given.
- Re-importing the same visit is skipped, so a repeated upload adds nothing.

### Templates and lint
- The rating pattern and the incentive word list are conservative. "free" is on the list, so "feel free to reach out" will be blocked. That false positive is accepted; the owner can rephrase.
- Default copy is written in English and Spanish for six industries. Dental and medical copy never includes `{service}`.
- The support link ("Have a problem? Contact us") is added to every message that lacks it. Its wording is checked for "instead of reviewing" phrasing.

### Sandbox
- All providers have sandbox adapters with scripted faults. The sandbox page simulates replies, receipts, bounces, complaints, unsubscribes, and sender approval.
- Sandbox phone numbers are fictional: customers use +1 212 555-0100 to 0199, and sandbox sender numbers use +1 212 555-0150 to 0199.
- `STARNUDGE_SANDBOX_NOW` pins the clock, but only when sandbox mode is on. Tests use a fixed-offset zone chosen at runtime, so worker tests do not depend on the hour they run at.

### Authentication
- Email and password only. **Google sign-in is not built** (the brief said "email or Google"). Scrypt password hashes, HttpOnly session cookies with SameSite=Lax, 14-day sessions stored as SHA-256 hashes.
- One owner per business in the MVP. Staff roles are Phase 2.

### Phase 2
- Migration `002_phase2.sql` creates empty `reviews` and `review_replies` tables with RLS, as the brief asked.
- `src/lib/adapters/google-business.ts` is an interface with a no-op implementation. No Google connection exists yet.

## 2. Assumptions

- **Standard Google review URL shapes.** `search.google.com/local/writereview?placeid=…` and `g.page/r/…/review` are accepted. Neither format is documented by Google, so both need a browser check (see section 3).
- **Place ID format.** Accepted when it is 15 or more characters from `[A-Za-z0-9_-]`. This is a loose check.
- **Timezone handling.** Customer local time comes from the customer’s stored zone, or the business zone when none is stored. Quiet hours are checked at the moment of dispatch.
- **Expiry window.** The 48-hour expiry is measured from the request’s due time, not from when the visit was recorded.
- **Owner notices.** The owner is notified by email on inbound messages, contact-page messages, and blocked templates. Notices are sent through the same email adapter.
- **Email sender identity.** Customer emails and owner notices both use `NOTIFY_FROM_EMAIL`. This is an assumption, not a decision: customers will see "StarNudge", not the business name. See section 4.

## 3. Unverified items

These were not confirmed against primary sources in this build. Check each before launch.

| Item | What was assumed | How to verify |
|---|---|---|
| Google writereview link | `search.google.com/local/writereview?placeid=` opens the review box. Earlier research found reports of 400 errors for some users. | Open the link in a private window for a real business. The onboarding page asks the owner to confirm this. |
| Google short review link | `g.page/r/…/review` opens the review box. | Same as above, using the link from the business profile. |
| Google Business Profile API | Access needs a request, approval can take up to 14 days, and there is no sandbox. | Read Google’s current Business Profile API documentation. Not used in this build. |
| Google review policy on the support link | A "Have a problem? Contact us" link in every review request is acceptable. | Check Google’s current prohibited and restricted content policy. A legal and policy review is needed. |
| Google reply moderation | Replies may be held for review before they show. | Phase 2 only. Check Google’s current behavior. |
| 10DLC registration | The fields collected in onboarding match what a carrier registry asks for. | Check the current field list with the SMS provider. Status is set manually in live mode. |
| SMS STOP keywords | STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT opt out; HELP, INFO get help; START and UNSTOP do not re-subscribe. | Compare with the provider’s current keyword list. |
| SMS segment counts | GSM 03.38 basic and extension sets; 160 and 153 units for GSM-7; 70 and 67 for UCS-2. | Check against the provider’s documentation. Spanish accented vowels (á, í, ó, ú) force UCS-2. |
| Provider webhook formats | Twilio form posts, Svix headers for Resend, Stripe’s `Stripe-Signature` header. Implemented from public documentation. | Test against live webhook deliveries in a staging environment. |
| Live provider calls | Twilio, Resend, and Stripe adapters map status codes to error kinds. Only the request shape and error mapping are unit-tested. | Run one real send to a test number in a staging environment. |
| Email List-Unsubscribe headers | RFC 8058 one-click headers are sent. | Check with a mailbox provider’s bulk-sender requirements. |
| Click counts | Link scanners may inflate SMS click counts. | Compare with real data before trusting the metric. |

## 4. Items that need legal review

1. **Written consent (PEWC) for US texts.** The wording of the disclosure, the evidence format, and whether a paper form or a verbal yes qualifies. Current design: the owner records the source and date; the app does not capture consent from the customer directly.
2. **Whether a review request counts as marketing** under TCPA and carrier rules. Current design: the stricter standard applies to every text, including manual sends.
3. **Email without a recorded opt-in.** The brief’s `email_relationship` basis stays off. Email is sent only with `email_opt_in`. Whether even that is enough for every business type needs counsel.
4. **Customer-facing sender identity.** Customer emails currently come from "StarNudge". Counsel should decide whether emails should come from the business or a verified sending domain, and what the From line must say under CAN-SPAM.
5. **Health-privacy.** The `{service}` field is off for dental and medical businesses by default. Confirm whether these businesses are covered entities and whether any service name in a text is a disclosure.
6. **Retention periods.** For consent evidence and hashed suppression records. The code keeps both until deleted. No automatic purge exists.
7. **Automatic renewal and cancellation.** The brief asks for one-action cancellation with the effective date shown. State auto-renewal rules may require more (for example, a confirmation step or a specific notice). Current design: cancellation takes effect at the end of the paid period.
8. **EU contacts.** An EU flag and lawful-basis field exist in the schema, but no UI sets them. Lawful basis and deletion wording need counsel. Right now EU handling is not built.
9. **Privacy notice.** `/privacy` is a draft marked as pending legal review, with placeholders for the legal entity and retention periods.
10. **Deletion and backups.** Deletion removes personal fields in the live database. Backups keep them until they expire. Counsel must decide whether that is acceptable and what the notice should say.

## 5. Known gaps (not built)

- Google sign-in (see Authentication).
- Google Business Profile connection and review replies (Phase 2).
- Multi-location, staff roles, and agency mode (Phase 2).
- Printable QR poster and table-tent PDFs (the QR page prints from the browser instead).
- Integrations with Square, Shopify, Toast, Jobber, and Housecall Pro (Phase 2).
- An automatic 10DLC status feed. Live sender status is set by the operator.
- Accessibility checks beyond two pages.
- Live provider verification (see section 3).
