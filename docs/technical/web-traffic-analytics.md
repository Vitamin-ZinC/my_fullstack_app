# Web Traffic Analytics

This module is first-party, consent-based measurement. It is not a financial ledger
and does not change authentication, Partner Core, habit access, XP or payment rules.

## Data And API

- Migration: `20261022120000_web_traffic`.
- Models: `WebTrafficVisit`, `WebTrafficPageView`, `WebTrafficConversion`.
- `GET /api/traffic/config`: public, collection enabled and retention only.
- `POST /api/traffic/views`: public, explicit `consent: true`, strict bounded body,
  approved Origin, UUIDs, allowlisted page template, safe marketing slugs. No arbitrary
  properties. DNT/GPC, basic bot user agents, admin/docs/demo/unknown routes are excluded.
- `GET /api/admin/reports/traffic?days=30`: existing admin authorization, 1..180 days,
  UTC calendar days through the current instant, aggregate results only, no-store.
- Existing admin setting `traffic_analytics_enabled` is a boolean, default true.
  Disabling collection retains historical reports and prevents new conversion writes.

Client consent lives in `orken_analytics_choice_v2` for 180 days. Only opt-in creates
random browser/visit identifiers. First-party measurement uses no IP/UA fingerprinting.
Optional Google Analytics is described below. DNT/GPC overrides an earlier opt-in. The footer control can revoke
consent; revocation clears browser identifiers and stops future events, but does not
claim to erase historical rows. Renewed consent after expiry creates fresh identifiers.

Visitor means a browser, not a verified person. A visit ends after 30 minutes without
page views (also capped at 24 hours). Route transitions count, query/hash changes do not.
Individual coach/report IDs are mapped to shared templates. Never send search strings,
login tokens, referral codes, user messages, media or private progress. UTM source,
medium, campaign are optional lowercase slugs up to 48 characters; no URLs or email.
Unknown referrer domains are grouped as `external`, not stored verbatim.

Event UUIDs deduplicate retries. Raw random identifiers are hashed server-side. The
tables have no user/session/account relationships. Retention deletes visits older
than 180 days every 6 hours, cascading page views and conversion rows, including
when collection is disabled. Infrastructure request logs are outside this module.

## Conversion Semantics

The API wrapper attaches anonymous visit headers only while consent is active on
an allowlisted page. Backend records registration after creating a new B2C account
(password or magic link) and diagnostic start after creating an Analysis. Logging in
or setting a password on an existing account is not a new registration.

Report checkout binds the analysis to the first eligible visit. On returning to the
authorized full-report API, the backend checks a successful positive payment and
CURRENT browser consent before recording the conversion with a stable hashed key.
The current browser hash must match the original checkout browser. Repeat opens
count once; an old payment predating the checkout is excluded. No webhook can create
new visit attribution after a browser withdraws consent. Zero-price promo activations
and development payments are excluded from attributed paid-report conversions.
If the buyer never returns with consent, the payment remains only in business totals.
This records confirmed purchases viewed, not net revenue or refunds. Coach services,
packages and recurring subscription invoices are not attributed by this version.

Conversion percentages use distinct visits STARTED in the selected period as their
denominator. Each action counts a visit at most once; actions are not required to occur
in a fixed sequence. A later payment belongs to the original checkout-visit cohort,
not the day the buyer returns. Page views are instead counted by event time.

The separate business totals use authoritative User/Analysis/Payment rows and their
event dates, including customers without analytics consent. Do not divide these
totals by opt-in visitors. Partner Core partner identities are not B2C registrations.
Financial/subscription detail remains at `/admin/reports`.

## Admin And Release

`/admin/traffic`: 7/30/90/180-day periods, UTC daily chart plus accessible data table,
visitor/visit/page-view totals, conversion rates, top 20 source/medium/campaign
combinations, page templates, device categories and safe CSV export. Empty data is
explicit; no historical traffic is fabricated. Collection toggle is admin-only.

Before release: run Prisma generate/validate, backend unit/route tests, lint/build,
frontend analytics regression tests, localization and partner-boundary checks.
Back up production, apply migration using the normal deploy flow BEFORE switching
backend/frontend, then check: anonymous report access denied, no view before consent,
one view after consent, no tokens in payloads, opt-out, admin empty/loaded states.
No environment secret or external account is required for first-party analytics. Rollback code can
leave the additive analytics tables intact; never reset the production database.

`webTrafficPersistence.test.ts` additionally checks real PostgreSQL concurrency,
SQL aggregates, original checkout cohorts and cascading retention. It runs only
with `WEB_TRAFFIC_TEST_DATABASE_URL`, rejects database names outside the explicit
`orken_traffic_test_*` namespace, requires empty analytics tables and removes only
its own synthetic rows. Apply migrations to a disposable test database first;
never provide a production database URL to this test.

## Optional Google Analytics 4

`GoogleAnalytics` uses measurement ID `G-T661WL38LP` (a public ID, not a secret).
The external gtag script loads only after v2 consent and while the existing admin
analytics toggle is enabled. v1 consent is NOT migrated: its notice excluded Google.
DNT/GPC, opt-out and expired consent prevent loading; opt-out disables the loaded
tag and removes accessible GA cookies. Cookies are host-only, Secure/SameSite=Lax,
with a 180-day lifetime. No Google Ads personalization or Google Signals.

Only `/`, `/coaches`, `/for-coaches`, `/offer`, `/privacy` are eligible. The query
allowlist permits `lang=ru|en`, bounded `gtm_debug=x|numeric`, and validated
`utm_source`, `utm_medium`, `utm_campaign` slugs. Only known landing anchors are
allowed. Unknown/duplicate parameters, token links and arbitrary hashes block GA.
Parameters and hashes are never included in our page_view payload.
Auth, workspaces, diagnostics, individual profiles/reports, payments,
admin/docs and unknown URLs never initiate GA loading. Route transitions disable
the loaded tag outside the allowlist. Manual page_view uses a fixed brand title,
origin + allowlisted path and empty referrer; no user IDs or business events.
First-party anonymous analytics retains its existing broader page-template scope.

**Before production release**, in Google Analytics Admin > Data streams > Web >
Enhanced measurement, turn Enhanced measurement OFF for this stream. In particular,
history-based pageviews and automatic form, search, outbound-link and download
measurement must be OFF: `send_page_view: false` alone does not disable those
property-side features. Do not add other tags or destinations to this stream.
The application cannot verify these Google account settings through gtag.
Configure Google-side event retention and access separately. Verify in Realtime
using a consented public visit; automated tests stub Google and send no real events.

The automatic Google installation checker may report "tag not detected" before
consent. Do NOT bypass the banner to make it pass. In Tag Assistant, connect to
`https://orken.life/`, allow analytics on the site, then return to the assistant.
`gtm_debug` must not disable collection. Consent queues denied defaults followed
by an analytics-only grant before the external script loads (basic consent mode).
Check the matching property `G-T661WL38LP` in Realtime/DebugView. Ad blockers,
DNT/GPC and a previous decline can intentionally keep the tag absent.

Live verification on 2026-10-28 confirmed gtag.js HTTP 200 and a matching
page_view accepted by region1.google-analytics.com/g/collect (HTTP 204).
An automatic scroll event was also observed: Enhanced Measurement was still
enabled in the Google property at that check. It cannot be disabled by deploying
this application. Recheck the property setting separately before collecting
anything beyond the explicit public-page events.

References: https://developers.google.com/analytics/devguides/collection/ga4/views
and https://developers.google.com/tag-platform/security/guides/privacy.
