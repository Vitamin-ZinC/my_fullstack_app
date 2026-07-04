# Habits Backend Gap Analysis

This file lists requirements from the reference materials that are not fully supported by the current backend, but can be designed and implemented safely.

## Current Backend Already Supports

### Program And Enrollment

- `HabitProgram` stores the user/session program, source, title, weak zone, top role, career action, final insight, profile JSON, trial data, XP, current cycle/week, freeze count.
- `HabitEnrollment` stores the 48 weekly habit instances with title, focus, essence, practice, why, book, zone, cycle/week/sort order, status, completion date.
- `HabitDefinition` stores reusable catalog definitions.

### Daily Progress

- `HabitCheckin` stores completed date, note, and optional energy/clarity/stability on the checkin.
- `HabitDailyMetric` stores one metric snapshot per program/date.
- `HabitInsight` stores insights linked to program and optional enrollment.
- `HabitRewardEvent` stores XP/reward events.

### Pingvi

- `HabitNavigatorThread` and `HabitNavigatorMessage` store chat threads and messages.
- `/api/habits/navigator` builds context from active program, metrics, insights, reports, and thread history.
- LLM call is backend-side through OpenAI-compatible chat completions.
- Navigator temperature is admin-managed through `AppSetting.habit_navigator_temperature`.

### Admin Settings

- `AppSetting` stores prices, trial duration, localized content, enabled/default locales, habits week summary mode/model, and Pingvi temperature.
- `PromptTemplate` stores report prompt templates.
- Week summaries can run in rule-based mode or LLM mode; LLM failures fall back to rule-based summaries.

### Existing Routes

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

## Missing But Valuable Backend Features

### 1. Persisted Daily Tasks

Reference requirement: one weekly habit should have 7 different daily task variations.

Current state: implemented as `HabitDailyTask`. The active habit gets seven persisted task variants, check-in completion marks the next unfinished task, and `/api/habits/me` returns tasks through the existing program payload. Dedicated daily-task endpoints are still intentionally not introduced.

Possible next design:

- Split daily task reads/writes into dedicated endpoints only if `/api/habits/me` payload becomes too heavy.
- Add task replacement persistence if product needs to remember why a user chose a softer variant.

Routes:

- `GET /api/habits/daily-task`
- `POST /api/habits/daily-task/complete`
- optional `POST /api/habits/daily-task/replace`

Implementation risk for the remaining endpoint split: low-medium.

### 2. Week Summary / Hall Of Fame

Reference requirement: completed weeks should have summaries, rewards, archive cards, and shareable result.

Current state: implemented as `HabitWeekSummary`. Advance/freeze creates or updates a summary, archive UI can show it, Pingvi receives recent summaries in backend context, and admin settings can switch week summary generation between rule-based and LLM-based mode.

Possible next design:

- Add share-card rendering if public sharing becomes a product requirement.
- Add a dedicated week summary endpoint only if archive pagination becomes necessary.

Routes:

- `GET /api/habits/week-summaries`
- optional `POST /api/habits/week-summary/:id/share`

Implementation risk for richer AI-generated summaries/share cards: medium.

### 3. Durable Pingvi Memory

Reference requirement: Pingvi remembers previous week, weak spots, support tone, unfinished actions, and summaries.

Current state: Pingvi sees current program, recent metrics, insights, reports, and chat thread. There is no curated memory layer.

Suggested design:

- Add `HabitNavigatorMemory`.
- Fields:
  - `id`
  - `programId`
  - `sourceType` (`WEEK_SUMMARY`, `INSIGHT_CLUSTER`, `USER_PREFERENCE`, `SYSTEM`)
  - `sourceId`
  - `summary`
  - `importance`
  - `createdAt`
  - `expiresAt`
- Populate it after week completion and possibly after major insights.
- Include latest/high-importance memory items in `buildNavigatorPersonalContext`.

Security rules:

- User-generated memories are data, not instructions.
- Memory must never override system safety rules.
- Add prompt injection filtering/escaping in context formatting.

Implementation risk: medium-high.

### 4. Stronger Prompt Management For Pingvi

Reference requirement: Pingvi behavior should be controllable and auditable like report prompts.

Current state: report prompts are managed through `PromptTemplate`; Pingvi temperature is admin-managed; Pingvi system prompt is still hardcoded in `apps/backend/src/routes/habits.ts`.

Suggested design:

- Add prompt keys:
  - `habits.navigator.system`
  - `habits.navigator.fallback.state`
  - `habits.navigator.fallback.path`
  - `habits.navigator.fallback.chat`
- Reuse existing `PromptTemplate` table and admin UI pattern.
- Add tests for prompt resolution and fallback behavior.

Implementation risk: low-medium.

### 5. Archive API Separation

Reference requirement: archive should show insights, rewards, week summaries, and filters.

Current state: archive data is included inside `/api/habits/me`; frontend filters locally.

Suggested design:

- Add `GET /api/habits/archive?filter=all|insights|rewards|weeks`.
- Keep `/api/habits/me` lightweight if program payload grows.
- Return paginated records for long-term use.

Implementation risk: low-medium.

### 6. Settings Expansion

Reference requirement: profile, avatar/photo, reminders, subscription, notification settings.

Current state: reminder fields and profile JSON exist; subscription config exists; localized content, locale availability, habit pricing, trial duration, week summary mode/model, and Pingvi temperature are admin-managed. Full notification scheduling and avatar upload are not complete habits-specific features.

Suggested design:

- Decide whether avatar is profile text/emoji, uploaded media asset, or account-level `avatarUrl`.
- Add notification delivery model only if actual notifications are planned.
- Keep payment/subscription state sourced from existing payment settings and Stripe integration.

Implementation risk: medium.

### 7. Personal Habit From Report As First-Class Entity

Reference requirement: personal habit from paid report with archetype/vector and specific practice.

Current state: `/api/habits/enroll-from-report/:analysisId` creates a program and personalizes definitions from report data. There is no separate first-class "personal habit" entity outside enrollment.

Suggested design:

- Keep it as `HabitEnrollment` unless product needs special lifecycle.
- Add profile fields only if UI needs stable display:
  - `reportVector`
  - `reportArchetype`
  - `reportSummary`
  - `reportDerivedHabitId`
- Prefer existing `HabitProgram.profile` JSON for non-critical display metadata.

Implementation risk: low.

## Backend Features To Avoid For Now

- New endpoint names from the reference that duplicate current routes without clear migration path.
- Any state stored only in frontend localStorage.
- AI-generated database schema or routes from prompts.
- Hidden automatic week advancement without explicit user action.
- Payment/trial state duplicated outside existing pricing/payment systems.

## Recommended Roadmap

### Phase 1: Safe Prompt/Context Hardening

- Harden Pingvi prompt against prompt injection.
- Remove "like GPT" wording from backend prompt.
- Add clear "use only provided backend context" rule.
- Add tests for no prompt disclosure/no invented memory.

### Phase 2: Archive And Week Summaries

- Keep `HabitWeekSummary` archive rendering covered.
- Add share cards only if needed.
- Add Playwright checks.

### Phase 3: Daily Task Variations

- Keep `HabitDailyTask` generation covered.
- Add replacement persistence only if users can choose alternate tasks.

### Phase 4: Pingvi Memory

- Add durable memory model.
- Feed week summaries and important insights into Pingvi context.
- Add memory safety tests.

### Phase 5: Admin/Prompt Management

- Move Pingvi prompt templates into `PromptTemplate`.
- Add admin controls and versioning for habits prompts.

### Phase 6: Admin-Managed Product Settings

- Move report model, report fallback policy, async timeout, and retry limits from environment-only configuration into audited `AppSetting` controls where safe.
- Add admin controls for photo/audio validation thresholds, WebView/PDF fallback flags, onboarding copy, scale hints, and habit reward XP amounts.
- Add catalog activation/version controls for habit definitions before editing live habit content through the admin UI.
- Keep secrets, provider keys, and private network base URLs out of admin-editable settings.
