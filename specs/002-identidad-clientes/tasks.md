# Tareas: Identidad y gestión de clientes

**Entrada**: `spec.md`, `plan.md`. Solo se marca `[x]` una tarea con evidencia (test o comando ejecutado). Formato: `[ID] [P?] [Historia] Descripción — ruta`.

## Fase 1: Fundaciones (bloquean todas las historias)

- [x] T001 [US1] Utilidad Argon2id (hash/verify) con `node:crypto` — `apps/api/src/modules/identity/infrastructure/password-hasher.ts` + spec
- [x] T002 [P] [US1] Política de contraseña: ≥ 12 caracteres y lista local de filtradas (FR-004) — `identity/domain/password-policy.ts` + spec
- [x] T003 [P] [US1] Generador y hash de tokens de un solo uso con TTL — `identity/domain/one-time-token.ts` + spec
- [x] T004 [P] [US1] Cifrado AES-256-GCM de PII — `identity/infrastructure/pii-cipher.ts` + spec
- [x] T005 [US1] Migración esquema `identity` (accounts, one_time_tokens, security_events) — `identity/migrations/<UTC>_identity_schema.ts`
- [x] T006 [US1] Migración esquema `customers` (customers, consents, rights_requests, data_inventory) — `customers/migrations/<UTC>_customers_schema.ts`
- [x] T007 [US1] Prueba de migraciones desde BD nueva (Testcontainers) — `identity/tests/migrations.spec.ts`
- [x] T008 [P] [US1] Puerto `EmailPort` + cliente SMTP mínimo (Mailpit) con reintento — `identity/infrastructure/smtp-email.ts`
- [x] T009 [P] [US1] Puerto de sesión en Redis (crear, leer, revocar, revocar-por-cuenta) — `identity/infrastructure/redis-session-store.ts`
- [x] T010 [P] [US1] Rate limiter en Redis (FR-005) — `identity/infrastructure/rate-limiter.ts`
- [x] T011 [US1] Registro de eventos de seguridad sin datos sensibles (FR-016) — `identity/application/security-events.ts`

## Fase 2: US1 — Cuenta e inicio de sesión (P1)

- [x] T012 [US1] Caso de uso `RegisterAccount` con consentimiento de política y respuesta no enumerable (FR-001, FR-006) + test correo duplicado
- [x] T013 [US1] `VerifyEmail` / `ResendVerification`, enlace usado o caducado (FR-002)
- [x] T014 [US1] `Login` / `Logout`, rechazo si no confirmado, límite de intentos y aviso al titular (FR-003, FR-005)
- [x] T015 [US1] `ForgotPassword` / `ResetPassword`, token 30 min de un solo uso (FR-003)
- [x] T016 [US1] Controladores `/api/v1/identity/*` con cookie de sesión y errores por campo
- [x] T017 [US1] Tests de integración del flujo completo (registro→confirmar→login→logout→recuperar)
- [ ] T018 [US1] Web: `/registro`, `/verificar-correo`, `/ingresar`, `/recuperar`, `/restablecer` accesibles — `apps/web/src/features/identity/**`, `apps/web/src/app/(identity)/**`
- [ ] T019 [US1] Pruebas de web (formularios, foco al primer error) y axe

## Fase 3: US2 — Roles y MFA (P1)

- [ ] T020 [US2] TOTP RFC 6238 con `node:crypto` + vectores de prueba del RFC — `identity/domain/totp.ts`
- [ ] T021 [US2] Guard de sesión y guard de rol, denegación por defecto, evento en 403 (FR-007)
- [ ] T022 [US2] Enrolamiento y verificación MFA; personal sin MFA solo puede enrolar (FR-008)
- [ ] T023 [US2] Alta de personal por admin con invitación; desactivar/reactivar y revocar sesiones (FR-009)
- [ ] T024 [US2] Restablecimiento de MFA por admin con registro (caso límite del spec)
- [ ] T025 [US2] Tests de permisos negativos 401/403 por rol
- [ ] T026 [US2] Web: `/personal/ingresar`, enrolamiento MFA, `/admin/personal`

## Fase 4: US3 — Perfil e historial (P2)

- [ ] T027 [US3] Ver/editar perfil propio con PII cifrada (FR-010)
- [ ] T028 [US3] Cambio de correo (reconfirmar + aviso al anterior) y de contraseña (reautenticación)
- [ ] T029 [US3] `OrdersHistoryPort` con stub; endpoint marcado pendiente hasta que exista Orders (FR-011)
- [ ] T030 [US3] Web `/perfil` accesible y tests

## Fase 5: US4 — Derechos LOPDP (P2)

- [ ] T031 [US4] Inventario de datos visible al cliente (FR-012)
- [ ] T032 [US4] Consentimientos con historial fechado (FR-013)
- [ ] T033 [US4] Exportación JSON de datos personales, < 1 min (FR-014, SC-005)
- [ ] T034 [US4] Eliminación con reautenticación, pedido en curso difiere, anonimización (FR-015, SC-006)
- [ ] T035 [US4] Web `/privacidad` y tests

## Fase 6: Cierre

- [ ] T036 Validación final: `pnpm lint`, `typecheck`, `test`, `build`; E2E/axe si es posible
- [ ] T037 Checklist requisito a requisito (FR-001…017, SC-001…006) y pendientes del líder
- [ ] T038 Documentar verificación manual con lector de pantalla (pendiente humano)

## Parches propuestos al líder (no aplicados)

`nodemailer` en `apps/api`; variable `IDENTITY_PII_KEY` y `IDENTITY_SMTP_*` en `.env.example`; `OrdersHistoryPort` en `@cafeteria/contracts`; enlace de navegación en el layout global.
