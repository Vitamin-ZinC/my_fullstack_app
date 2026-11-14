# Diagnostic Flow Refresh

## Routes And Layout

New frontend entry: `/flow/start` -> `/flow/voice` -> `/flow/face` ->
`/flow/analysis` -> `/report/:id/free` -> `/pay/:id` -> `/report/:id/full`.
Legacy direct flow routes remain available. Landing CTAs, guide and diagnostic
footer links enter the onboarding. Existing queued diagnostics can be resumed.

`diagnostic-shell` scopes the full-width layout to flow/report/payment routes.
Other cabinets retain their layout. SVG contents and diagram labels are unchanged;
a stage wrapper keeps diagram hotspots aligned when the text moves alongside it.
Mulish and Unbounded are served locally from `/assets/fonts` with their OFL
licenses, rather than loading a render-blocking Google Fonts stylesheet.

## Consent And Pricing

Onboarding does not open devices or create an Analysis. Audio and image consent
remain separate and unchecked, with the existing backend validation gates.
Recording remains 30-60 seconds, with file upload as the existing fallback.

Onboarding, premium CTA and checkout use `/api/payments/config`. Checkout disables
purchase if the current price cannot be loaded and offers a retry rather than
showing the obsolete static price. Existing promo and access checks are unchanged.

## Report Evidence And Compatibility

Bundled prompts: FREE system/user v6, FULL system/user v11. Runtime input policy
also applies to older administrator overrides: no questionnaire is implied when
answers are empty; narrative, acoustic measurements and still-photo observations
are distinct. Still photos do not support temporal micro-expression analysis.
Role match percentages are heuristic relevance scores, not calibrated probabilities.

Existing IkigaiAnswers and ReportFree/ReportFull contracts remain unchanged.
Old FREE reports are normalized on read using their actual questionnaire presence;
false questionnaire references and the specific obsolete boilerplate are removed
without updating saved reports. Paid reports, XP, payments and identities are not
rewritten. A free map does not display the generic sample personalized text.

Premium product benefits are defined once in `report.free.premiumBenefits` and
remain editable through the existing RU/EN site content overrides in admin.
AI teaser/preview fields remain in the API for compatibility but no longer repeat
the product offer in the free-report UI. Normalization also deduplicates previews.
Known obsolete CMS processing messages about micro-expressions, psychotypes or a
500+ profession database fall back to current copy at presentation time, without
overwriting saved administrator content or personal reports.

## Verification And Release

The release audit found GHSA-474x-hrwr-fgx4 in the AWS SDK XML dependency.
The root override pins `fast-xml-parser` to 5.12.1 (first fixed: 5.12.0), without
upgrading the framework or AWS clients. Keep the lockfile synchronized and audit
both production images before switching. Revisit the override when AWS updates
its own pinned parser dependency.

- Focused stage checks: frontend build/typecheck, evidence-policy and saved-report
  tests, localization, adaptive layout/onboarding checks.
- Final suite includes `tests/diagnostic-refresh.spec.js`: breakpoints from 360 to
  1920, RU/EN, screenshots, consent, resume, premium content and price outage/retry.
- Existing full diagnostic, promo checkout, paid report and role isolation tests
  remain required. Real LLM output and latency require a separate consenting test
  recording; mocked tests do not establish model accuracy or live generation time.
- Back up DB/uploads and retain current Docker images before release. No database
  migration is required. Deploy pinned SHA with `RUN_MIGRATIONS=false`,
  `PRUNE_DOCKER=false`, `KEEP_RELEASES=0`. Prompt sync preserves newer overrides;
  the runtime evidence policy still applies to them. Rollback uses retained images.
- Smoke `/flow/start`, voice/face/analysis, public pricing and existing role URLs.
  Never use another person's media or paid account for a deployment check.
