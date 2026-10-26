# Dependency Security Follow-Up

The web-traffic release was stopped by the existing audit gate BEFORE production
migrations or switching the current release. Do not bypass this gate or use
`npm audit fix --force`.

The reviewed update preserves Node 24.22.1, Next 16.4.2, Fastify 5.12.7 and the
existing sharp/libvips CPU compatibility baseline. It updates:

- Zod to 4.6.7. String-keyed records now explicitly pass `z.string()` as the key
  schema. No `zod/v3` compatibility import or peer override hides vulnerable code.
- OpenAI SDK to 6.0.0, the first published major after the affected 4.x/5.x range
  that accepts patched Zod 4. The project still uses `/chat/completions` and the
  existing gateway/base URL, prompts, models and audio transcription endpoint.
- Compatible transitive fast-uri versions to 3.1.9 and 4.2.3, and undici to 6.29.1.

The manifests and lockfile remain authoritative; production uses `npm ci`.
`openaiSdkCompatibility.test.ts` uses a fake fetch transport and synthetic media
to verify chat/vision JSON bodies, token budget, multipart audio and provider
headers. It never calls a model or reads provider credentials.

Local checks after the change: lint passed; backend 155 passed, 5 PostgreSQL tests
skipped without explicit test URLs; npm audit reported zero vulnerabilities.
The isolated PostgreSQL migration/aggregate test is a separate release check, not
covered by those skipped local tests. Both Linux images must independently pass
audit and all normal deploy gates before switching production.

Primary references:

- [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
- [Zod 4 migration guide](https://zod.dev/v4/changelog)
- [fast-uri URI normalization](https://github.com/advisories/GHSA-w74x-v6f9-j3xg)
- [undici content-encoding error](https://github.com/advisories/GHSA-xjj6-f33q-929c)
- [Chat Completions API](https://developers.openai.com/api/reference/typescript/resources/chat/subresources/completions/methods/create)
