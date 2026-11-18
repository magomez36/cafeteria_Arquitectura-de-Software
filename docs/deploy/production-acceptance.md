# Production release acceptance record

**Status: not executed.** No production release, provider environment or manual screen-reader result has been recorded.

Before enabling a production release, capture:

- Authorized approver and GitHub Environment approval event.
- Version, release tag, changelog entry, source SHA and immutable API/worker/web artifacts.
- Predeploy/migration result and proof that a failed migration leaves the prior release active.
- API/worker-before-web order, health checks, smoke result and user-visible availability during promotion.
- Controlled failure rollback result, prior deployment IDs, alert and measured recovery duration (<5 minutes).
- NVDA or VoiceOver version, operating system/device, browser, pages/critical flows, keyboard/focus/contrast/reduced-motion findings.

The foundation home and `/health` do not represent account, catalog, cart or checkout flows; those screens must be included by their owning specs before critical-flow release acceptance.
