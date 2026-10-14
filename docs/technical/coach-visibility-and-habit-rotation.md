# Coach Visibility and Habit Rotation

## Coach Photos and Services

- Public catalog `/coaches`, profiles `/coaches/:slug`, coach sites and Telegram coach links show only `APPROVED` profiles and `APPROVED` services.
- Both `INCLUDED` and `CLIENT_PAID` services are visible. Included services are labelled as part of the coach's program, not as a free public purchase. Checkout remains restricted to paid, approved services and its existing commerce gates.
- Approved coaches remain in the catalog when `acceptingOrders=false`; purchases are disabled and the closed-booking status is shown.
- Catalog starting prices use paid services only. An included service with amount zero must not advertise a zero-cost purchase.
- Coach images use `/api/habits/avatar/coach-{coachProfileId}-{uuid}.{jpg|png|webp}`. Existing URLs remain valid. Only strict image keys referenced by that profile's current `avatarUrl` are served. Diagnostic `photo-*`, audio, arbitrary paths and other uploads are not exposed by this route.
- Uploaded profile photos are intended for display in profiles, including moderation previews. The avatar URL is public and opaque; it is not an authenticated diagnostic-image endpoint.
- Editing a profile or uploading its photo resets profile moderation to `PENDING_REVIEW`. Approving an individual service does not approve the profile. Administrators must review both in `/admin/coaches`.

## Seven-Day Habit Period

- A habit is assigned for seven **calendar days**, using `HabitNotificationPreference.timezone` (default/fallback `Europe/Moscow`). It opens the next habit at the start of day eight, not immediately after the seventh check-in.
- The shared `advanceCompletedHabitWeeks` service synchronizes the current week when the cabinet or Telegram reads it, and before sending a due Telegram reminder. No new scheduler or migration is required.
- The old `HabitEnrollment` becomes `COMPLETED` with `completedAt`; its check-ins, tasks, notes and program history remain. Calendar completion is not an invented 7/7 attendance record.
- `HabitWeekSummary` records capped actual check-ins, `FULL` for 7/7 and `SOFT` otherwise. Existing rewards, XP, rank history, access and payments are not reset.
- Bonus policy: 7/7 earns 50 XP; 5/7 or 6/7 earns 20 XP; fewer earns no week bonus. Calendar expiry alone, including the final program week, does not earn a perfect-week bonus.
- After a long absence only the current elapsed week closes. The next enrollment starts at the return time and receives a fresh seven-day period. Pre-created future enrollments are never bulk-completed.
- The existing freeze action starts a fresh seven-day period for the same habit, consumes a freeze and gives no XP itself. Check-ins are retained. The eventual closure may award its usual attendance bonus once.
- Automatic, manual and freeze transitions share a PostgreSQL transaction-level advisory lock keyed by program ID. Manual requests check the current cycle/week again under the lock; stale concurrent requests cannot advance twice or duplicate a bonus. Missing next enrollments fail closed rather than corrupting position.

## Verification and Release

- Unit/route tests cover calendar boundaries, DST, partial/zero attendance, long absences, history retention, freeze, concurrent reads, exact avatar bytes, upload CSRF, namespace isolation, moderation and included services.
- Browser tests verify public profiles with included/paid services and image rendering at 360, 768, 1024 and 1440 px; closed booking has no actionable checkout.
- No schema migration or bulk rewrite of production programs/profiles. Do not auto-approve pending records.
- Production smoke: check approved coach catalog/profile services; existing saved avatar URLs must return a real image with 200. Opening an authorized overdue program should retain its prior enrollment and XP and open exactly one new habit.
