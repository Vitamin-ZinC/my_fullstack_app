# Backend API And Schema Reference

Last updated: 2026-07-04

This is the implemented backend reference. Do not invent tables or endpoints beyond this list without implementing them.

## Prisma Models

Current models in `apps/backend/prisma/schema.prisma`:

- `User`
- `LoginToken`
- `Session`
- `Analysis`
- `Payment`
- `PromoCode`
- `MediaAsset`
- `Report`
- `PromptTemplate`
- `AppSetting`
- `FeatureFlag`
- `AnalyticsEvent`
- `JobEvent`
- `AdminAuditLog`
- `HabitDefinition`
- `HabitProgram`
- `HabitEnrollment`
- `HabitCheckin`
- `HabitInsight`
- `HabitDailyMetric`
- `HabitRewardEvent`
- `HabitNavigatorThread`
- `HabitNavigatorMessage`

Current enums:

- `AnalysisStatus`
- `PaymentStatus`
- `PromoDiscountType`
- `UserRole`
- `UserStatus`
- `MediaAssetType`
- `MediaAssetStatus`
- `ReportTier`
- `PromptStatus`
- `AuthTokenPurpose`
- `HabitProgramStatus`
- `HabitEnrollmentStatus`

## Habits Schema Summary

### `HabitDefinition`

Reusable habit catalog item.

Key fields:

- `slug`
- `cycle`
- `week`
- `title`
- `focus`
- `essence`
- `practice`
- `why`
- `book`
- `zone`
- `active`

### `HabitProgram`

User/session habit program.

Key fields:

- `userId`
- `sessionId`
- `analysisId`
- `status`
- `source`
- `title`
- `weakZone`
- `archetype`
- `topRole`
- `careerAction`
- `finalInsight`
- `profile`
- `startedAt`
- `currentCycle`
- `currentWeek`
- `currentSortOrder`
- `trialStartedAt`
- `trialEndsAt`
- `weeklyFreezes`
- `xp`

Relations:

- `enrollments`
- `checkins`
- `insights`
- `dailyMetrics`
- `rewards`
- `navigatorThreads`

### `HabitEnrollment`

Concrete weekly habit inside a program.

Key fields:

- `programId`
- `habitDefinitionId`
- `title`
- `focus`
- `essence`
- `practice`
- `why`
- `book`
- `zone`
- `week`
- `cycle`
- `sortOrder`
- `status`
- `startedAt`
- `completedAt`

### `HabitCheckin`

Daily completion marker.

Key fields:

- `programId`
- `enrollmentId`
- `date`
- `completed`
- `note`
- `energy`
- `clarity`
- `stability`

Unique behavior: one checkin per enrollment/date.

### `HabitDailyMetric`

Daily state snapshot.

Key fields:

- `programId`
- `date`
- `energy`
- `clarity`
- `stability`

Unique behavior: one metric per program/date.

### `HabitInsight`

User insight or system insight.

Key fields:

- `programId`
- `enrollmentId`
- `text`
- `source`
- `createdAt`

### `HabitRewardEvent`

XP/reward event.

Key fields:

- `programId`
- `type`
- `label`
- `xp`
- `createdAt`

### `HabitNavigatorThread` / `HabitNavigatorMessage`

Pingvi chat persistence.

Threads can belong to a program, user, or session.

Messages store:

- `threadId`
- `role`
- `text`
- `model`
- `createdAt`

## Implemented API Endpoints

### Auth

- `POST /api/auth/guest`
- `GET /api/auth/session`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/magic-link/request`
- `POST /api/auth/magic-link/verify`
- `POST /api/auth/logout`

### Me / Account

- `GET /api/me`
- `GET /api/me/reports`

### Analyses / Reports / Uploads

- `POST /api/analyses`
- `POST /api/analyses/:id/confirm`
- `GET /api/analyses/:id/status`
- `GET /api/analyses/:id/report/free`
- `GET /api/analyses/:id/report/full`
- `POST /api/analyses/:id/contact`
- `GET /api/analyses/:id/stream`
- `PUT /api/uploads/:key`
- `GET /api/uploads/:key`
- `PUT /api/dev/uploads/:key`
- `POST /api/dev/analyses/:id/complete`

### Habits

- `GET /api/habits/config`
- `GET /api/habits/me`
- `POST /api/habits/enroll-from-report/:analysisId`
- `POST /api/habits/start`
- `POST /api/habits/metrics`
- `POST /api/habits/checkins`
- `POST /api/habits/insights`
- `PATCH /api/habits/settings`
- `POST /api/habits/advance`
- `POST /api/habits/freeze`
- `POST /api/habits/navigator`

### Payments

- `GET /api/payments/config`
- `POST /api/payments/create-intent`
- `POST /api/payments/create-checkout-session`
- `POST /api/webhooks/stripe`

### Content / Events

- `GET /api/content/:locale`
- `POST /api/events`

### Admin

- `POST /api/admin/login`
- `GET /api/admin/stats`
- `GET /api/admin/analyses`
- `GET /api/admin/settings`
- `PUT /api/admin/settings/:key`
- `GET /api/admin/feature-flags`
- `PUT /api/admin/feature-flags/:key`
- `GET /api/admin/prompts`
- `GET /api/admin/prompts/defaults`
- `POST /api/admin/prompts`
- `GET /api/admin/promo-codes`
- `POST /api/admin/promo-codes`
- `PUT /api/admin/promo-codes/:id/active`
- `GET /api/admin/audit-log`

## Shared Contracts

Shared API types live in:

- `packages/contracts/src/index.ts`

Important habit contracts:

- `HabitConfigResponse`
- `HabitDefinitionSummary`
- `HabitCycleSummary`
- `HabitCheckinSummary`
- `HabitEnrollmentSummary`
- `HabitInsightSummary`
- `HabitDailyMetricSummary`
- `HabitRewardSummary`
- `HabitProgramSummary`
- `HabitLatestReport`
- `HabitMeResponse`
- `HabitProgramResponse`
- `HabitNavigatorResponse`

If a frontend feature needs a field not present in these contracts, update contracts and backend serialization first.

## Explicitly Not Implemented Yet

These names appear in external references but are not current Prisma models/routes:

- `weekly_plans`
- `daily_tasks`
- `habit_logs`
- `pingvi_memory`
- `subscriptions` as a habits-specific table
- `/api/habits/dashboard`
- `/api/habits/path`
- `/api/habits/weekly-plan`
- `/api/habits/daily-task`
- `/api/habits/complete-day`
- `/api/habits/complete-week`
- `/api/habits/soft-complete-week`
- `/api/habits/freeze-week`
- `/api/habits/archive`
- `/api/habits/rewards`
- `/api/pingvi/context`
- `/api/pingvi/chat`
- `/api/onboarding/diagnostic-route`
- `/api/onboarding/quiz-route`
- `/api/subscription/payment-method`
- `/api/subscription/status`

Do not use these in frontend or prompts unless implemented through schema, contracts, backend routes, API wrapper, UI, and tests.

## Where To Add New Things

For new persisted backend state:

1. Add Prisma model/fields in `apps/backend/prisma/schema.prisma`.
2. Create a migration under `apps/backend/prisma/migrations`.
3. Generate Prisma client.
4. Update route/service logic.
5. Update `packages/contracts/src/index.ts`.
6. Update frontend `apps/frontend/lib/api.ts`.
7. Update UI.
8. Add tests.

For new report prompt behavior:

1. Update `apps/backend/src/services/reportPrompts.ts`.
2. Update tests in `apps/backend/src/services/reportPrompts.test.ts`.
3. Consider admin `PromptTemplate` migration/versioning if it should be editable.

For new Pingvi behavior:

1. Update `apps/backend/src/routes/habits.ts`.
2. Keep LLM calls backend-side.
3. Add prompt safety tests if adding memory/context.
4. Do not rely on frontend-only context for authoritative user state.
