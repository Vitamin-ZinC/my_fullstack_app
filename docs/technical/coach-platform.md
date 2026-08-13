# ORKEN Coach Platform

Last updated: 2026-08-12

This document is the implemented contract for the coach and client coaching surfaces. Do not invent replacement tables or move Partner Core data into ORKEN.

## Ownership Boundary

Partner Core remains the source of truth for partner accounts, login credentials, approval at the partner-program level, referral attribution, affiliate commission rules, global ledger, payout status, KYC, contracts, and payout details.

ORKEN stores product-specific coaching data only:

- `CoachProfile` and public ORKEN profile moderation;
- `CoachPlan`, versioned prices, individual overrides, and `CoachSubscription`;
- `CoachClientInvite` and `CoachClientRelationship`;
- services/orders, messages, assignments, coach-created habit assignments;
- coach sites, Calendly connection metadata and encrypted OAuth tokens;
- ORKEN Points rewards and atomic redemptions.

`CoachProfile.partnerCorePartnerId` references the Partner Core identity. ORKEN never stores a partner password, KYC, bank account, payout details, or a global affiliate ledger.

## Authentication And Consent

- `/coach` and `/partners` use the same Partner Core login and ORKEN BFF session.
- The browser receives only the ORKEN HttpOnly session cookie and double-submit CSRF cookie.
- The Core token remains encrypted in `PartnerPortalSession` on the backend.
- A coach can read a client only through an owned active relationship.
- Metrics/habits consent and journal consent are independent.
- A paid coaching order creates a `PENDING` relationship. It becomes `ACTIVE` only after the client explicitly enables metrics/habits access; payment never grants data consent automatically.
- Diagnostic reports, uploaded face images, audio, and raw diagnosis data are never loaded by coach endpoints.
- Multiple coaches per client are supported through independent relationships and consents.

## Access Resolution

`resolveHabitAccessForUser()` is the canonical access resolver. It recognizes:

- active B2C subscription;
- valid trial, including gifted or promo-extended access;
- active client-paid coaching;
- an active coach-paid relationship backed by an active/grace coach package.

Expired coach packages pause only `COACH_PAID` relationships. A client can continue through the normal B2C subscription without consuming the coach package.

## Backend Routes

Coach workspace:

- `GET /api/coach/workspace`
- `PATCH /api/coach/profile`
- `POST /api/coach/profile/avatar`
- `POST /api/coach/attribution`
- `GET /api/coach/clients/:relationshipId`
- `POST /api/coach/invites`
- `POST /api/coach/clients/:relationshipId/messages`
- `POST /api/coach/clients/:relationshipId/assignments`
- `POST /api/coach/clients/:relationshipId/habits`
- `GET|POST /api/coach/services`
- `POST /api/coach/services/:id/submit-review`
- `POST /api/coach/subscription/checkout/:id`
- `POST /api/coach/sites/checkout/:id`
- `PATCH /api/coach/sites/:id`
- `POST /api/coach/sites/:id/verify-domain`
- `POST /api/coach/rewards`
- `GET /api/coach/calendly/connect`
- `GET /api/coach/calendly/callback`
- `GET /api/coach/calendly/event-types`

Client coaching:

- `GET /api/habits/coaching`
- `POST /api/habits/coaching/invitations/accept`
- `PATCH /api/habits/coaching/:relationshipId/consent`
- `POST /api/habits/coaching/:relationshipId/messages`
- `POST /api/habits/coaching/assignments/:id/complete`
- `POST /api/habits/coaching/habits/:id/decision`
- `GET /api/habits/progress`
- `GET /api/habits/archive/search`
- `GET /api/habits/coaching/orders/:id/booking`
- `POST /api/habits/coaching/rewards/:id/redeem`

Public and admin:

- `GET /api/coaches/config`, `/api/coaches`, `/api/coaches/:slug`
- `POST /api/coaches/services/:id/checkout`
- `GET /api/coach-sites/by-host`
- `POST /api/coach-sites/chat`
- `GET /api/admin/coaches/platform`
- moderation, plan price/version, individual override, service split, site-price, and reward routes under `/api/admin/coaches/*`

## Commerce Rules

- Packages count only active `COACH_PAID` clients.
- Service publication is blocked unless coach and platform shares total exactly 10,000 basis points.
- Plan price edits create immutable `CoachPlanPriceVersion` records.
- `NEW_ONLY` keeps current subscriptions unchanged.
- `NEXT_RENEWAL` updates the Stripe subscription item with no proration and updates the local snapshot only after that subscription succeeds.
- Consultations enter `AWAITING_BOOKING`; the booking deadline is seven days after payment.
- The maintenance sweep requests an automatic refund when the booking deadline expires.
- Cancellation cutoff and refund percentage are stored in `AppSetting` and editable in `/admin/coaches`.
- Partner Core events use stable keys such as `orken:coach-service:*`, `orken:coach-package-invoice:*`, and `orken:coach-refund:*`.
- Coach-service payouts require `COACH_PAYOUT_PARTNER_CORE_PROGRAM_ID`, a published project-scoped Core program configured for 100% pass-through. ORKEN creates/caches a coach-owned referral link for that program; Core remains its source of truth.
- A referred coach stores only the immutable referral-code pointer locally. Each package invoice sends that code so the Core program can apply its configured lifetime commission.

Stripe webhook events used by the shared payment endpoint:

- `checkout.session.completed`
- `invoice.paid` / `invoice.payment_succeeded`
- `charge.refunded`
- `customer.subscription.updated` / `customer.subscription.deleted`

## Calendly And Telegram

Calendly uses OAuth. Access and refresh tokens are AES-256-GCM encrypted on the backend. The integration attempts a user-scoped webhook first, then organization scope. If neither is available, the 30-minute reconciliation job checks both active and canceled events.

The existing ORKEN Telegram bot handles `start=coach_<slug>`. It exposes only the approved public coach profile and services until a user is authenticated through the existing account-link flow. No per-coach bot tokens are used.

## Frontend Surfaces

- `/coach` - coach workspace.
- `/partners` - Partner Core finance and referral portal.
- `/for-coaches` - public B2B positioning and backend-driven pricing.
- `/coaches` and `/coaches/:slug` - moderated public catalog.
- `/habits/progress`, `/habits/archive`, `/habits/coaching` - client analytics, history, and Coaching Hub.
- `{slug}.orken.life` or a verified Premium custom domain - coach site.

## Release Controls

- `coach_workspace` enables the workspace release.
- `coach_packages_commerce` gates monthly coach package checkout and is enabled after Stripe subscription webhooks are verified.
- `coach_sites_commerce` gates coach-site setup and support checkout and is enabled after Stripe subscription webhooks are verified.
- `coach_services_commerce` gates client purchases of coaching and consultations. It remains disabled until Partner Core payout routing and Calendly are configured.

Do not use the legacy `coach_commerce` flag for new routes. Do not enable `coach_services_commerce` until Stripe, Partner Core payouts, and Calendly production smoke tests pass.

The main `/for-coaches` positioning fields are stored in `AppSetting.coach_public_content_ru` and edited under `/admin/coaches` -> `Публичная страница`. Package and site prices are always read from the active backend price records, never from the public page bundle.

## Production Checklist

1. Apply `20260812190000_coach_platform` and `20260813090000_split_coach_commerce_flags` with `prisma migrate deploy`, then run `prisma generate`.
2. Configure backend-only Calendly credentials and a high-entropy token encryption secret.
3. Configure a published 100% coach-payout program in Partner Core and set `COACH_PAYOUT_PARTNER_CORE_PROGRAM_ID`.
4. Subscribe the existing Stripe webhook to the events listed above.
5. Configure wildcard DNS and TLS for `*.orken.life` at the reverse proxy/CDN.
6. Keep `COACH_CUSTOM_DOMAIN_ROUTING_ENABLED=false` until the proxy can provision custom-host TLS.
7. For custom domains, route verified hosts to the same frontend and set `COACH_SITE_PRIMARY_HOSTS` so primary ORKEN hosts are never rewritten.
8. Verify Partner Core project scope is exactly `orken-life` and service credentials remain backend-only.
9. Run unit tests, frontend production build, and smoke the full coach purchase/booking/refund path.
10. Enable `coach_workspace`, package and site commerce first. Enable service commerce only after the payout and booking checks pass.

External DNS, CDN, custom-domain TLS issuance, Stripe credentials, and Calendly app credentials are infrastructure operations and are not created by the application migration.
