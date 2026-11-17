# ORKEN Commission Management

## Ownership

Partner Core owns all rates, versions, accruals, refunds and payout ledger.
ORKEN does not add commission tables, calculate the effective rate, or change
historical ledger entries. This release needs no ORKEN database migration.

The shared contracts expose `PartnerCommissionTerm`, `PartnerCommissionTerms`,
`PartnerCommissionTarget` and `PartnerCommissionUpdate`.

## ORKEN API

- `GET /api/admin/partner-core/commission-terms`
- `POST /api/admin/partner-core/commission-terms`

GET query fields are `programId`, optional `partnerAccountId`, and optional
`referralLinkId`. A link always requires its Core account owner.

POST uses the same target plus `commissionRateBps`, mandatory `reason`, and
`idempotencyKey`. Rates are integer basis points in 0..10000. Zero is valid.
`null` removes a partner/link override; a program standard cannot be null.

Both routes run `requireAdmin` before any Core session or request. The origin
comes from `PARTNER_CORE_EMBED_ORIGIN` (fallback `APP_ORIGIN`), not the browser.
The embedded session has `commissionManagement: true` and expires in 300 seconds.
The Core SDK sends service signatures, embedded authorization, origin, and the
original write key. Only allowlisted response fields and error codes reach the UI.

The existing ORKEN admin login is a shared principal, not a named-user system:
audit actors are `orken-admin:admin` for verified admin sessions and
`orken-admin:admin-api` for authenticated operator API access. Browser-provided
actors, origins, tokens and project IDs are rejected.

## Configuration

The ORKEN principal must have `sessions:write`, `commissions:write` and project
scope `orken` in Core. Retain the existing partner/event scopes for the rest of
the platform, or configure a separate commission principal in the backend's
existing `PARTNER_CORE_SERVICE_KEYS_JSON` array. Never put credentials into a
`NEXT_PUBLIC_*` variable.

When the backend JSON declares scopes, update that declaration too. The
commission client selects a principal with the two required commission scopes;
it does not silently replace missing commission access with ordinary partner
permissions. Core must return `commissions:write` in the minted session.

Bootstrap and partner me/dashboard must include `commissionTerms.programs`,
`commissionTerms.partners` and `commissionTerms.referralLinks`. An old endpoint
without these arrays is not a successful integration. Confirm the backend URL
points to the deployed Core version before release.

## Admin Workflow

1. Open `/admin/partners`, then the Partners tab.
2. Expand Commission terms on the required Core partner account.
3. Select the Core program if there are multiple programs.
4. Select Partner or one of that account's referral links.
5. Choose Program standard / Ambassador (30%), or explicit 15% for a link.
6. Enter the reason and save. The result displays Core's effective rate,
   selected source and effective timestamp; bootstrap is refreshed afterwards.

Resetting a partner submits `null` and preserves its link overrides. Reset each
link separately to inherit the partner's current terms. The UI shows the
program standard from `standardRateBps`, not a hardcoded 15%.

Under Program terms, expand the actual Core program to edit its standard
percentage. A linked program's legacy local-rate input is hidden. This operation
updates the existing Core program; it does not create another program.

Each newly saved operation gets a new UUID. A retry after an uncertain failure
with the same target/rate/reason retains the original key. Changing the payload
starts another operation. After success the key is discarded.

## Partner Workflow

`/partners` shows the partner's own rates on Overview and Profile, and each
link's rate in My links. These surfaces contain no commission-editing controls.
Display values use Core's `effectiveRateBps`, `source`, and `effectiveAt`.
User-controlled content is not translated; new system controls support RU/EN.

## Payment Time

Report conversion events include persisted `Payment.paidAt`. Stripe success
handlers preserve an existing paidAt and otherwise use the signed success
event timestamp. Subscription and coach renewal events use the invoice's
`status_transitions.paid_at`, with the signed event timestamp as fallback.
These values are saved in the existing retry outbox together with the persisted
referral code and payment amount. No event-supplied rate is trusted.

## Checks And Release

- Backend unit/integration suite, including `partnerCommissions.test.ts`.
- Backend/frontend TypeScript and frontend production build.
- `node scripts/test-partner-portal-client-boundary.mjs`.
- Browser QA: 30%, reset, link override, changed standard, retained retry key,
  fresh operation key, read-only partner view, RU/EN, widths 360/768/1024/1440.

Before production smoke tests, verify the Core URL and service scopes. Use a
dedicated test partner/link for any write test; do not change real partner
rates as a connectivity probe. A live read-only check and a mocked write test
do not prove successful production write access.

Snapshot the test account's conditions, test the round trip through the ORKEN
admin, confirm visibility in its partner portal, and restore the snapshot.
Historical accruals must remain unchanged. Existing Core tests own actual
commission arithmetic, append-only versions, refunds and deduplication.
