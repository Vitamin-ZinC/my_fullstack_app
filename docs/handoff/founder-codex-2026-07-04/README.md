# ORKEN.LIFE Habits - Handoff For Founder Codex

Дата: 2026-07-04

Этот пакет нужен, чтобы другой Codex мог дорабатывать привычки ORKEN.LIFE, не ломая текущий backend, БД, API и безопасность своими промптами.

## Что внутри

- `01-codex-founder-guardrails.md` - правила для Codex: что нельзя выдумывать, где искать реальную архитектуру.
- `02-current-technical-state.md` - актуальная техническая карта проекта: стек, модели, endpoints, prompts, LLM.
- `03-reworked-habits-tz.md` - переделанное ТЗ доработок привычек, основанное на текущем backend.
- `04-backend-gaps-can-be-developed.md` - что сейчас отсутствует в backend, но можно спроектировать и разработать.

## Как использовать

1. Перед началом работы Codex должен прочитать `AGENTS.md` в корне репозитория.
2. Затем прочитать этот пакет полностью.
3. Старые файлы `orken-habits-*.md/json` использовать только как UX/content reference.
4. Новые таблицы, поля и endpoints добавлять только через Prisma migration, contracts, backend route, frontend API wrapper, UI и тесты.

## Главное правило

Не переносить старый HTML и мастер-промпт напрямую в production. Текущий кабинет уже backend-driven. Любая доработка должна мапиться на реальные сущности:

- `HabitProgram`
- `HabitEnrollment`
- `HabitCheckin`
- `HabitInsight`
- `HabitDailyMetric`
- `HabitRewardEvent`
- `HabitNavigatorThread`
- `HabitNavigatorMessage`

Если требование не ложится на эти сущности, это не prompt-задача, а backend design task.
