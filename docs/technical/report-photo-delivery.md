# Report Photo Delivery

## Failure and correction

The former report path sent an externally fetched URL and silently repeated a
completion without the image after broad errors, including provider failures
and timeouts. Each report segment could therefore see different evidence, while
the aggregate photo flag reported whether any segment had a photo. WebP accepted
by upload validation was also not recognized by the report-specific header check.

Report generation now uses bounded inline image data from the validated private
asset, with actual JPEG/PNG/WebP container MIME. Existing upload and face-consent
gates remain unchanged. A recorded photo that is rejected, unreadable or invalid
fails explicitly instead of turning into a voice-only report. No new media copy
is persisted, and image payloads are redacted from provider error messages.

Generation and JSON repair both retain the original image and evidence context.
Provider errors do not retry without the image. The photo evidence flag describes
the diagnostic segment. A contradictory absent-photo claim in face analysis or
role face evidence triggers bounded repair and cannot be published unchanged.
Actual limitations of a still photo remain valid; this is not an identity,
emotion, health or personality-recognition feature.

Bundled prompts are FREE v8 and FULL v13. Runtime evidence policy also applies to
older admin overrides. No database migration or frontend change is required.

## Existing report repair

Operator-only utility (no public endpoint):

```text
node --import tsx apps/backend/src/scripts/repairReportPhotos.ts
node --import tsx apps/backend/src/scripts/repairReportPhotos.ts --apply --backup-dir /report-repair-backups/photo-repair-TIMESTAMP --limit 10
```

The first invocation is dry-run and makes no LLM calls. It scans completed reports
for specific contradictory claims, checks recorded face consent, a verified photo
and readable media, and prints only counts. Apply requires explicit authorization,
a fresh database backup, and a private backup directory outside served uploads.
The original report JSON is backed up with exclusive creation and mode 0600 before
any generation. Use the backend compose service so original upload volumes and
backend-only provider configuration remain available. Mount only the private
backup directory additionally; do not export secrets or user content to a client.

Regeneration is sequential and bounded. A successful result must actually include
photo evidence and pass the contradiction guard. The utility then replaces
Analysis report fields and matching FREE/FULL Report rows in one transaction,
using updatedAt as a compare-and-swap guard. It does not enqueue the ordinary
worker or set PROCESSING/FAILED, so unsuccessful repairs leave the completed
report available. IDs, original completedAt, payment/access state, habit programs,
XP and subscriptions are not changed. Concurrent edits are skipped, not overwritten.
Retain the private backups under the normal backup retention policy.

## Verification

Tests cover actual inline bytes and MIME, WebP/PNG dispatch, missing media,
unverified/rejected status, no image-dropping retry on provider errors, image and
policy retention during JSON repair, RU/EN contradiction checks, and the narrow
set of fields that a repair can update. Before production switch, run backend
build, lint, full tests and image dependency audits. Deploy backend/worker only;
the frontend bundle is unchanged. Run dry-run before authorized apply, and run
dry-run again after success to verify no eligible contradictory reports remain.
