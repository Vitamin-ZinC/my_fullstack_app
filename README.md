# LevelUP.AI Ikigai

Production scaffold for the Ikigai diagnostic product.

The original `index.html` stays in the repository as the approved UX prototype. The production app is split according to `levelup-ai-architecture.md.pdf`:

- `apps/frontend`: Next.js 14 App Router frontend.
- `apps/backend`: Fastify API, Prisma schema, Stripe, media upload contracts, analysis worker.
- `packages/contracts`: shared API/report types.

## Local Setup

1. Copy `.env.example` to `.env` and fill secrets.
2. Install dependencies:

```bash
npm install
```

3. Start infrastructure:

```bash
docker compose up postgres redis
```

4. Run Prisma and dev servers:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run dev:backend
npm run dev:frontend
```

## Migration Strategy

1. Keep `index.html` as the visual/UX reference.
2. Port screens into React page by page: landing, voice, face, ikigai, analysis, reports, payment.
3. Replace demo generation with backend calls.
4. Connect R2/S3 presigned uploads, BullMQ worker, Anthropic analysis, Stripe webhook.
