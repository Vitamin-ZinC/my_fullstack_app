# ORKEN Contextual Guide

The guide is a frontend-only navigation aid, not a second AI assistant. Existing
Pingvi conversations and all backend access checks remain unchanged.

## Surfaces

- `/`: diagnosis CTA; one automatic tip per browser tab session, after 2.5 seconds.
- `/account` and `/habits`: shared preference scope when the same habit program is
  available; first visit at any time, then at most once per local day before noon.
- `/coach`: authenticated workspace only; daily client/invitation and profile actions.
- `/partners`: authenticated portal only; daily results/links actions, or account
  status for partners awaiting approval. No invented growth or creative assets.

`/habits?tab=journey` and `/habits?tab=guide` open the existing tabs. Guide actions
do not complete steps, create invitations or perform writes on behalf of a user.
The old inline habits welcome coachmark is replaced, not displayed alongside it.

## State And Privacy

`orken_guide_v1:<context>:<scope>` stores only the automatic-tip preference and the
last shown timestamp. Landing preferences use sessionStorage; cabinets use
localStorage scoped to their program/profile/account ID. IDs are not credentials.
Preferences are browser-local, not synchronized between devices. Storage failures
fall back to memory without preventing cabinet usage. No analytics events, media,
private text, Partner Core tokens or LLM requests are added.

Copy lives under `SiteText.guide`, with RU/EN defaults and the existing admin
`site_texts_<locale>` content overrides. No migration, endpoint, prompt or new
service secret is required.

## Interaction And Rendering

The transparent PNG is animated using CSS; it is not a 3D model. Keyboard users
can open the guide, follow links, close it with Escape, and disable automatic tips.
Animations respect `prefers-reduced-motion`. Automatic opening never steals focus.
An explicit `data-orken-guide-blocker` marker on the analytics banner and mobile
landing menu, native/open modal detection and text-input focus suppress the guide.
Mobile positioning leaves room for the bottom cabinet navigation and safe areas.
Habit help tips are mounted only when open and use a viewport-clamped portal;
hidden tips no longer create horizontal overflow near the right screen edge.

The landing face is positioned against the full-width hero section rather than
the 1160px content container. Text stays on its existing grid; image cover/masks
have separate desktop/mobile framing.

## Verification

- `npm run test:guide`: due-time rules, local day, per-account/role scope, blocked
  and corrupt storage, sessionStorage/localStorage separation.
- `npm run test:localization`, frontend lint/build and existing browser regressions.
- Browser: first/repeat visit, morning/day behavior, manual reopen, disable, Escape,
  actual tab navigation, empty/approved/pending role states, privacy banner, input
  focus, reduced motion and images at 360/768/1024/1440px.
- Confirm existing daily state, XP and check-in APIs are unchanged.
