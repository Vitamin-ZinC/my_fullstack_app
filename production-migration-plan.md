# Production Migration Plan

Current `index.html` is the approved UX prototype. The production implementation lives in:

- `apps/frontend`: Next.js 14 App Router.
- `apps/backend`: Fastify API, Prisma, BullMQ, Stripe and worker.
- `packages/contracts`: shared report/API types.

## Phase 1: Running Skeleton

- Install dependencies with `npm install`.
- Start Postgres and Redis with `docker compose up postgres redis`.
- Run Prisma generate and migration.
- Start backend and frontend.
- Confirm `/health`, `/api/auth/guest`, `/api/analyses`, `/api/analyses/:id/stream`.

## Phase 2: Port UX From HTML

- Move landing visual system into React components.
- Port voice recording screen and store audio Blob until presigned upload.
- Port face selfie screen and client pre-check.
- Port Ikigai SVG map as a reusable React component.
- Port free and premium reports as page-break-friendly React sections.

## Phase 3: Real Analysis

- Replace `buildFallbackReport` with worker pipeline:
  - presigned GET media URLs;
  - audio transcription;
  - vision description of face image;
  - Anthropic prompt;
  - XML/JSON parsing and schema validation;
  - save `reportFree` and `reportFull`.

## Phase 4: Payments

- Add Stripe Elements to `/pay/[analysisId]`.
- Confirm PaymentIntent on the client.
- Use `/api/webhooks/stripe` as the only source of truth for unlocking full reports.
- Add idempotency checks and payment recovery by PaymentIntent ID.

## Phase 5: Production Hardening

- Add auth register/login/refresh.
- Add email delivery after analysis completion.
- Add Sentry/Pino monitoring.
- Add rate limiting per IP/session.
- Add R2/S3 HEAD validation in `/api/analyses/:id/confirm`.
- Deploy to Railway/Render.
