# Habits Reference Usage Rules

## Status Of Original Files

The three original files are raw references:

- `orken-habits-full-reference-data.json` - captured data/snapshot from the old HTML reference.
- `orken-habits-full-reference-spec.md` - visible text and behavior inventory.
- `orken-habits-master-prompt.md` - broad product/design/backend request.

They are not runtime prompts, not database schema, and not API contracts.

## Safe Use

Use them for:

- missing UX audit;
- comparing old and new habits screens;
- extracting copy candidates into language files;
- identifying old icons, illustrations, progress bars, and cards;
- documenting expected states after clicks;
- planning future backend work;
- building Playwright visual/smoke scenarios;
- checking that old value is not lost during migration.

## Unsafe Use

Do not:

- paste the master prompt into ChatGPT/Codex and ask it to rewrite the app in one pass;
- paste it into Pingvi runtime prompt;
- paste it into report prompts;
- treat old endpoint names as current backend requirements;
- treat old localStorage state as acceptable persistence;
- copy old HTML/JS as production architecture;
- copy every old button if the action is not implemented;
- promise old features in UI before backend support exists.

## How To Convert A Reference Requirement

For every reference requirement, classify it:

1. Existing backend support: implement or tune UI/copy only.
2. Existing backend support but missing frontend state: update UI and tests.
3. Missing backend field but simple to derive: add serializer/contract carefully.
4. Missing backend entity or lifecycle: create backend design and migration plan.
5. Purely old/dead HTML behavior: reject or replace with an implemented action.

## Examples

### Good Requirement

"Show metric explanations for energy, clarity, stability."

Current support: frontend state and metrics endpoint already exist.

Safe implementation: add text to language files and render expandable help under each slider.

### Good Requirement

"Pingvi should know current habit, metrics, insights, and reports."

Current support: backend already builds navigator context from program, metrics, insights, reports, and thread messages.

Safe implementation: improve `buildNavigatorSystemPrompt` and context formatting, but do not invent memory fields.

### Needs Backend Design

"Each weekly habit has 7 different daily tasks."

Current support: not represented as a persisted entity. Current code has weekly habit plus checkins and a frontend micro-step rotation.

Safe implementation: design `HabitDailyTask` model and API before UI/prompt changes.

### Needs Backend Design

"Pingvi memory after week completion."

Current support: chat messages and current context exist; durable week summaries/memory do not.

Safe implementation: design a `HabitNavigatorMemory` or `HabitWeekSummary` model, then pass it to Pingvi context.

### Reject Direct Copy

"Repeat old HTML 1-to-1."

Reason: conflicts with current backend-driven app and can reintroduce dead buttons/local-only state.

Safe replacement: reuse visual/copy patterns while preserving current backend architecture.

## Prompt Boundary

Prompts may influence wording and reasoning. Prompts must not be used to create hidden product state.

If a requirement says "the assistant should remember/save/award/open/unlock", verify that backend already has a state transition for it. If not, it is a backend task, not a prompt change.
