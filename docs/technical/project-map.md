# ORKEN.LIFE Technical Project Map

Last updated: 2026-07-04

This document describes the current implemented architecture. It is intended to prevent future agents from inventing nonexistent tables, endpoints, or flows.

## Repository Layout

- `apps/frontend` - Next.js App Router frontend.
- `apps/backend` - Fastify API, Prisma, Stripe, media upload, analytics, LLM/report generation, habits backend.
- `packages/contracts` - shared TypeScript types for API/report/admin/habits contracts.
- `scripts` - deployment, production backup, smoke scripts.
- `tests` - Playwright/frontend flow tests.
- `docs/archive` - archived product/reference documents.
- `docs/technical` - current architecture documentation.

## Runtime Stack

- Frontend: Next.js, React, TypeScript.
- Backend: Fastify, Prisma, PostgreSQL, Redis/BullMQ.
- Payments: Stripe.
- LLM: OpenAI SDK with OpenAI-compatible base URL.
- Media: S3/R2 in production, local dev upload endpoints when configured.
- Deployment: Docker Compose production release directories on VM.

## Current Product Areas

### Diagnostic Flow

Frontend flow pages collect:

- questionnaire answers;
- voice recording;
- optional face/photo input.

Backend creates `Analysis`, media assets, reports, payment state, and report outputs.

### Reports

Reports are generated backend-side by `apps/backend/src/services/aiReport.ts`.

Report prompt templates are defined in `apps/backend/src/services/reportPrompts.ts` and can be overridden through the admin prompt system using `PromptTemplate`.

### Habits Cabinet

The habits cabinet is backend-driven. The active UI is `apps/frontend/app/habits/page.tsx`.

Backend logic is in:

- `apps/backend/src/routes/habits.ts`
- `apps/backend/src/services/habitCatalog.ts`
- `apps/backend/src/services/habitSettings.ts`
- `apps/backend/src/services/pricing.ts`

Shared habit types are in `packages/contracts/src/index.ts`.

### Pingvi

Pingvi is the habits navigator. Runtime endpoint:

- `POST /api/habits/navigator`

Current prompt/context builder is hardcoded in `apps/backend/src/routes/habits.ts`.
Pingvi temperature is controlled by `AppSetting.habit_navigator_temperature`.

Pingvi uses:

- current habit program;
- active habit/enrollment;
- persisted daily task variants;
- persisted week summaries;
- recent metrics;
- recent insights;
- latest reports;
- current chat thread.

Pingvi does not currently have a separate persisted long-term memory table.

## LLM Configuration

Environment variables:

- `ORKEN_LLM_API_KEY`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `OPENAI_TRANSCRIPTION_MODEL`
- `OPENAI_ASYNC_REPORTS_ENABLED`

Important constraints:

- API key stays backend-side.
- Base URL already includes `/v1` when configured for the ORKEN gateway.
- Use OpenAI SDK `chat.completions.create`.
- Do not use `/responses`.
- Long report generation may use OpenAI-compatible async `/chat/completions/async`.

## Text And Localization

Frontend default text lives in:

- `apps/frontend/lib/messages.ts`

Runtime content overrides use:

- `GET /api/content/:locale`

Admin prompt/content/settings are separate from frontend language constants. Locale availability is controlled by `AppSetting.enabled_locales` and `AppSetting.default_locale`; localized text overrides are stored in `site_texts_<locale>` settings. The admin editor builds translation tabs from `enabled_locales`; unknown locales start from the Russian default text shape until edited.

## Admin-Managed Settings

The admin UI currently manages:

- report price and currency;
- habits subscription price, currency, and trial days;
- promo codes;
- feature flags;
- report prompt templates;
- localized content JSON;
- enabled/default locales;
- habits week summary mode: rule-based or LLM-based;
- habits week summary model;
- Pingvi navigator temperature.

Do not create new settings tables for these; use `AppSetting` unless the value needs relational history or per-user state.

## Production Deployment

Deploy script:

- `scripts/deploy-prod.sh`

Production app directory on VM:

- `/home/deploy/orken-life`

Current release is symlinked at:

- `/home/deploy/orken-life/current`

Docker Compose file:

- `docker-compose.prod.yml`

## Before Adding Features

For every new feature:

1. Check Prisma schema.
2. Check existing backend routes.
3. Check shared contracts.
4. Check frontend API wrapper in `apps/frontend/lib/api.ts`.
5. Check current UI state.
6. Add migration/contract/route/UI/test in that order if new state is needed.

If the requirement comes from old `habits.html` or external master prompts, treat it as reference only until mapped to current backend.
