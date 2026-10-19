# Catalog Connections And Recommendations

## User And Coach Flow

The public catalog and profile provide a connection link to `/habits/coaching?coach={slug}`. This is separate from paid service checkout. All requests require the existing signed-in ORKEN user session; guests sign in or register and return to the selected coach. Password and email-link login share the allowlisted `safeAccountReturnPath` helper. External redirects, admin paths and arbitrary query parameters are discarded.

1. The client sends a message (optional, max 1,000 characters) to an approved coach who accepts new clients.
2. `CoachConnectionRequest` is product-owned ORKEN state, not a Partner Core account. It is unique per coach/client. Retried submissions return the same pending request. A user may have at most ten pending requests; declined requests have a 24-hour retry cooldown.
3. The coach accepts or declines in `/coach`, under Overview or Clients. Declines require a reason. The client can cancel a pending request in My Coach. Ownership checks apply to every action. Terminal decisions cannot be changed by stale retries.
4. Acceptance creates a `PENDING` `CoachClientRelationship`, without metrics or journal consent, and never charges a card. The client separately authorizes metrics/habits and optionally the journal in My Coach. An active habit program is attached from the signed-in owner, never a browser-provided program ID.
5. Diagnostic reports, face images and audio remain unavailable to coaches. Pending, paused or revoked relationships do not expose summary metrics or activity timestamps.

Funding choices refer to **Navigator access**, not an automatically purchased consultation:

- `COACH_PAID`: a place reserved from the coach's active/grace package. Pending and active relationships consume places. Acceptance and invitation redemption use the same PostgreSQL coach-level advisory lock.
- `SELF_FUNDED`: the client uses their normal ORKEN entitlement (B2C subscription, trial, gift, promo). This connection grants no additional entitlement, subscription, payment or package place.
- `CLIENT_PAID` remains the existing paid-service-order funding type. New catalog requests cannot select it. Legacy invitation UI's "client pays independently" choice is redeemed as `SELF_FUNDED`; existing paid service relationships are not rewritten.

## Routes

- `POST /api/coaches/:id/connection-requests` - authenticated client; `{message?}` only. Rate limited. Identity is taken from the session.
- `POST /api/habits/coaching/connection-requests/:id/cancel` - the submitting client only.
- `POST /api/coach/connection-requests/:id/decision` - owning Partner Core/BFF coach session plus existing CSRF header; `{decision: accept|decline, funding: COACH_PAID|SELF_FUNDED, note?}`.
- Existing `GET /api/habits/coaching` and `GET /api/coach/workspace` return typed `connectionRequests`. Only the owning coach receives the applicant's display name/email. Request messages are never passed to LLMs or included in analytics.
- Existing consent routes activate the relationship only after explicit client consent. The cabinet refreshes incoming state on focus and periodically without submitting requests automatically.

## Recommended Coaches

Admin: `/admin/coaches` -> Profiles -> **Recommend** (star). The admin-only `PATCH /api/admin/coaches/:id/catalog` accepts exactly `{featured:boolean}` and writes an atomic audit entry. Enabling requires an approved profile. It does not change moderation, accepting-orders state, publicSince, prices or entitlements. Coaches cannot recommend themselves.

Public order remains recommended first, then publication date, then ID for deterministic ties. Multiple recommendations are supported. This is a featured group, not an arbitrary numbered ranking among featured coaches.

## Migration And Release

Apply `20261019120000_coach_connection_requests` before switching application images. It adds one table and the `SELF_FUNDED` enum value; it does not update/delete existing client progress, relationships, accounts or subscriptions. Partner Core schema and authentication remain unchanged. Take the normal production database backup before migration. `RUN_MIGRATIONS=true` is required for this release.

The migration was checked against an isolated database initialized from the previous production schema; Prisma schema diff must report no drift. `coachConnectionsPersistence.test.ts` runs only when `COACH_CONNECTION_TEST_DATABASE_URL` matches a dedicated `orken_connection_test_*` database and `DATABASE_URL` points to the same database. Never point this test at production.

Tests cover route authentication/CSRF, identity override rejection, recommendation audit and moderation preservation, ownership, duplicate requests, cancellation, decline/retry, last-slot concurrency, consent privacy, access preservation and safe login returns. Browser coverage includes the directory-to-login-to-request flow, separate consent, coach acceptance, recommendation controls and 360/768/1024/1440 px layouts.

Post-release smoke: four existing public profiles remain visible; connection links reach the selected coach after login; private write routes reject unauthenticated calls; pending requests do not enable paid-service commerce. Keep Stripe/Partner Core payout flags unchanged.
