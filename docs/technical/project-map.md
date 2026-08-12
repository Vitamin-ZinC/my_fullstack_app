# ORKEN.LIFE Technical Project Map

Last updated: 2026-08-12

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
- `apps/backend/src/services/habitNavigator.ts`
- `apps/backend/src/services/habitSettings.ts`
- `apps/backend/src/services/pricing.ts`

Shared habit types are in `packages/contracts/src/index.ts`.

### Pingvi

Pingvi is the habits navigator. Runtime endpoint:

- `POST /api/habits/navigator`

Current prompt/context builder lives in `apps/backend/src/services/habitNavigator.ts`.
`apps/backend/src/routes/habits.ts` delegates web Pingvi requests to that shared service.
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

### Telegram Bot

Telegram bot integration is backend-owned and uses the same habits program data as the web cabinet.

Implemented pieces:

- Prisma models: `TelegramAccount`, `TelegramLinkToken`, `TelegramWebLoginToken`, `HabitNotificationPreference`.
- Web routes: `GET /api/telegram/status`, `POST /api/telegram/link-token`, `PATCH /api/telegram/preferences`, `POST /api/telegram/web-login/verify`.
- Webhook route: `POST /api/telegram/webhook/:secret`.
- Bot service: `apps/backend/src/services/telegramBot.ts`.
- Web UI: Telegram section in `apps/frontend/app/habits/page.tsx` settings tab.
- Reminder sweep: worker process calls `sendDueTelegramReminders()` once per minute.

Environment variables:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_WEBHOOK_SECRET`

Bot commands currently handled by backend:

- `/start <token>` links the Telegram account to the current user/session.
- `/today` shows the current habit step.
- `/checkin` marks today complete and awards XP once.
- `/metrics` shows latest daily metrics.
- `/insight <text>` stores an insight in the archive.
- `/pingvi <question>` asks Pingvi through the shared navigator service.
- `/stop` disables Telegram reminders for the active program.

Not implemented yet: full Telegram Mini App UI inside Telegram WebView. Telegram voice transcription, short-lived Telegram-to-web login links, and admin UI for Telegram policy/rate limits are implemented.

### Partner Core / Rewards

ORKEN is a project slice inside Partner Core, not an independent affiliate system.

Partner Core is the backend of record for:

- partner accounts and profiles;
- partner approval status;
- affiliate programs and referral links;
- partner offer ownership and moderation;
- reward placements;
- leads/redemptions;
- payout ledger, KYC, contracts, and cross-project history.

ORKEN stores only local product state:

- attribution from an ORKEN user/session to `referralCode` and `partnerCorePartnerId`;
- fact of issuing a customer bonus;
- internal wallet transactions and redemption spend;
- user entitlements/coupons/access issued inside ORKEN;
- a local read model/cache of Partner Core reward placements.

Implemented backend files:

- `apps/backend/src/services/partnerCore.ts`
- `apps/backend/src/routes/partners.ts`

Implemented frontend surfaces:

- Admin Partner Core section: `apps/frontend/app/admin/page.tsx`
- User rewards marketplace tab: `apps/frontend/app/habits/page.tsx`
- Partner portal: `apps/frontend/app/partners/page.tsx` at `/partners`.

### Partner Portal BFF

The partner portal is an ORKEN-branded BFF surface. Browser traffic goes only to
the ORKEN frontend/backend; the browser never receives a Partner Core service key
or Core session token.

Implemented backend files:

- `apps/backend/src/routes/partners.ts`
- `apps/backend/src/services/partnerPortal.ts`
- `apps/backend/src/services/partnerCore.ts`

`PartnerPortalSession` is a local session cache, not a partner account. It stores
only a SHA-256 hash of the opaque ORKEN browser session token, an encrypted Core
session token, `partnerCorePartnerId`, expiry, approval status, and minimal display
names. It does not store partner passwords, KYC data, payout details, or ledger rows.

The BFF uses an HttpOnly, Secure-in-production cookie and a separate double-submit
CSRF cookie for state-changing portal actions. The Core token is encrypted at rest
with `PARTNER_PORTAL_SESSION_ENCRYPTION_SECRET` (or a derived backend secret for
backward-compatible development only).

Shared contracts are in `packages/contracts/src/index.ts`.

Environment variables:

- `PARTNER_CORE_URL`
- `PARTNER_CORE_SERVICE_KEYS_JSON`
- `PARTNER_CORE_KEY_ID`
- `PARTNER_CORE_SERVICE_SECRET`
- `PARTNER_CORE_PROJECT_ID`
- `PARTNER_CORE_DEFAULT_PROGRAM_ID`
- `PARTNER_CORE_EMBED_ORIGIN`
- `PARTNER_CORE_PRIVACY_SECRET`
- `PARTNER_PORTAL_ORIGIN`
- `PARTNER_PORTAL_SESSION_ENCRYPTION_SECRET`
- `PARTNER_PORTAL_COOKIE_DOMAIN`

Partner Core secrets are backend-only. Do not expose `PARTNER_CORE_KEY_ID`, `PARTNER_CORE_SERVICE_SECRET`, or `PARTNER_CORE_PRIVACY_SECRET` through frontend code, public env vars, docs pages, or client-side JSON.

### Coach Platform

The coach and client coaching contour is implemented on top of habits and the Partner Core BFF. Its canonical technical contract is:

- `docs/technical/coach-platform.md`

Primary code:

- `apps/backend/src/routes/coachWorkspace.ts`
- `apps/backend/src/services/coachPlatform.ts`
- `apps/backend/src/services/coachCommerce.ts`
- `apps/backend/src/services/coachRules.ts`
- `apps/frontend/app/coach`
- `apps/frontend/app/coaches`
- `apps/frontend/app/habits/progress`
- `apps/frontend/app/habits/archive`
- `apps/frontend/app/habits/coaching`

Do not create a second coach authentication system or duplicate Partner Core passwords, KYC, payout details, or global ledger data in ORKEN.

`PARTNER_CORE_SERVICE_KEYS_JSON` is preferred when the Core issues scoped service
credentials. ORKEN accepts only a key with `sessions:write`, `partners:read`,
`partners:write`, and `events:write` scopes that is authorized for `orken`/`orken-life`; legacy key id and
secret variables remain a server-side fallback.

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
- Pingvi navigator temperature;
- business reports at `/admin/reports`: period filters, users and diagnostics, payments and promo usage, subscription status/access-source classification, estimated MRR/ARR, coach and partner metrics, bounded detail tables, and CSV export;
- Telegram reminder template;
- Telegram rate limit window and max messages;
- Telegram short-lived web-login toggle.

Telegram bot token, bot username, webhook secret, Partner Core credentials, provider keys, and private network URLs remain environment variables, not admin-editable settings.

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

### Embedded Partner Admin And Portal Release Checklist

Before enabling `/partners` or `partners.orken.life` in production:

1. Apply `20260717090000_partner_portal_bff` with the normal production Prisma migration flow.
2. Set `PARTNER_CORE_URL`, a scoped `PARTNER_CORE_SERVICE_KEYS_JSON`, and a high-entropy `PARTNER_PORTAL_SESSION_ENCRYPTION_SECRET` in backend-only environment configuration. The key must be permitted for `orken`/`orken-life` and have `sessions:write`, `partners:read`, `partners:write`, and `events:write` scopes.
3. Set `PARTNER_PORTAL_ORIGIN` to the published portal origin. For a subdomain deployment, set `PARTNER_PORTAL_COOKIE_DOMAIN=.orken.life`; retain the default host-only cookie for the `/partners` deployment.
4. Build the frontend and run `npm run test:partner-boundary`; it must confirm that Partner Core credentials and session encryption material are absent from client bundles.
5. Smoke test `/admin`: Partner Core project snapshot loads in the existing admin, the test partner appears, suspend blocks partner login, and approve restores it. Then test `/partners`: registration/login, `GET /me`, a named referral link created twice with the same idempotency key, draft offer submission, and logout followed by `GET /me` returning `401`.
6. In the Partner Core sandbox, verify referral signup, first payment, subscription invoice, and offer redemption are persisted once for stable Orken event ids. Do not test KYC or payout details through ORKEN.

Do not enable the public portal until Partner Core actually provides its URL and scoped service credentials. At the time this document was written, those values are not committed to this repository.

## Protected Documentation Link

Frontend route:

- `/docs`

Backend route:

- `POST /api/docs/handoff`
- `POST /api/docs/intake`

Password source:

- `DOCS_ACCESS_PASSWORD`
- fallback: `ADMIN_API_TOKEN`

The route returns only whitelisted files from `docs/technical`: project map, backend API/schema reference, habits/Telegram roadmap, and founder/Codex intake guide.

The `/docs` page links to the separate `/founder-chat` mini chat for bug reports/tasks/ideas. Submitted text is not treated as instructions for Codex. Backend masks likely secrets, splits lists into separate tasks, blocks destructive/backdoor/secret-exfiltration requests, classifies risk, persists sanitized records in `FounderIntakeItem`, appends a sanitized audit record to `.runtime/uploads/founder-task-intake.md`, and queues safe `TAKE_NOW` items in `.runtime/uploads/founder-task-queue.md`. The `/founder-chat` page shows a minimal inbox board with `В очереди`, `В процессе`, and `Готово` columns.

Codex bridge integration is outbound-only from backend to `CODEX_BRIDGE_WEBHOOK_URL` and callback-only through `POST /api/docs/bridge/callback` with `CODEX_BRIDGE_WEBHOOK_SECRET`. The bridge receives sanitized analysis payloads and cannot execute code through the web request.

## Before Adding Features

For every new feature:

1. Check Prisma schema.
2. Check existing backend routes.
3. Check shared contracts.
4. Check frontend API wrapper in `apps/frontend/lib/api.ts`.
5. Check current UI state.
6. Add migration/contract/route/UI/test in that order if new state is needed.

If the requirement comes from old `habits.html` or external master prompts, treat it as reference only until mapped to current backend.
