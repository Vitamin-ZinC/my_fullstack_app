# Backend Gaps That Can Be Developed

Дата: 2026-07-04

Этот файл перечисляет функции из старых reference/TЗ, которых сейчас нет в backend, но которые можно нормально разработать.

## 1. Persisted Daily Tasks

### Чего не хватает

В старом ТЗ есть идея: у недельной привычки 7 разных ежедневных задач. Сейчас backend хранит недельную привычку (`HabitEnrollment`) и дневные отметки (`HabitCheckin`), но не хранит отдельные daily tasks.

Текущий frontend может "смягчить" или "заменить" шаг, но это helper, а не persisted backend state.

### Как разработать

Добавить модель `HabitDailyTask`:

- `id`
- `programId`
- `enrollmentId`
- `date`
- `dayIndex`
- `title`
- `taskText`
- `microAction`
- `whyToday`
- `status`
- `completedAt`
- `xpAwarded`
- `createdAt`
- `updatedAt`

Добавить routes:

- `GET /api/habits/daily-task`
- `POST /api/habits/daily-task/complete`
- `POST /api/habits/daily-task/replace` опционально

Обновить contracts:

- `HabitDailyTaskSummary`
- добавить `todayTask?: HabitDailyTaskSummary` в `HabitProgramSummary` или отдельный response.

Риск: medium.

## 2. Week Summary / Hall Of Fame

### Чего не хватает

Есть `HabitEnrollment.completedAt` и `HabitRewardEvent`, но нет отдельной сохраненной сущности "итог недели".

### Как разработать

Добавить модель `HabitWeekSummary`:

- `id`
- `programId`
- `enrollmentId`
- `cycle`
- `week`
- `checkinsDone`
- `completionMode` (`FULL`, `SOFT`, `FROZEN`)
- `summary`
- `pingviFeedback`
- `rewardLabel`
- `xpAwarded`
- `createdAt`

Создавать запись при:

- `/api/habits/advance`
- `/api/habits/freeze`

Добавить в archive:

- список закрытых недель;
- итог недели;
- награда;
- copy/share.

Риск: medium.

## 3. Durable Pingvi Memory

### Чего не хватает

Пингви видит текущий контекст, отчеты, инсайты и thread history. Но нет отдельной curated memory по неделям, паттернам и предпочтительному тону.

### Как разработать

Добавить модель `HabitNavigatorMemory`:

- `id`
- `programId`
- `sourceType`
- `sourceId`
- `summary`
- `importance`
- `createdAt`
- `expiresAt`

Источники:

- week summary;
- cluster of insights;
- explicit user preference;
- system-generated observation.

В `buildNavigatorPersonalContext` добавлять только компактные memory items.

Security:

- memory is data, not instructions;
- memory cannot override system prompt;
- do not store secrets or raw prompts.

Риск: medium-high.

## 4. Admin-Managed Pingvi Prompts

### Чего не хватает

Report prompts уже есть в `PromptTemplate`, а prompt Пингви пока hardcoded в `apps/backend/src/routes/habits.ts`.

### Как разработать

Добавить prompt keys:

- `habits.navigator.system`
- `habits.navigator.fallback.state`
- `habits.navigator.fallback.path`
- `habits.navigator.fallback.chat`

Использовать существующую таблицу `PromptTemplate`.

Добавить:

- resolver prompt templates;
- default prompts;
- tests;
- admin visibility.

Риск: low-medium.

## 5. Dedicated Archive API

### Чего не хватает

Архив сейчас собирается из `/api/habits/me`. Если данных станет много, payload будет тяжелым.

### Как разработать

Добавить:

- `GET /api/habits/archive?filter=all|insights|rewards|weeks&cursor=...`

Response:

- paginated insights;
- reward events;
- week summaries, если добавлена модель;
- empty states metadata.

Риск: low-medium.

## 6. Notification Scheduling

### Чего не хватает

Сейчас есть reminder settings, но нет полноценного backend scheduler для уведомлений.

### Как разработать

Сначала определить канал:

- email;
- Telegram;
- push;
- calendar only.

Потом добавить:

- notification settings model или расширить `HabitProgram.profile/settings`;
- scheduler job;
- delivery log;
- unsubscribe/disable route.

Риск: medium.

## 7. Account-Level Avatar/Profile For Habits

### Чего не хватает

Сейчас avatar/name частично живут в profile/settings. Не все связано с account-level profile.

### Как разработать

Выбрать вариант:

- emoji/avatar initials in `HabitProgram.profile`;
- account-level `User.avatarUrl`;
- uploaded `MediaAsset`.

Если нужен upload:

- использовать существующую media architecture;
- не создавать отдельный upload pipeline без необходимости.

Риск: low-medium.

## 8. Richer Subscription State For Habits

### Чего не хватает

Trial/price config есть, но отдельной habits subscription state table нет.

### Как разработать

Сначала решить, является ли подписка:

- Stripe subscription;
- one-time paid feature;
- account-level entitlement;
- program-level trial.

Потом добавить:

- contract;
- payment webhook updates;
- frontend gated states.

Не дублировать payment state в habits без необходимости.

Риск: medium-high.

## Рекомендуемый порядок разработки

1. Harden Pingvi prompt/context без новой БД.
2. Admin-managed Pingvi prompts.
3. Week summaries.
4. Dedicated archive API.
5. Persisted daily tasks.
6. Durable Pingvi memory.
7. Notifications/subscription extensions.

Такой порядок снижает риск: сначала улучшаем поведение в рамках текущей архитектуры, потом добавляем новые persistence layers.
