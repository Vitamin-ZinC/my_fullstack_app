# Dependency Security Baseline

See [26 October follow-up](dependency-security-2026-10-26.md) for the additional
validator, SDK and parser fixes required by the subsequent deployment audit.

Date: 2026-10-23. This update supersedes the older dependency version examples
in the project map; application APIs and data contracts are unchanged.

| Component | Required Baseline |
| --- | --- |
| Production Docker Node.js | 24.22.1-alpine |
| Next.js | 16.4.2 |
| Fastify | 5.12.7 |
| sharp / custom libvips | 0.35.5 / 8.18.7 |

Both workspace manifests and the authoritative package-lock.json must agree.
Use npm ci for production images, not an unlocked install or npm audit fix --force.
All Node base stages in both Dockerfiles use the patched Node version.

The production VM CPU does not support x64-v2 or Wasm SIMD. Preserve the existing
sharp source build against the SHA256-verified libvips archive. PNG, JPEG and WebP
conversion must pass on that CPU; do not substitute an incompatible prebuilt
binary or disable the libvips minimum-version check.

The root .dockerignore excludes environment files, private keys, local uploads,
Git metadata, generated output and temporary studio security overrides. Pass
only the intentionally public NEXT_PUBLIC_* values as frontend build arguments;
production provider credentials belong in backend/worker runtime configuration.

## Release Checks

Before switching production, build both images and run:

- npm run security:audit against both images; any vulnerability, including low,
  or a failed audit blocks the release.
- Backend and frontend workspace lint and production builds.
- Backend tests in an isolated Linux image with dummy database/Redis settings.
- npm run test:image-runtime on the actual production CPU.
- npm run test:partner-boundary and npm run test:localization.
- HTTP/health, static-asset and queue checks after deployment.

The initial deployment of this dependency baseline passed both image audits
with zero known vulnerabilities. Backend tests: 147 passed, 4 skipped, 0 failed.
Image runtime, partner boundary, localization and production HTTP checks passed.
Skipped integration tests are not covered by those results. No real payments
or paid LLM/media jobs were created as smoke tests; this is not forensic clearance.

No database migration, prompt synchronization, user-data transformation,
LLM-routing change or payment-key rotation is needed for this dependency update.
Do not accidentally include unrelated unfinished product changes in its release.

## Temporary Runtime Overrides

The already-running security release may have a server-only
studio-node-security.override.json pinning its verified private image IDs/tags.
It is deliberately not committed or included in new Docker build contexts.
Use it only to recreate that exact release. After building a newer product
release from this source and passing all gates, do not carry an older override
forward: it would select old application images instead of the newly built code.

Rollback images can contain the previous vulnerable dependency versions and
runtime secrets. Keep them private and retire them through a controlled rollback
policy; never publish them or treat them as a patched long-term deployment.
