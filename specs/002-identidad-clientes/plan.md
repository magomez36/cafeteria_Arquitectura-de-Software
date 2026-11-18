# Plan de implementación: Identidad y gestión de clientes

**Spec**: `specs/002-identidad-clientes/spec.md` | **Rama**: `feature/spec-2` | **Base**: `e0b90e6d1d48e01f2498185cd08d6d17234d2ce2`

## Resumen técnico

Módulos NestJS `identity` (cuentas, credenciales, sesiones, MFA, roles, eventos de seguridad) y `customers` (perfil, consentimientos, solicitudes de derechos, exportación, eliminación), con web en `apps/web/src/features/identity|customers`. Cada módulo es dueño de su esquema Postgres (`identity`, `customers`); la comunicación entre ellos y con otros dominios es solo por contratos públicos de `@cafeteria/contracts` (`IdentityReference`, `CustomerReference`).

## Restricción de dependencias (decisión del equipo)

No se modifican `apps/api/package.json`, `pnpm-lock.yaml`, `packages/contracts/**`, `.env.example`, `AppModule` ni infraestructura (propiedad del líder). Por eso:

| Necesidad                      | Solución sin dependencias nuevas                               | Parche propuesto al líder        |
| ------------------------------ | -------------------------------------------------------------- | -------------------------------- |
| Argon2id (FR / ROADMAP)        | `node:crypto` `argon2` (Node 24)                               | —                                |
| TOTP (FR-008)                  | RFC 6238 con `node:crypto` HMAC-SHA1                           | `otplib` opcional                |
| Validación de entrada          | Validadores propios en `domain/`                               | `zod` opcional                   |
| Contraseñas filtradas (FR-004) | Lista local embebida de contraseñas comunes (sin API externa)  | —                                |
| Correo (Mailpit)               | Puerto `EmailPort` + cliente SMTP mínimo con `node:net`        | `nodemailer`                     |
| Sesión/revocación/rate limit   | `redis` ya presente                                            | —                                |
| PII cifrada por columna        | AES-256-GCM con `node:crypto`; clave en env `IDENTITY_PII_KEY` | Añadir variable a `.env.example` |

## Arquitectura (por módulo)

`domain/` (entidades, reglas, puertos) → `application/` (casos de uso) → `infrastructure/` (Postgres, Redis, SMTP, crypto) → `controllers/` (HTTP, DTO, guards). El dominio no importa Nest ni `pg`.

## Modelo de datos (migraciones aditivas, timestamp UTC)

**Esquema `identity`**: `accounts` (id, email_hash, email_enc, password_hash, role `customer|staff|admin`, status `pending|active|disabled`, mfa_secret_enc, mfa_enabled), `one_time_tokens` (hash, purpose `verify_email|reset_password|invite`, expires_at, used_at), `security_events` (type, account_id, ip_hash, created_at; sin datos sensibles), `mfa_recovery_resets`.
**Esquema `customers`**: `customers` (account_id, nombre/teléfono cifrados, preferencias), `consents` (purpose, state, changed_at; historial), `rights_requests` (type, status, due_at), `data_inventory` (dato, finalidad, retención).
Migraciones solo en `modules/*/migrations/`, nunca destructivas ni sobre esquemas ajenos.

## Estados de autenticación

cliente no confirmado → cliente activo; personal sin MFA (solo puede enrolar MFA) → personal activo; sesión revocada; cuenta desactivada; token de recuperación expirado/usado. Todas las respuestas de registro/login/recuperación son no enumerables (misma forma y tiempo aproximado).

## API REST (`/api/v1/identity`, `/api/v1/customers`)

Identity: `POST register`, `POST verify-email`, `POST resend-verification`, `POST login`, `POST login/mfa`, `POST logout`, `POST password/forgot`, `POST password/reset`, `POST mfa/enroll`, `POST mfa/confirm`, `POST staff` (admin), `POST staff/:id/deactivate|reactivate`, `POST staff/:id/mfa-reset`.
Customers: `GET/PATCH me`, `POST me/email-change`, `POST me/password`, `GET me/orders` (contrato con Orders, ver H), `GET me/data-inventory`, `GET/PUT me/consents`, `POST me/export`, `POST me/deletion`.
Autorización: guard de sesión + guard de rol en servidor, denegación por defecto; 401 sin sesión, 403 sin rol, evento de seguridad en cada denegación.

## Seguridad (amenazas y mitigaciones)

Fuerza bruta/credential stuffing → rate limit en Redis por IP+correo, aviso al titular. Enumeración → respuestas uniformes. Robo de token → tokens aleatorios de 256 bits, solo hash en BD, TTL 30 min para recuperación, uso único. Sesiones → id opaco en cookie `HttpOnly; Secure; SameSite=Lax`, almacenadas en Redis, revocación inmediata. Logs sin contraseñas ni PII. Caída de Redis → login falla cerrado (503), nunca abierto. Caída de correo → registro se completa y el envío se reintenta; se informa sin revelar existencia.

## H. Dependencia de Orders

`GET me/orders` consume un puerto `OrdersHistoryPort` (a definir en contratos por el líder). Mientras Orders no exista se usa un stub en tests y el endpoint devuelve lista vacía marcada como pendiente. No se simula el módulo.

## Frontend (Next.js, WCAG 2.2 AAA)

Rutas propias: `/registro`, `/verificar-correo`, `/ingresar`, `/recuperar`, `/restablecer`, `/perfil`, `/privacidad`, `/personal/ingresar`, `/admin/personal`. Formularios con etiqueta, errores asociados, foco al primer error, teclado completo, contraste ≥ 7:1, objetivos ≥ 44 px. Sin tocar layout global ni catálogo; navegación compartida se coordina con el líder.

## Estrategia de pruebas

Unitarias Jest (dominio y casos de uso), integración con Testcontainers (Postgres/Redis), permisos negativos 401/403, Vitest en web si está disponible, E2E Playwright + axe donde el entorno lo permita. Verificación manual con VoiceOver documentada. Migraciones probadas desde BD nueva. Antes de cada publicación: `lint`, `typecheck`, `test`, `build`.

## Constitution Check

I Accesibilidad: plan de verificación incluido. II Seguridad: Argon2id, MFA, RBAC servidor. III LOPDP: minimización, inventario, cifrado de PII, anonimización. V Límites: contratos públicos únicamente. VI Calidad: tests por historia. VII Commits: atómicos, scopes `identity`/`customers`/`web`. Sin violaciones.
