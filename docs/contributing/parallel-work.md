# Parallel work and integration rules

## Branch ownership

| Contributor | Branch | Primary paths |
|---|---|---|
| Lead — Spec #1 and #5 | `feature/spec-1`, then `feature/spec-5` | Repository root, `infra/`, `packages/`, CI and platform integration; later promotions folders. |
| Contributor 2 — Spec #2 | `feature/spec-2` | API `identity/` and `customers/`; web `features/identity/` and `features/customers/`. |
| Contributor 3 — Spec #3 | `feature/spec-3` | API `catalog/`; web `features/catalog/`. |

Start module branches from the reviewed platform baseline in `main`. Keep PRs scoped to owned folders; do not modify another module's implementation. The lead integrates shared-contract changes before consumers rebase.

## Shared-file coordination

The lead owns root `package.json`, workspace/Turbo/TypeScript/lint configuration, `pnpm-lock.yaml`, `.env.example`, Compose, shared contracts, and `apps/api/src/app.module.ts`. Contributors declare a dependency in their app/package manifest and request lockfile integration from the lead; do not concurrently regenerate the root lockfile. Module modules are already registered so feature PRs should not need `app.module.ts` edits.

## Conventions and local setup

Use lower-case/kebab-case package and file names; API routes use `/api/v1/<module>`; TypeScript imports cross module boundaries only through `@cafeteria/contracts` public exports. Migrations are timestamped and module-owned. Follow `README.md` and `specs/001-plataforma-entrega/quickstart.md`; copy `.env.example` to `.env`, run Compose, `pnpm db:migrate`, then `pnpm dev`. Use small Conventional Commits and PRs with rebase/linear history after branch protection is enabled.
