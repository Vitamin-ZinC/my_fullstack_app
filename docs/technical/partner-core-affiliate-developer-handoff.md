# Orken Partner Portal: Handoff for Partner Core Developer

## Purpose

Orken now has an Orken-branded partner portal at `/partners` and project partner
management embedded in the existing `/admin`. Both are BFF surfaces, not an
independent partner system or a link to the central Partner Core admin.

Partner Core remains the only source of truth for:

- partner accounts, passwords, approval status and profiles;
- referral links and ownership;
- partner offer ownership and moderation;
- global conversions, ledger, payouts, KYC, contracts and cross-project history.

Orken stores only its product-specific attribution, customer bonus issuance,
Orken Points spending and local entitlement state.

## Non-Negotiable Security Boundary

Traffic must always be:

```text
Browser -> Orken frontend -> Orken BFF -> Partner Core
```

Never return a Partner Core service key, HMAC secret, opaque Core session token,
KYC reference, payout provider reference or bank details to browser JavaScript,
URLs, analytics, logs or public API responses.

Orken passes its scoped service credential to Partner Core only from its backend.
The browser receives an Orken-owned `HttpOnly` session cookie. Orken stores the
corresponding Core session token encrypted at rest and stores only a hash of its
own browser session token.

## Project Scope

All portal requests must be strictly scoped to the Orken project:

```text
project path: /api/projects/orken-life/partner/*
service key projectIds: ["orken"]
```

Do not resolve or expose data from Emma, Ikigai or any other project when an
Orken partner is authenticated.

## Implemented Orken Calls

Orken already calls these Partner Core endpoints server-to-server.

### Embedded Orken Admin

```http
POST /api/embedded-sessions
GET  /api/embedded/bootstrap
POST /api/embedded/partners/:partnerAccountId/status
```

The Orken service principal requires `sessions:write`, `partners:read`,
`partners:write`, `events:write`, and `projectIds: ["orken"]`. Partner listing and
status changes are project-scoped. `approved` and `suspended` modify only Orken
access; they must not change the global account or another project's access.

### Authentication

```http
POST /api/projects/orken-life/partner/register
POST /api/projects/orken-life/partner/login
POST /api/projects/orken-life/partner/logout
GET  /api/projects/orken-life/partner/me
```

`register` is HMAC-signed and includes `Idempotency-Key`.

Expected register payload:

```json
{
  "email": "partner@example.com",
  "password": "partner-entered-password",
  "displayName": "Partner name",
  "accountName": "Partner business",
  "accountType": "organization",
  "clientRef": "privacy-preserving-reference"
}
```

Expected successful login/register response:

```json
{
  "sessionToken": "opaque-core-token",
  "expiresAt": "2026-07-17T12:00:00.000Z",
  "partner": {
    "id": "partner_core_id",
    "status": "PENDING_REVIEW",
    "displayName": "Partner name",
    "accountName": "Partner business",
    "email": "partner@example.com"
  }
}
```

`expiresIn` in seconds is also supported instead of `expiresAt`. Return one of
these fields whenever possible. The session token must be opaque and short-lived.

For `me`, dashboard, referral links, offers, ledger, payouts and logout, Orken
sends the Core token only in:

```http
Authorization: Bearer <core-session-token>
```

Return neutral credential errors on failed registration/login. Return `401` or
`403` when the Core session is expired or revoked; Orken will revoke its local
session and ask the partner to sign in again.

### Partner Portal Data

```http
GET /api/projects/orken-life/partner/dashboard
GET /api/projects/orken-life/partner/ledger
GET /api/projects/orken-life/partner/payouts
GET /api/projects/orken-life/partner/referral-links
GET /api/projects/orken-life/partner/offers
```

The dashboard should contain only Orken data. The portal supports these logical
fields and accepts either camelCase or snake_case names:

```json
{
  "partner": { "id": "partner_core_id", "status": "APPROVED" },
  "metrics": {
    "clicks": 42,
    "signups": 8,
    "paidConversions": 3,
    "accrued": 15000,
    "pendingPayouts": 6000,
    "paidPayouts": 9000
  },
  "referralLinks": [],
  "offers": [],
  "registrations": [],
  "payments": []
}
```

For backward compatibility Orken also accepts `leads` instead of
`registrations` and `conversions` instead of `payments`. Registration rows should
include a stable customer reference, registration timestamp, referral
code/campaign and status. Payment rows should include the same customer
reference, payment timestamp, amount in explicit minor units, currency,
commission in explicit minor units and status. Do not include bank details,
credentials or cross-project customer activity.

Amounts must have an explicit currency or documented minor-unit convention.
Ledger and payout responses must not contain payout credentials or banking data.

### Referral Links

```http
POST /api/projects/orken-life/partner/referral-links
Authorization: Bearer <core-session-token>
Idempotency-Key: partner-ref:<stable-id>
```

Request:

```json
{ "channel": "Telegram July" }
```

Response should include `id`, `channel`, `referralCode`, `url` and `status`.
The same idempotency key must return the original link without creating a second
one.

### Partner Offers

```http
POST /api/projects/orken-life/partner/offers
POST /api/projects/orken-life/partner/offers/:offerId/submit-review
Authorization: Bearer <core-session-token>
Idempotency-Key: partner-offer:<stable-id>
```

Create-offer payload:

```json
{
  "offer": "Private onboarding session",
  "kind": "qualified_lead",
  "surface": "rewards_tab",
  "price": "120 Orken Points",
  "cap": "25 / month",
  "partnerPayoutCents": 500
}
```

New offers must be `DRAFT`; sending to review is an explicit separate action.
Return a stable `id`/`offerId`, title/name and status. Approved/rejected status
and moderator comments belong to Partner Core.

## Product Events Already Sent by Orken

Orken records referral events through the existing Core conversion API:

```http
POST /api/events/conversions
Idempotency-Key: orken:<event>:<stable-id>
```

Currently supported and used:

- signup: `orken:signup:<orkenUserId>`;
- report payment: `orken:invoice:<payment-or-checkout-id>:affiliate`;
- subscription renewal: the same stable invoice pattern;
- reward redemption: `orken:redemption:<redemptionId>`.

Payloads contain the Core program id, referral code, a privacy-preserving user
reference, external business id and payment amount when applicable. Partner Core
must deduplicate by `Idempotency-Key` and return the original result on retries.

When Core resolves a referral code during signup, it should return the resolved
`partnerCorePartnerId` in the response. Orken saves it only as a local attribution
pointer; it is not a copy of a partner account.

## Partner Core Additions: Implemented 2026-07-18

The four previously missing Core capabilities are implemented. Orken configuration
and remaining product event call sites are documented in
`docs/technical/partner-core-orken-configuration.md`.

### 1. Edit a Draft Offer

The portal now supports editing draft and changes-requested offers.

Recommended API:

```http
PATCH /api/projects/orken-life/partner/offers/:offerId
Authorization: Bearer <core-session-token>
Idempotency-Key: partner-offer-update:<stable-id>
```

Rules: only the owning partner may edit; only Core `draft`/`paused` offers may be
edited. Orken presents a latest `changes_requested` review as `REJECTED` and can
resubmit it explicitly after saving.

### 2. Refund/Reversal Event Semantics

Implemented as `POST /api/events/conversion-reversals` with `programId`,
`originalExternalId`, `eventType`, `reason`, and a stable idempotency key.

Partner Core must reverse or lock the corresponding payable ledger amount exactly
once and preserve an auditable link to the original conversion.

### 3. Customer Bonus Event

Implemented as `POST /api/events/customer-bonuses`. Core stores an append-only
bonus event and outbox record without mutating the money/currency ledger.

The event contains a hashed Orken customer reference, bonus type/value/unit,
product entitlement id, optional original conversion external id, and an
idempotency key.

### 4. Session Lifetime Contract

Login/register return ISO `expiresAt`, `expiresIn: 1800`, and an explicit absolute
30-minute, non-refreshable session contract. Logout revokes immediately; Core
`401`/`403` triggers immediate Orken local-session revocation.

### 5. Embedded Partner Management

`GET /api/embedded/bootstrap` includes project-scoped partner accounts and their
link/conversion/payable counters. `POST /api/embedded/partners/:id/status` lets
the authenticated Orken founder suspend or restore Orken access without opening
the central Partner Core admin. Public project id `orken-life` is normalized to
the internal project id `orken` before scope validation.

## Integration Acceptance Checklist

Use a non-production Partner Core account and test program.

1. Register partner in Orken portal. Confirm the account is created only in Core.
2. Log in through Orken. Confirm no Core token appears in browser storage,
   response bodies or browser network payloads.
3. Confirm dashboard, links, leads, conversions, ledger and payouts show only
   `orken-life` data.
4. Create a referral link twice with the same idempotency key. Confirm one Core
   link is created.
5. Create and edit a draft offer, submit it for review, request changes, edit it
   again, and verify the latest Core moderation status/comment in Orken.
6. Perform referred signup, payment, renewal and redemption. Repeat delivery and
   confirm Core records each business event once.
7. Revoke or expire the Core session. Confirm Orken local session becomes invalid.
8. Confirm KYC, bank details, payout provider references, service keys, HMAC
   secrets and opaque Core tokens never appear in the Orken UI/API.
9. Record a full refund twice with one idempotency key. Confirm one reversal and
   zero pending payout for the original conversion.
10. Record a customer bonus twice. Confirm one Core bonus event and no Core ledger
    mutation.
11. Open Orken `/admin`, confirm the partner appears in the embedded section,
    suspend access and verify partner login is blocked, then restore access and
    verify login succeeds.

## Orken Deployment Prerequisites

Orken deployment is blocked until its backend receives, through secret management:

- Partner Core base URL;
- a scoped service credential with `sessions:write`, `partners:read`,
  `partners:write`, `events:write`, and authorization for `orken`;
- a high-entropy Orken portal session-encryption secret.

Do not send these values in chat, tickets, repositories or this document.
