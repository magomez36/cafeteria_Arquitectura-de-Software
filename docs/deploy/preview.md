# Preview and staging smoke checks

The Playwright suite in `apps/web/e2e/staging-smoke.spec.ts` can run against local development servers or an already deployed preview/staging pair. The default local run starts Next.js at `http://127.0.0.1:3000` and NestJS at `http://127.0.0.1:4000`. To target a deployed environment, set `WEB_BASE_URL` and `API_BASE_URL`; setting either disables local server startup. The suite checks the home page heading, axe WCAG 2.1 A/AA violations, and the API `/health` status/body.

Example (use the provider URLs supplied by the account owner; this repository does not invent them):

```powershell
$env:WEB_BASE_URL = '<owner-provided-preview-url>'
$env:API_BASE_URL = '<owner-provided-preview-api-url>'
pnpm --filter @cafeteria/web test:e2e
```

Do not put authenticated production endpoints or credentials in these values. No real preview/staging URL has been supplied, so only the local target has been verified so far. The Playwright suite does not deploy or mutate the target.

For Vercel preview configuration and required GitHub Environment values, see [provider setup](provider-setup.md). For manual NVDA/VoiceOver evidence, see [accessibility acceptance](../accessibility/acceptance.md).
