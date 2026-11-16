# Accessibility verification record

## Automated checks in the platform foundation

`apps/web/e2e/accessibility.spec.ts` additionally checks the available page landmark/heading, absence of an unexpected keyboard focus target, a computed text contrast ratio of at least 7:1, and the reduced-motion CSS preference. These browser checks do not replace the manual screen-reader checklist below.

`apps/web/e2e/platform.spec.ts` checks the initial page with axe-core against WCAG 2.1 A/AA rules and verifies the `/health` HTTP contract. It also confirms the page heading is exposed as a level-one heading. The initial local run on 2026-11-15 passed both E2E tests with no axe violations.

The initial page has no interactive controls, so keyboard focus order and visible focus are not meaningfully exercised yet. The shared UI token stylesheet includes a `prefers-reduced-motion` rule; automated checks for interactive reduced-motion behavior belong with the screen that introduces motion.

## Manual assistive-technology checks

Status: pending manual verification before the first production release. Do not treat the automated axe result as NVDA or VoiceOver evidence.

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
