# ORKEN.LIFE

Production scaffold for the ORKEN.LIFE diagnostic product.

The original `index.html` stays in the repository as the approved UX prototype. The production app is split into:

- `apps/frontend`: Next.js 14 App Router frontend, user flow, report pages, admin dashboard.
- `apps/backend`: Fastify API, Prisma schema, Stripe, media upload flow, analytics, settings, prompts, worker integration.
- `packages/contracts`: shared API/report/admin types.

## Implemented Architecture

- Guest sessions with `x-session-id` and `x-guest-token`.
- Ownership checks for analysis status, reports, confirm, payment intent, and SSE.
- Media assets as first-class records with audio/photo upload status.
- S3/R2 presigned uploads for production and local dev upload endpoints when S3 is not configured.
- BullMQ analysis worker with Redis-published progress events, persisted `JobEvent` history, and OpenAI-first report generation.
- Versioned `Report` records for free/full reports.
- Analytics events for funnel and payment/report milestones.
- Admin API guarded by `x-admin-token`.
- Admin UI at `/admin` for stats, recent analyses, settings, feature flags, and prompt templates.
- Settings and prompt models to support multilingual/report-version workflows.
- Stripe PaymentIntent creation, Stripe Checkout fallback, and promo-code discounts.

## Local Setup

1. Copy `.env.example` to `.env` and fill secrets.

Important local defaults:

```bash
PUBLIC_API_URL=http://localhost:3001
ADMIN_API_TOKEN=dev_admin_token
DEV_TOOLS_ENABLED=true
```

2. Install dependencies:

```bash
npm install
```

3. Start infrastructure:

```bash
docker compose up postgres redis
```

4. Run Prisma and dev servers:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run dev:backend
npm run dev:frontend
```

5. Run the worker in a separate terminal:

```bash
npm --workspace apps/backend run worker
```

6. Open:

- User app: `http://localhost:3000`
- Admin app: `http://localhost:3000/admin`

Use the value from `ADMIN_API_TOKEN` in the admin token field.

## Production Notes

- Set `DEV_TOOLS_ENABLED=false`.
- Configure `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, and optional `S3_ENDPOINT`.
- Configure `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` enables the embedded Payment Element; without it the app uses Stripe-hosted Checkout.
- Configure `OPENAI_API_KEY`; optionally override `OPENAI_MODEL` and `OPENAI_TRANSCRIPTION_MODEL`.
- Run `scripts/prod-backup.sh` from cron to back up Postgres and local upload volume.
- Replace bootstrap admin token with normal admin login/RBAC before exposing admin UI publicly.
- Keep prompts in `PromptTemplate` and publish active versions per locale.
- Use `AppSetting.enabled_locales` and `AppSetting.default_locale` for locale rollout.

## Remaining Production Work

- Add registered user auth: email login, refresh tokens, passwordless/OAuth, role management.
- Configure durable S3/R2 object storage credentials for production media retention.
- Add migrations committed under `apps/backend/prisma/migrations`.
- Add tests for ownership checks, payment webhook handling, media validation, and admin guards.
- Upgrade vulnerable Next/Fastify dependency chains and refresh `package-lock.json`.
