# Landing Design QA

## Source visuals

- `C:\Users\User\Downloads\Telegram Desktop\orken-landing-prototype-v2.html`
- `C:\Users\User\Downloads\Telegram Desktop\photo_2026-08-20_21-04-40.jpg`
- `C:\Users\User\Downloads\Telegram Desktop\photo_2026-08-20_21-04-45.jpg`
- `C:\Users\User\AppData\Local\Temp\codex-clipboard-d90cd4d3-4052-4637-916b-48a5c49455cf.png`

## Implementation captures

- Desktop first viewport, 1440x1000: `output/playwright/landing-audit-desktop.png`
- Desktop full page, 1440px wide: `output/playwright/landing-full-desktop.png`
- Mobile first viewport, 390x844: `output/playwright/landing-audit-mobile.png`
- Mobile full page, 390px wide: `output/playwright/landing-full-mobile.png`

## Findings and fixes

1. Both header dropdowns could remain open and overlap. Added a shared native `details` group so only one menu stays open.
2. The mobile hero initially consumed the entire first viewport. Tightened mobile spacing so the next section is visible without hiding hero content.
3. Production stored an older `landing` dictionary that could overwrite new copy. Moved the redesign to the versioned `landing.v2` content block while preserving backend-driven prices and trial days.
4. Verified consistent 1160px desktop grid, equal product CTA heights, no mobile horizontal overflow, readable full-page stacking, and stable button/card dimensions.
5. Verified real destinations for `/offer`, `/privacy`, `/account`, `/habits`, `/coach`, and `/partners`; every route returned HTTP 200 in the browser test.
6. Verified keyboard-native summaries, accessible menu labels, visible focus/hover states, reduced-motion handling, and semantic headings/navigation.
7. Updated the hero question from the latest review and restored a dedicated privacy band with the approved photo/audio handling statements and a direct link to the privacy policy.

## Test evidence

- `npm --workspace apps/frontend run lint`
- `npm --workspace apps/frontend run build`
- `npx playwright test tests/landing-ui.spec.js` (3 passed)
- `npx playwright test tests/frontend-flow.spec.js --grep "partner referral is captured|frontend flow works"` (2 passed)

Final result: passed
