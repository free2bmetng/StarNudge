# StarNudge

Helps local businesses get more Google reviews. It sends one honest review request to each customer, on a schedule that respects quiet hours and opt-outs, and it never gates reviews, offers incentives, or edits reviews.

- Compliance map: [`docs/compliance.md`](docs/compliance.md)
- Decisions, assumptions, unverified items, and legal review: [`docs/decisions.md`](docs/decisions.md)

**Status:** the MVP runs end to end in sandbox mode. Live providers are implemented but not exercised against live accounts. Phase 2 (Google reviews and replies, staff roles, integrations) is not built.

## Requirements

- Node.js 20.9 or newer (tested on 22)
- PostgreSQL 16, either installed locally or through `docker-compose.yml`
- Chromium, only for end-to-end tests (Playwright)

## Quick start (sandbox, no paid accounts)

```bash
npm install
cp .env.example .env.local
```

Fill in the three secrets in `.env.local`:

```bash
openssl rand -base64 32   # APP_ENCRYPTION_KEY
openssl rand -hex 32      # APP_HASH_KEY
openssl rand -hex 32      # CRON_SECRET
```

Start Postgres (or run `docker compose up -d db`), then:

```bash
npm run db:migrate        # creates the database if needed, applies migrations, creates the app role
npm run seed              # three demo businesses with fictional contacts
npm run dev               # http://localhost:3000
```

Demo owners: `demo-restaurant@example.com`, `demo-salon@example.com`, `demo-plumber@example.com`, password `demo-password-123`.

Run the worker in a second terminal so queued requests go out:

```bash
npm run worker
```

Open **Sandbox** in the menu to approve the text sender, simulate customer replies, and mark receipts. Nothing reaches a real person.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build (type-checks everything) |
| `npm start` | Run the production build |
| `npm run db:migrate` | Create the database and role, apply pending migrations |
| `npm run seed` | Load demo data (safe to rerun) |
| `npm run worker` | Long-running worker: sends due requests, processes deletions |
| `npm run typecheck` | TypeScript check only |
| `npm test` | Unit and integration tests (needs Postgres; creates `starnudge_test`) |
| `npm run test:e2e` | Builds the app, then runs browser tests (creates `starnudge_e2e`) |

Tests use `postgres://postgres@localhost:5432/...` for setup and `starnudge_app` for the app. Change the URLs in `vitest.config.ts` and `playwright.config.ts` if your Postgres differs.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Runtime connection as `starnudge_app` (subject to row-level security) |
| `MIGRATION_DATABASE_URL` | for migrations | Owner or superuser connection, used only by `db:migrate` and tests |
| `APP_DB_PASSWORD` | for migrations | Password for the `starnudge_app` role |
| `APP_BASE_URL` | yes | Public URL, used in every link. Use `https://` in production (it also turns on Secure cookies). |
| `SANDBOX_MODE` | yes | `true` (default) for sandbox. `false` for live providers. |
| `APP_ENCRYPTION_KEY` | yes | 32-byte base64 key for field encryption. Losing it makes stored personal data unreadable. |
| `APP_HASH_KEY` | yes | Secret for contact hashes and unsubscribe tokens. Rotating it breaks suppression matching. |
| `CRON_SECRET` | for cron | Bearer token for `POST /api/cron/dispatch` |
| `SANDBOX_WEBHOOK_SECRET` | sandbox | HMAC key for sandbox webhooks |
| `NOTIFY_FROM_EMAIL` | yes | From address for emails (see decisions: sender identity is a legal item) |
| `PRICE_LABEL` | no | Price text shown on the settings page. Placeholder by default. |
| `WORKER_INTERVAL_MS` | no | Worker polling interval, default 15000 |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | live SMS | Twilio REST API |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | live email | Resend API and Svix webhook secret |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` | live billing | Stripe Checkout and webhooks |

`STARNUDGE_SANDBOX_NOW` pins the clock in sandbox mode only. It exists for end-to-end tests and is ignored in live mode.

## How it works

**Tenancy.** Every business is a tenant. Each request runs inside `withTenant`, which sets `app.business_id` for the transaction. Row-level security then limits every query to that business, even if application code has a bug.

**Sending.** Every automated and manual request passes the same checks in this order: opt-out, contact status, channel (consent and US number), sender approval, the 90-day frequency cap, quiet hours in the customer’s time zone, and template lint. Each check runs again at send time. A send is planned in one short transaction, sent outside any transaction, and recorded in another. An ambiguous provider outcome is never retried, so a customer cannot receive two texts from one request.

**Opt-outs.** A STOP on any channel blocks every channel for that business. Re-importing a file does not undo it.

**Worker and scheduler.** Requests are queued in Postgres. Either run `npm run worker` as a long-lived process, or call `POST /api/cron/dispatch` with `Authorization: Bearer $CRON_SECRET` from any scheduler (cron, Vercel Cron, or an external pinger). Both claim work with a short lease, so running both is safe.

## Going live

1. Set `SANDBOX_MODE=false` and fill in the live provider variables. A live adapter with missing credentials fails its first use with a clear message, so check the logs after the first send.
2. Point the provider webhooks at your public URL:
   - SMS: `https://<your-host>/api/webhooks/sms` (Twilio status callback and inbound message webhook)
   - Email: `https://<your-host>/api/webhooks/email` (Resend events)
   - Billing: `https://<your-host>/api/webhooks/stripe` (Stripe)
3. Schedule the worker. Use `npm run worker` on a long-lived host, or call `/api/cron/dispatch` every minute.
4. Register each business’s SMS sender with the carrier registry. In live mode the app does not receive registry status, so an operator must set the sender to `approved` in `sender_registrations` (or through a future admin tool) once the carrier approves it. Until then, texts are held and email is still possible.
5. Work through the legal review items in `docs/decisions.md` before the first send.

Live adapters are implemented and unit-tested for request shape and error mapping. They have not been run against live accounts. Run one real send to a test number before relying on them.

## Backups, retention, and deletion

- Personal fields are encrypted in the database, but the database host should also have disk encryption.
- Backups contain the encrypted personal fields. Deleting a customer removes their fields from the live database only. Backups keep them until they expire. Set your backup retention with that in mind, and state it in your privacy notice.
- Hashed suppression records and consent evidence are kept on purpose: the first stops a deleted customer being re-imported and messaged, the second is evidence for a consent dispute. Retention periods for both are a counsel decision.
- Losing `APP_ENCRYPTION_KEY` makes stored personal data unreadable. Back up the key separately from the database.

## Project layout

```
db/migrations/        SQL schema, row-level security, SECURITY DEFINER lookups
src/lib/              Domain rules: dispatch, lint, phone/time/segments, crypto, CSV import
src/lib/services/     Use cases: accounts, customers, pipeline, inbound, billing, dashboard
src/lib/adapters/     Sandbox and live providers (SMS, email, billing), plus the Phase 2 seam
src/app/              Next.js pages, server actions, and route handlers (webhooks, cron, short link)
worker/               Long-running worker
scripts/              Migrations and seed
tests/unit/           Pure rules, adapters, webhook signatures
tests/integration/    Database tests: tenancy, send pipeline, intake, routes
tests/e2e/            Browser acceptance journey, 360px layout, axe checks
```

## Limits

- One owner per business. No staff roles, multi-location, or agency mode yet.
- No Google sign-in yet. Email and password only.
- No Google Business Profile connection. The app does not read or reply to reviews yet.
- Click counts are per business and may include link scanners.
- The customer-facing "From" name is `NOTIFY_FROM_EMAIL`, not the business name. Decide this before launch.
- Accessibility checks cover the sign-up and log-in pages only.
