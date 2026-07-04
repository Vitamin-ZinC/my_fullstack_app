# Codex Project Instructions

This repository is the production ORKEN.LIFE fullstack app. Do not infer tables, endpoints, or architecture from old HTML/reference prompts.

Before changing backend, habits, prompts, payments, auth, or deployment, read:

- `docs/technical/project-map.md`
- `docs/technical/backend-api-and-schema.md`
- `docs/archive/2026-07-04-habits-reference/README.md`

## Hard Rules

- Use the current Prisma schema as the source of truth for database tables.
- Use route files under `apps/backend/src/routes` as the source of truth for API endpoints.
- Use `packages/contracts/src/index.ts` as the source of truth for shared frontend/backend types.
- Do not invent `weekly_plans`, `daily_tasks`, `pingvi_memory`, or new `/api/habits/*` endpoints unless you also implement Prisma migration, contract types, backend route, frontend integration, and tests.
- Do not put API keys in frontend code. OpenAI-compatible API access stays backend-side.
- Do not use OpenAI `/responses`; this project uses OpenAI-compatible `/chat/completions`.
- Do not replace backend-driven habits with static HTML or localStorage-only progress.
- Keep user-facing strings in `apps/frontend/lib/messages.ts` or the existing content/settings system where practical.

## Useful Commands

- Frontend typecheck: `npm --workspace apps/frontend run lint`
- Frontend build: `npm --workspace apps/frontend run build`
- Backend typecheck: `npm --workspace apps/backend run lint`
- Backend tests: `npm --workspace apps/backend run test`
- Full workspace build: `npm run build --workspaces --if-present`

## Deployment

Production deploy is handled by `scripts/deploy-prod.sh` on the VM under `/home/deploy/orken-life/current`.

Do not deploy until build/tests relevant to the change have passed.
