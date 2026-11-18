# Accessibility verification record

## Automated checks in the platform foundation

`apps/web/e2e/accessibility.spec.ts` checks the available page landmark and heading, the keyboard skip link, focus visibility and contrast, a computed text contrast ratio of at least 7:1, and the reduced-motion CSS preference.

`apps/web/e2e/staging-smoke.spec.ts` checks the initial page with axe-core tags for WCAG 2.0 and 2.1 A/AA/AAA and verifies the `/health` HTTP contract without following redirects.

Local Chromium on Windows on 2026-11-17 passed 4/4 tests, including axe, Tab → Enter → Shift+Tab through the skip link and main content, focus and text contrast, reduced motion, and the API smoke test.

## Manual assistive-technology checks

Status: pending manual verification before the first production release. NVDA is not installed or discoverable in the current Windows environment, and VoiceOver is unavailable on Windows. Do not treat the automated axe result as NVDA or VoiceOver evidence.

Record the following for every critical flow before release:

| Field                | Evidence to record                                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Tester and date      | Name/role and local date                                                                                                                 |
| Assistive technology | NVDA + Firefox/Chrome on Windows, or VoiceOver + Safari on macOS/iOS                                                                     |
| Device and browser   | OS version, device, browser/version                                                                                                      |
| Pages and flows      | Exact URL/page and steps performed                                                                                                       |
| Result               | Pass/fail per landmark, heading, accessible name, keyboard navigation, focus visibility, error announcement, and reduced-motion behavior |
| Findings             | Reproduction steps and linked issue/PR for each defect                                                                                   |

At this Spec #1 stage, verify the home page landmark/heading announcement and document the `/health` response as a technical contract (it is not a human-facing interface). Registration, catalog, promotions, cart, and checkout are outside this Spec and must be added by their owning specs before those flows can be accepted.
