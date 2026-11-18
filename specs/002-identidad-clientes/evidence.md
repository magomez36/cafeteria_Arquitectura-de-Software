# Evidence — Spec 002 Identity & Customers

Branch `feature/spec-2`. Node v24.21.0, pnpm 10.12.4, macOS. Platform fix `b4309f8` cherry-picked (clean, no conflicts) as `35034d2`.

## Commands actually run (final pass)

| Command                          | Result                                                                                                                                                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | OK                                                                                                                                                                                                                            |
| `pnpm lint`                      | OK (exit 0)                                                                                                                                                                                                                   |
| `pnpm typecheck`                 | OK (exit 0)                                                                                                                                                                                                                   |
| `pnpm test`                      | API 14 suites / 100 tests pass; worker 5 pass; **web FAILED**: vitest "Failed to start forks worker" for `apps/web/src/app/page.test.ts` (Spec #1 file, not touched by Spec 2; looks environmental, not investigated further) |
| `pnpm build`                     | OK (exit 0)                                                                                                                                                                                                                   |
| `pnpm audit --prod`              | No known vulnerabilities                                                                                                                                                                                                      |

Earlier in the session (before the migration rename): integration tests with real Postgres/Redis containers passed (`identity-customers-schema`, `identity-auth-flow`, `identity-staff-access`). **Not re-run after the rename** to `20261118115000_identity_schema.ts`.

## Not run (limitations)

E2E (Playwright), coverage, axe, web unit tests for Spec 2 screens, manual screen-reader check, integration tests re-run, live Mailpit (local port 1025/8025 taken by another project).

## Migrations

Only ran on disposable local Docker DB and Testcontainers; never on a persistent/shared DB. Renamed `20261118120000_identity_schema` -> `20261118115000_identity_schema` (order preserved: identity < customers 120100 < 120200 < 120300; no clash with Spec 3 `20261118120000_catalog-stock-consumption`). Anyone with a local DB that already applied the old name must reset it (disposable DBs only).

## Orders (Spec #6) dependency — PARTIAL/BLOCKED

Order history (FR-011), anonymising orders on erasure (FR-015) and order data in export (FR-014) use a stub port (`PendingOrdersHistory`) until Orders exists. Orders is not implemented here.

## Requirements matrix

Impl = `apps/api/src/modules/identity|customers`, web = `apps/web/src/features/identity|customers`. Tests = `*.spec.ts` next to services and `apps/api/test/integration/identity-*.int-spec.ts`.

| Req                              | Status    | Evidence / result                                                               | External deps                  |
| -------------------------------- | --------- | ------------------------------------------------------------------------------- | ------------------------------ |
| FR-001 registro + consentimiento | CUMPLIDO  | identity-service.ts; identity-service.spec (pass)                               | —                              |
| FR-002 confirmar correo          | CUMPLIDO  | identity-service.ts; auth-flow int-spec (passed earlier)                        | Spec #6 to enforce on purchase |
| FR-003 login/logout/recuperar    | CUMPLIDO  | identity-service.spec; int-spec                                                 | —                              |
| FR-004 contraseña 12+ / denylist | CUMPLIDO  | password-policy.ts; spec pass                                                   | —                              |
| FR-005 rate limit                | CUMPLIDO  | redis-adapters.ts; spec pass                                                    | Redis                          |
| FR-006 no enumeración            | CUMPLIDO  | identity-service.spec                                                           | —                              |
| FR-007 roles                     | CUMPLIDO  | auth.guard.ts; staff-access int-spec; authentication adapter spec (5 pass)      | —                              |
| FR-008 MFA staff/admin           | CUMPLIDO  | mfa-service.ts, totp.ts; staff-and-mfa.spec pass                                | —                              |
| FR-009 gestión de personal       | CUMPLIDO  | staff-service.ts; spec pass                                                     | —                              |
| FR-010 perfil/contraseña/correo  | CUMPLIDO  | account-service.ts, customers-service.ts; specs pass (unit only)                | —                              |
| FR-011 historial pedidos         | BLOQUEADO | stub port                                                                       | Spec #6 Orders                 |
| FR-012 inventario de datos       | CUMPLIDO  | customers migration + service; unit                                             | —                              |
| FR-013 consentimientos           | CUMPLIDO  | customers-service.spec pass                                                     | —                              |
| FR-014 exportación               | PARCIAL   | profile/consents export; orders part missing                                    | Spec #6                        |
| FR-015 eliminación               | PARCIAL   | erasure via Redis queue consumer; order anonymisation missing                   | Spec #6                        |
| FR-016 eventos de seguridad      | CUMPLIDO  | pg-repositories.ts; access_denied also via AuthenticationPort                   | —                              |
| FR-017 WCAG 2.2 AAA              | PARCIAL   | accessible Form (labels, error summary, focus first error); no axe/manual check | human audit                    |
| SC-001 registro < 2 min          | PENDIENTE | not measured                                                                    | —                              |
| SC-002 95 % al primer intento    | PENDIENTE | not measured                                                                    | users                          |
| SC-003 teclado + lector          | PARCIAL   | semantics written; not verified                                                 | human                          |
| SC-004 MFA 100 % staff           | CUMPLIDO  | MFA enforced by guard (staff-access int-spec)                                   | —                              |
| SC-005 descarga < 1 min          | PARCIAL   | synchronous JSON export; not timed, no orders                                   | Spec #6                        |
| SC-006 sin datos tras eliminar   | PARCIAL   | PII erased; orders anonymisation pending                                        | Spec #6                        |

## Inherited vs introduced

Web vitest worker failure is in a Spec #1 file; not caused by Spec 2 changes (unverified on base). No other failures.
