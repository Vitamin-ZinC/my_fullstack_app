# Habits And Telegram Bot Roadmap

Last updated: 2026-07-04

This document captures the planned improvements for the ORKEN.LIFE habits cabinet and the proposed Telegram bot integration. It is a planning document only; do not treat it as implemented API/schema unless the referenced models, migrations, contracts, routes, UI, and tests exist.

## Current Implementation Status Update

Implemented after the initial plan:

- Shared Pingvi service: `apps/backend/src/services/habitNavigator.ts`.
- Web Pingvi and Telegram Pingvi use the same `HabitNavigatorThread` / `HabitNavigatorMessage` persistence.
- `HabitNavigatorMessage.channel` stores `"WEB"` or `"TELEGRAM"`.
- Telegram models exist: `TelegramAccount`, `TelegramLinkToken`, `TelegramWebLoginToken`, `HabitNotificationPreference`.
- Telegram API routes exist: `GET /api/telegram/status`, `POST /api/telegram/link-token`, `PATCH /api/telegram/preferences`, `POST /api/telegram/web-login/verify`, `POST /api/telegram/webhook/:secret`.
- Telegram bot service exists: `apps/backend/src/services/telegramBot.ts`.
- Implemented bot commands: `/start`, `/today`, `/checkin`, `/metrics`, `/insight`, `/pingvi`, `/stop`.
- Telegram reminders are implemented through the worker sweep calling `sendDueTelegramReminders()`.
- Web settings tab has Telegram connection, reminder toggle, and motivation frequency.
- Protected documentation page exists at `/docs`, backed by `POST /api/docs/handoff`.
- Founder mini chat exists at `/docs`, backed by `POST /api/docs/intake`.
- Founder chat splits task lists into separate safety audits and queues `TAKE_NOW` items.
- Telegram voice/audio messages are downloaded, transcribed through the OpenAI-compatible audio endpoint, and passed to Pingvi.
- Telegram inline keyboard includes quick actions and a cabinet link through a short-lived one-time web-login token when possible.
- Telegram chat/voice requests have an admin-configurable in-memory rate limit.
- Telegram reminder template is admin-configurable.
- The habits "Мой путь" tab now contains the daily completion flow: habit step, note/checkin, internal state metrics, and insight.
- Pingvi system prompt is available as `PromptTemplate` key `habits.navigator.system`.
- Dedicated Pingvi prompt safety tests exist.
- `Сделать проще` / `Заменить` persist the current `HabitDailyTask` variant through backend.

Still backlog:

- Full Telegram Mini App UI inside Telegram WebView. Current implementation uses a short-lived web-login link into the web cabinet.
- Persisted long-term `HabitNavigatorMemory` model. Current memory uses navigator threads, messages, metrics, insights, reports, and week summaries.
- Admin controls for XP values, reward labels, WebView/PDF flags, validation thresholds, and habit catalog active/version controls.
- Final pixel-level Playwright audit across desktop, mobile, and Telegram WebView.

## Already Implemented

- Backend-driven habits cabinet on the current architecture: `HabitProgram`, `HabitEnrollment`, `HabitCheckin`, `HabitDailyMetric`, `HabitInsight`, `HabitRewardEvent`.
- 48 habits in the backend catalog.
- `HabitDailyTask`: seven tasks per week, `todayTask`, and daily check-in closes the next unfinished task.
- `HabitWeekSummary`: created on `advance`/`freeze`, shown in archive, and passed to Pingvi.
- Pingvi through `/api/habits/navigator` with backend context: program, habit, metrics, insights, reports, daily task, week summaries, and thread history.
- Backend-side XP/rewards for metrics, checkins, insights, week completion, soft advance, and freeze.
- Admin settings for localizations, content JSON, rule/LLM week summaries, week summary model, Pingvi temperature, Telegram policy, Telegram reminder template, Telegram rate limits, and Telegram web-login.
- LLM/API keys remain backend-side.

## Partially Covered

- Visual/UX parity with the old reference: the structure exists, but final pixel/Playwright audit is still needed.
- Archive: insights, rewards, closed weeks, filters, and copy actions exist, but polished empty states can still be improved.
- Guide and scale hints exist, but reference-level copy can be improved.
- Pingvi memory: thread history and week summaries are available, but there is no dedicated long-term `HabitNavigatorMemory` model.
- `Сделать проще` / `Заменить` buttons now persist a changed `HabitDailyTask` without awarding XP.

## Habits Cabinet Improvements

### 1. UX Parity Pass

- Compare `/habits` with the reference across all seven tabs.
- Remove or rename unclear buttons.
- Improve empty, error, and loading states.
- Check desktop, mobile, and Telegram WebView.

### 2. Backend Honesty Pass

- Every enabled button should either change backend state or be an honest frontend-only action.
- Persisted "soft step" / "replace task" should either be implemented through `HabitDailyTask` or removed from the primary UI.

### 3. Archive

- Add filters for insights, rewards, and closed weeks.
- Bring week summary cards closer to the "hall of fame" reference.
- Keep copy/share as frontend-only actions unless public sharing is explicitly implemented.

### 4. Pingvi

- Move Pingvi prompt templates into `PromptTemplate`.
- Add prompt safety tests.
- Add reference-style quick prompts.
- Avoid adding a separate memory table before Telegram integration design is settled; memory should be designed once for web and bot.

### 5. Admin

- Add admin settings for XP values, reward labels, WebView/PDF flags, validation thresholds, and habit catalog active/version controls.
- Keep secrets, bot tokens, provider keys, and private network base URLs out of admin-editable settings.

## Telegram Bot Architecture

The Telegram bot should not be a separate parallel product. It should be a new channel on top of the same backend data.

### Proposed Models

`TelegramAccount`

- `userId`
- `telegramUserId`
- `chatId`
- `username`
- `firstName`
- `linkedAt`
- `lastSeenAt`
- `status`

`TelegramLinkToken`

- One-time token for web-to-bot linking.
- `userId` or `sessionId`.
- `expiresAt`
- `usedAt`

`HabitNotificationPreference`

- `programId`
- `telegramEnabled`
- `reminderTime`
- `timezone`
- `quietHours`
- `motivationFrequency`

Optional:

- `HabitNavigatorMemory`, or extend `HabitNavigatorThread` / `HabitNavigatorMessage` with a `channel` field.

## Native Web To Telegram Flow

1. The habits cabinet shows "Connect Telegram".
2. Backend creates a one-time link token.
3. Frontend opens `https://t.me/<bot>?start=<token>`.
4. Bot receives `/start <token>`.
5. Backend validates the token and links Telegram user/chat to the ORKEN user/session.
6. Bot replies that it can see the current habit.
7. Telegram-to-web return uses either:
   - Telegram Web App button;
   - or a short-lived signed web login link.

Do not put long-lived credentials into URLs.

## Pingvi And Telegram

- Telegram messages should be written into the same navigator memory/thread system used by web Pingvi.
- Add `channel: "WEB" | "TELEGRAM"` to navigator messages, or introduce an equivalent persisted channel field.
- `/api/habits/navigator` and the Telegram bot should use shared backend services:
  - `buildNavigatorContext(user/program)`
  - `askPingvi(context, messages, channel)`
  - `saveNavigatorMessage(...)`
- This allows Pingvi in the web app to know about Telegram conversations, and Telegram Pingvi to know about web conversations.

## Bot Features

### Phase 1: MVP

- `/start` account linking.
- Show today's task.
- Mark today as complete.
- Save insight.
- Ask Pingvi.
- Show current metrics.
- Open habits cabinet.

### Phase 2: Reminders And Motivation

- Daily reminders.
- Soft motivation messages.
- Evening nudge when there is no check-in.
- Weekly summary after week completion.
- Freeze/soft advance suggestions.

### Phase 3: Rich Inputs

- Telegram voice messages -> transcription -> Pingvi.
- Telegram inline keyboard quick actions.
- Telegram Mini App inside WebView.

## Security Requirements

- Telegram bot token stays in backend/VM environment variables only.
- Webhook secret is required.
- `/start` token must be one-time and short-lived.
- Telegram user is not authenticated until linked through web/session.
- Never expose LLM keys to bot frontend or web frontend.
- All bot commands must go through backend auth mapping.
- Rate-limit Pingvi messages from Telegram.
- Provide `/stop` and notification opt-out.

## Recommended Order

1. UX parity and button cleanup.
2. Extract shared Pingvi service from current route code.
3. Add Telegram linking models and webhook.
4. Bot MVP: today task, checkin, insight, ask Pingvi.
5. Scheduler reminders through the existing Redis/BullMQ infrastructure.
6. Shared web and Telegram memory.
7. Admin controls for Telegram reminders and motivation policy.
