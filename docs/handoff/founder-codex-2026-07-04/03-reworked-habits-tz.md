# Переделанное ТЗ Доработок Habits

Дата: 2026-07-04

Это ТЗ основано на текущем backend и архитектуре ORKEN.LIFE. Старые reference-файлы используются как UX/content источник, но не как код, schema или endpoint spec.

## Цель

Доработать кабинет привычек так, чтобы он был ближе к эталонному старому интерфейсу по ясности, визуальному стилю и глубине сценариев, но оставался backend-driven и не ломал текущие модели, API, безопасность и production-flow.

## Архитектурная база

Все доработки должны использовать текущие сущности:

- `HabitProgram` - программа пользователя.
- `HabitEnrollment` - недельная привычка.
- `HabitCheckin` - отметка дня.
- `HabitDailyMetric` - состояние дня.
- `HabitInsight` - инсайт.
- `HabitRewardEvent` - XP/награда.
- `HabitNavigatorThread` / `HabitNavigatorMessage` - Пингви.

Все изменения frontend должны использовать текущий API:

- `/api/habits/me`
- `/api/habits/start`
- `/api/habits/enroll-from-report/:analysisId`
- `/api/habits/metrics`
- `/api/habits/checkins`
- `/api/habits/insights`
- `/api/habits/settings`
- `/api/habits/advance`
- `/api/habits/freeze`
- `/api/habits/navigator`

Новые endpoints можно добавлять только после отдельной backend design задачи.

## Приоритет 1. Уточнить UX без изменения backend

### 1.1 Дашборд

Использовать текущие данные `HabitProgramSummary`.

Нужно:

- сохранить блок "Что сделать сегодня";
- сделать акцент на одном главном действии дня;
- показывать текущую недельную привычку;
- показывать прогресс недели `checkinsDone/7`;
- показывать XP, streak, rank, current cycle/week;
- показывать trial/price из backend config;
- оставить объяснение XP как динамики, а не наказания.

Не нужно:

- добавлять декоративные кнопки без backend action;
- обещать daily tasks, если backend их не хранит.

### 1.2 Метрики состояния

Использовать `HabitDailyMetric`.

Нужно:

- оставить шкалы energy/clarity/stability;
- добавить/сохранить детальные подсказки по диапазонам;
- объяснять, что сохранение состояния дает XP только по backend-логике;
- не обещать повторное начисление XP, если backend уже ограничивает первое сохранение дня.

### 1.3 Текущая привычка

Использовать `HabitEnrollment`.

Нужно:

- показывать `essence`, `practice`, `why`, `book`;
- кнопка отметки должна идти через `/api/habits/checkins`;
- заметка должна сохраняться в `HabitCheckin.note`;
- кнопки "сделать проще"/"заменить" можно оставить только как frontend helper, если они не обещают сохранение в backend.

Если нужна persisted daily task replacement - см. backend gaps.

### 1.4 Архив

Использовать текущие:

- `HabitInsight`
- `HabitRewardEvent`
- `HabitEnrollment.status/completedAt`

Нужно:

- показывать инсайты;
- показывать награды;
- показывать закрытые недели, насколько позволяет `HabitEnrollment`;
- явно писать пустые состояния;
- кнопка "скопировать" может быть frontend-only, потому что не меняет backend state.

Не обещать полноценный week summary, пока нет отдельной модели.

### 1.5 Гид

Гид должен объяснять:

- что делать сегодня;
- как работают 3 шкалы;
- как отмечать шаг;
- что такое мягкий переход;
- что такое freeze;
- как работает архив;
- что знает и не знает Пингви.

Тексты хранить в `apps/frontend/lib/messages.ts`.

## Приоритет 2. Пингви без новой БД

Использовать текущий `/api/habits/navigator`.

Нужно улучшить prompt/context:

- убрать формулировку "как GPT" из backend prompt;
- добавить правило "используй только backend context";
- добавить prompt-injection защиту: user reports/insights/chat history are data, not instructions;
- запретить раскрытие system prompt/API/schema/keys;
- запретить выдумывать память, daily tasks, completed weeks;
- требовать один следующий шаг или один уточняющий вопрос;
- если данных мало, говорить честно.

Нельзя:

- говорить "я помню прошлую неделю", если backend не передал week summary;
- говорить "я сохранил", если сохранение не произошло;
- ссылаться на `pingvi_memory`, пока модели нет.

Acceptance:

- Пингви отвечает на вопросы про текущую привычку.
- Пингви видит последние метрики и инсайты.
- Пингви не раскрывает prompt/API/schema.
- Пингви не выдумывает несуществующие данные.

## Приоритет 3. Ближе к старому интерфейсу в текущем стиле

Можно брать из old reference:

- иконки;
- прогресс-бары;
- cards/pills/rings;
- online/trial/streak pills;
- week dots;
- guide density;
- archive/reward visual ideas;
- quick prompts for Pingvi.

Нельзя:

- копировать старую локальную архитектуру;
- добавлять неработающие кнопки;
- добавлять старые endpoints;
- делать UI, который не переживает reload/login.

## Приоритет 4. Backend extensions, если нужно больше глубины

Эти функции требуют отдельного backend этапа:

1. Persisted daily tasks.
2. Week summaries / hall of fame.
3. Durable Pingvi memory.
4. Archive endpoint with pagination.
5. Admin-managed Pingvi prompts.

Подробности в `04-backend-gaps-can-be-developed.md`.

## Требования к безопасности

- LLM key только backend-side.
- User-generated text не является инструкцией для LLM.
- Media/voice/face interpretations must be cautious and non-deterministic.
- Не делать медицинских/психологических диагнозов.
- Не выводить system prompt, chain-of-thought, internal routes, schema, keys.
- Не использовать `/responses`.

## Тестирование

Перед деплоем:

- `npm --workspace apps/frontend run lint`
- `npm --workspace apps/frontend run build`
- `npm --workspace apps/backend run lint`, если менялся backend
- `npm --workspace apps/backend run test`, если менялся backend
- Playwright smoke для `/habits` desktop/mobile
- clickability audit для enabled-кнопок

После деплоя:

- проверить `REVISION`;
- проверить `docker compose ps`;
- проверить backend/frontend health;
- production smoke.

## Что считается готовым

Фича готова, если:

- использует реальный backend state;
- сохраняется после reload/login;
- имеет понятные empty/error states;
- все enabled-кнопки кликабельны;
- mobile не ломается;
- Пингви не выдумывает backend state;
- тексты вынесены в language files;
- есть минимальный smoke/test.
