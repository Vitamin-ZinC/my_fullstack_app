# Web Localization

Implemented languages: Russian (`ru`) and English (`en`).

## User Flow

The RU/EN control is part of the root layout, including the landing, assessment flow, reports, account, habit/client tools, coach and partner portals, admin, demo, legal, documentation and founder chat screens.

Language selection does not log out, create a user/program, reset progress or clear form drafts. Initial selection uses `?lang=en|ru`, then `levelup_locale` storage, then the `orken_locale` cookie, then browser language. Other browser languages fall back to Russian. The cookie is a non-sensitive preference, not an authentication token. Each origin maintains its own preference.

The client initializes from a stable Russian server snapshot to avoid hydration mismatch; it then sets the selected language and document title. This implementation is client-localized, not a separate server-rendered `/en` SEO site. No automatic translation of stored records is performed.

## Code Boundaries

- `apps/frontend/lib/locale.ts`: shared external store, locale persistence, formatting locale and `uiText` for fixed system copy.
- `apps/frontend/components/LanguageSwitcher.tsx`: accessible RU/EN controls.
- `apps/frontend/lib/messages.ts`: identical typed RU/EN dictionaries. English defaults use the shared catalog, not a shallow Russian fallback.
- `apps/frontend/lib/useSiteText.ts`: fetches `/api/content/{locale}` and merges only that locale's overrides; ignores stale responses after a switch.
- `packages/contracts/src/localization`: reviewed static English copy and helpers shared with the backend. Package-internal import mappings support Next/Turbopack and native Node TypeScript loading.
- `apps/backend/src/services/habitLocalization.ts`: read-only projection of built-in habit definitions, generated daily tasks, system reward labels and ranks. Numeric XP, IDs and dates are unchanged.
- `apps/backend/src/lib/auth.ts`: a valid `x-locale` changes request display/output language only. Stored session identity, ownership and database records are unchanged.
- Report, Navigator, weekly-summary and public coach-chat generators explicitly receive the output language; RU/EN report labels are accepted by the same validation schema. Five-direction and safety requirements remain active. Stripe Checkout/Portal locale is forwarded server-side without changing prices, permissions or idempotency keys.

Never run a recursive translator on arbitrary API responses or database entities. Names, biographies, custom offers/habits, feedback, journal entries, old reports, old chats and old weekly summaries retain their original language. Translate only deliberately selected system fields; interpolate user-provided values after translating the template.

## Administration

The existing content editor manages `site_texts_ru` and `site_texts_en` independently. Sparse overrides are supported; unspecified English values use English defaults.

Admin > Coaches > Public page has a separate content-language selector. It saves `coach_public_content_ru` or `coach_public_content_en` to the existing `AppSetting` store. Selecting English UI does not silently switch the content editor's target. Backend `/api/coaches/config` reads the requested key and uses localized defaults if it is absent.

No database migration, new identity tables, authentication secrets or new public write endpoints are required. Public coach-provided text is not translated automatically. English legal copy is a translation of the existing text, not a new legal opinion; legal wording should be reviewed by the responsible owner.

## Adding Copy

1. Add fixed Russian source keys and English values to `packages/contracts/src/localization/english.ts`; keep placeholders, URLs, numbers and business rules identical. Runtime translation never calls an LLM.
2. Use `uiText(source, { v0: value })` inside a component subscribing to `useUiLocale`, or use the typed `useSiteText` dictionary. Do not translate enum identifiers, parsing delimiters, route keys or payload property names.
3. Keep locale-dependent option arrays inside functions/render, not module-initialized arrays. Use `getFormatLocale()` for dates, numbers and currencies.
4. For regeneration, the optional inventory/draft/build tools are in `scripts/*localization*.mjs` and `scripts/generate-english-catalog.mjs`. Only reviewed static source copy may be sent to the generator. Credentials come from environment configuration, never the catalog. Internal backend prompt builders are excluded from the client catalog.
5. Keep approved corrections in `english-overrides.json` so rebuilding does not undo them. Do not rerun the original one-time UI migration; that migration script is intentionally not retained.

## Verification And Release

- `npm run lint` and frontend/backend production builds.
- `npm test`: locale negotiation, immutable habit projection, preservation of user answers, bilingual report normalization, existing authorization and business tests. Database persistence tests require `TEST_DATABASE_URL`; otherwise they skip.
- `npm run test:localization`: dictionary/legal shape, placeholder parity and independent overrides.
- `npm run test:e2e`: original Russian workflows plus English role screens, language persistence, unchanged input/auth state, partner statistics, legal/consent copy and content-editor isolation. UI tests mock API responses and do not charge real cards or create production accounts.
- Screenshots and overflow checks cover 360, 768, 1024 and 1440 px.
- `npm run test:partner-boundary` and `npm run security:audit`.

Deploy backend, worker and frontend together; no data backfill is needed. Production smoke: open `/?lang=en`, visit each role's login screen, change RU/EN, verify an existing user's XP/history, and generate a new English assessment using authorized test data. Do not mutate production profiles, payments or reports merely to test translation. This development change does not itself publish a release.
