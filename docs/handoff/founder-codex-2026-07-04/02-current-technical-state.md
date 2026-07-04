# Current Technical State

Дата: 2026-07-04

## Стек

- Frontend: Next.js App Router, React, TypeScript.
- Backend: Fastify, Prisma, PostgreSQL.
- Queue/progress: Redis/BullMQ.
- Payments: Stripe.
- LLM: OpenAI SDK через OpenAI-compatible API.
- Deploy: Docker Compose на VM, release-директории `/home/deploy/orken-life/releases/*`.

## Основные директории

- `apps/frontend` - пользовательский интерфейс.
- `apps/backend` - API, Prisma, worker, LLM, payments.
- `packages/contracts` - shared types.
- `scripts/deploy-prod.sh` - production deploy.
- `docs/technical` - техническая документация.
- `docs/archive/2026-07-04-habits-reference` - безопасная переработка старых habits reference-файлов.

## Реальные habits-модели в Prisma

### `HabitDefinition`

Каталог привычек.

Ключевые поля:

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

Годовая/длинная программа пользователя.

Ключевые поля:

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
- `currentCycle`
- `currentWeek`
- `currentSortOrder`
- `trialStartedAt`
- `trialEndsAt`
- `weeklyFreezes`
- `xp`

### `HabitEnrollment`

Конкретная недельная привычка внутри программы.

Ключевые поля:

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
- `completedAt`

### `HabitCheckin`

Отметка дня.

Ключевые поля:

- `programId`
- `enrollmentId`
- `date`
- `completed`
- `note`
- `energy`
- `clarity`
- `stability`

Есть unique constraint: `enrollmentId + date`.

### `HabitDailyMetric`

Состояние дня.

Ключевые поля:

- `programId`
- `date`
- `energy`
- `clarity`
- `stability`

Есть unique constraint: `programId + date`.

### `HabitInsight`

Инсайт пользователя.

Ключевые поля:

- `programId`
- `enrollmentId`
- `text`
- `source`
- `createdAt`

### `HabitRewardEvent`

Награды и XP-события.

Ключевые поля:

- `programId`
- `type`
- `label`
- `xp`
- `createdAt`

### `HabitNavigatorThread` / `HabitNavigatorMessage`

Чат Пингви.

Thread связан с `programId`, `userId` или `sessionId`.

Message хранит:

- `threadId`
- `role`
- `text`
- `model`
- `createdAt`

## Реальные habits endpoints

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

## Реальные shared contracts

Файл: `packages/contracts/src/index.ts`

Habit types:

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

Если frontend требует поле, которого нет в этих типах, сначала обновить contracts и backend serialization.

## Где живет Пингви

Backend endpoint:

- `apps/backend/src/routes/habits.ts`
- route: `POST /api/habits/navigator`

Контекст Пингви собирается backend-side:

- active program;
- active habit;
- habit map;
- recent metrics;
- recent insights;
- reports;
- chat thread.

Отдельной модели `pingvi_memory` сейчас нет.

## Где живут report prompts

- `apps/backend/src/services/reportPrompts.ts`
- admin prompt overrides через `PromptTemplate`
- admin UI: `apps/frontend/app/admin/page.tsx`

## LLM правила

- OpenAI-compatible API только на backend.
- SDK: `openai.chat.completions.create`.
- Не использовать `/responses`.
- Для длинных отчетов можно async `/chat/completions/async`, если gateway поддерживает.
- Картинки доступны LLM только по публичному URL без авторизации.

## Production deploy

Сервер:

- `/home/deploy/orken-life/current`

Скрипт:

- `scripts/deploy-prod.sh`

После деплоя проверять:

- `REVISION`
- `docker compose ps`
- backend health
- frontend health
- smoke tests
