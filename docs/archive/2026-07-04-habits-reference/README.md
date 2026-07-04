# ORKEN.LIFE Habits Reference Archive

Date: 2026-07-04

This archive converts three external reference files into implementation-safe documentation for the current ORKEN.LIFE codebase:

- `orken-habits-full-reference-data.json`
- `orken-habits-full-reference-spec.md`
- `orken-habits-master-prompt.md`

The original files are useful as a product, UX, visual, and content reference. They must not be used directly as runtime prompts or copied into the application as a backend/API specification.

## Files

- `safe-implementation-brief.md` - safe master brief for future habits work.
- `reference-usage-rules.md` - what can and cannot be reused from the old HTML/reference files.
- `backend-gap-analysis.md` - backend features that are not present yet but can be designed and implemented.

## Current Architecture Baseline

Current implementation is backend-driven and uses:

- Prisma models: `HabitProgram`, `HabitEnrollment`, `HabitCheckin`, `HabitInsight`, `HabitDailyMetric`, `HabitRewardEvent`, `HabitNavigatorThread`, `HabitNavigatorMessage`.
- Routes: `/api/habits/me`, `/api/habits/start`, `/api/habits/enroll-from-report/:analysisId`, `/api/habits/metrics`, `/api/habits/checkins`, `/api/habits/insights`, `/api/habits/settings`, `/api/habits/advance`, `/api/habits/freeze`, `/api/habits/navigator`.
- Frontend texts: `apps/frontend/lib/messages.ts`.
- Habit catalog: `apps/backend/src/services/habitCatalog.ts`.
- Pingvi runtime prompt/context: `apps/backend/src/routes/habits.ts`.

Any future requirement from the reference files must be mapped to this architecture before implementation.
