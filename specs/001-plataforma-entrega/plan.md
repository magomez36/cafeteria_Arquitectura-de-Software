# Implementation Plan: Plataforma de entrega continua

**Branch**: `feature/spec-1` | **Date**: 2026-11-15 | **Spec**: [spec.md](spec.md)
**Input**: `specs/001-plataforma-entrega/spec.md`

## Summary

Preparar un monorepo TypeScript con pnpm y Turborepo para `apps/web` (Next.js), `apps/api` (NestJS), `apps/worker` y paquetes compartidos; hacerlo clonable y ejecutable por los tres integrantes, con servicios locales, convenciones de commits y CI inicial. A continuación, cerrar las puertas de calidad y seguridad, y habilitar previews, staging, producción con aprobación/rollback y métricas Grafana. El plan conserva todo el alcance de la Fase 0, pero no hace que las cuentas/planes externos bloqueen el trabajo local del equipo.

## Alcance y prioridades

| Prioridad | Entrega | Incluye | Habilita |
|---|---|---|---|
| P0 — Plataforma mínima de equipo | Monorepo reproducible y contratos básicos | Node.js LTS, pnpm, Turborepo; Next.js, NestJS y worker; página base y health check; paquetes compartidos; TypeScript estricto; scripts raíz; Docker Compose para Postgres, Redis, RabbitMQ y correo local; `.env.example` sin secretos; instrucciones locales; módulos Nest vacíos con reglas de límites; ADR de arquitectura/stack; modelo inicial de amenazas e inventario de datos; tokens base con contraste AAA | Cada integrante puede clonar y ejecutar localmente sin cuentas cloud; para crear ramas de módulos desde `main`, esperar a integrar el baseline con PR y CI mínimo de P1 |
| P1 — Colaboración y CI obligatoria | Calidad verificable en cada PR | Conventional Commits, commitlint + Husky + lint-staged; reglas de rama `main`; GitHub Actions con instalación reproducible, lint, typecheck, tests existentes y builds afectados; cobertura/reportes como artefactos | PRs pequeños, revisables, atómicos y con checks visibles |
| P2 — Puertas avanzadas de calidad/seguridad | Quality Gate y defensas CI completas | SonarQube en código nuevo; Testcontainers; validación commit a commit; análisis dependencias, secretos e imágenes (OSV/npm audit, gitleaks, Trivy, CodeQL, según compatibilidad); E2E Playwright + axe sobre preview; bloqueos de merge | Cumplimiento integral de FR-001/002/006/007/008/009 y constitución VI/VII |
| P3 — Entrega automatizada a entornos | Preview y staging primero; producción después | Vercel preview; Render Blueprint; GHCR por digest; despliegue del artefacto validado; smoke tests; release-please; secrets por environment; producción con aprobación, backend antes del frontend, rollback automático | Staging continuo y releases controlados (FR-010–019) |
| P4 — Métricas y operación avanzada | Visibilidad responsable de entrega | Grafana Cloud inicialmente; fuentes GitHub, Actions y SonarQube; DORA, flujo, calidad, salud del pipeline y aporte del equipo; alertas, anotaciones y control de acceso; k6 nightly/estacional | Observabilidad del proceso sin rankings individuales (FR-020–024) |

El alcance de P0 también incluye el primer ADR de stack/arquitectura, un modelo de amenazas inicial, inventario mínimo de datos personales y tokens de diseño accesibles (contraste ≥7:1). Las pantallas posteriores deben respetar WCAG 2.2 AAA; estos entregables fundacionales no sustituyen las auditorías de las fases de producto.

**Secuencia recomendada para el equipo de tres:** terminar el runtime local P0, completar US1/CI mínimo y hacer PR aprobado a `main`; solo entonces Spec #2/#3/#5 parten del nuevo `main` en ramas individuales. El líder puede continuar US2 (Vercel/Render preview/staging) mientras los otros integrantes implementan sus carpetas ya registradas. P3 avanzado requiere cuentas/variables/permisos; P4 se aborda cuando CI/despliegues generen datos útiles. US1 y US2 son P1 del spec; US3–US5 siguen dentro del alcance total.

## Technical Context

**Language/Version**: TypeScript estricto; Node.js LTS (versión fijada en `.nvmrc`/`engines` y CI); pnpm con `packageManager` fijado. No se usa Python en la aplicación.
**Primary Dependencies**: Next.js (App Router) + React; NestJS; Turborepo; pnpm workspaces; Docker Compose; ESLint, Prettier, TypeScript; Vitest para Next.js y paquetes compartidos; Jest para NestJS API/worker; Playwright + axe; Testcontainers; `pg` + `node-pg-migrate` para migraciones SQL TypeScript; node-redis (`redis`) para Redis/feature flags; commitlint/Husky/lint-staged; GitHub Actions; SonarQube; Vercel; Render; Grafana; release-please; GHCR. Escáneres (OSV/npm audit, gitleaks, Trivy y CodeQL) se eligen y fijan durante P2.
**Storage**: Postgres, Redis-compatible Render Key Value y RabbitMQ en producción; equivalentes locales en Compose; Postgres con esquemas por dominio y un ledger central de migraciones. Redis guarda feature flags namespaced; si falta una flag, queda desactivada. Mailpit (o equivalente local ligero) para correo de prueba.
**Testing**: unitarios Next/paquetes con Vitest; unitarios API/worker con Jest; integración con Testcontainers para Postgres, Redis y RabbitMQ; E2E en browser con Playwright + axe; builds Next/Nest/Docker; k6 contra staging. No se añade lógica de negocio de cafetería en este spec.
**Target Platform**: desarrollo local Windows/macOS/Linux con Docker; GitHub Actions para automatización; Vercel para Next.js y Render para API/workers/servicios.
**Project Type**: monorepo web con frontend, API, worker y librerías compartidas.
**Performance Goals**: SC-001 controles habituales (PR de hasta 10 commits) <15 min; SC-004 staging <20 min; rollback productivo <5 min (SC-005); pruebas k6 nocturnas y estacionales contra staging. El pipeline base debe evitar reconstrucciones innecesarias con filtros del grafo Turborepo.
**Constraints**: despliega únicamente GitHub Actions; despliegue Git automático desactivado en Vercel/Render; artefacto de promoción idéntico (digest/prebuilt); secretos nunca en Git; `main` con PR, una aprobación y checks verdes; historial lineal; servicios/colas/bases privados en Render; Vercel y Render en la misma región; rollback de datos mediante migración nueva (expand/contract), no `git revert` de una migración aplicada.
**Scale/Scope**: tres integrantes; fase de fundaciones; nueve módulos de dominio se preservan como límites/estructura de backend futura (Identidad, Clientes, Catálogo, Promociones, Carrito, Pedidos, Pagos, Notificaciones y Reportes). Este plan no implementa sus funciones.

## Decisions and assumptions

- Se adopta el monorepo descrito en `ROADMAP.md`: `apps/web`, `apps/api`, `apps/worker`, `packages/*`. El worker comparte dominio y contratos con la API, pero es un proceso desplegable separado, no un microservicio de dominio.
- Las versiones exactas de Node, pnpm, Next.js, NestJS y Turborepo se fijan juntas durante P0 con versiones estables compatibles disponibles al implementar. El lockfile se genera/actualiza después de declarar todos los manifests workspace y CI usa instalación congelada. La actualización se hace por PR.
- Migraciones: `node-pg-migrate` con `pg`, SQL/TypeScript, una ruta glob de migraciones por módulo (`apps/api/src/modules/*/migrations/`), nombres únicos con timestamp UTC + módulo + intención, ledger central en Postgres, orden verificado y advisory lock del runner. Cada archivo modifica solo el esquema de su módulo. CI detecta prefijos duplicados/orden; las migraciones siguen expand/contract y no se usa `down` destructivo. El merge que ordena migraciones conflictivas se serializa.
- Feature flags: paquete compartido mínimo (`packages/feature-flags`) con interfaz TypeScript y provider Redis usando node-redis. Flags namespaced (`identity.*`, `customers.*`, `catalog.*`, `promotions.*`), default-off y sin PII; API aplica la flag en servidor. Un endpoint read-only publica solo el allowlist de flags no sensibles para web; operador autorizado puede cambiar valores en runtime mediante CLI de operaciones dentro de la red privada, sin deploy. No se crea CRUD público ni se implementan flags de negocio en este spec.
- Por defecto se usan SonarQube Cloud y Grafana Cloud, consistentes con los supuestos del spec. RabbitMQ queda como decisión operativa entre servicio privado Render y CloudAMQP; el contrato local seguirá siendo RabbitMQ. Ninguna opción cambia el stack aprobado.
- Render plan, previews backend y pre-deploy; límites/costos de Vercel; región compartida; GitHub Environments/protección; y disponibilidad de SonarQube/Grafana son dependencias de P3/P4. Registrar su resolución en configuración/README y mantener staging como backend temporal para previews si el plan no permite entornos efímeros.
- La protección efectiva de `main`, GitHub Environments, secretos y conectores externos requiere permisos de owner/admin. Los artefactos locales/CI se pueden preparar antes; la activación se considera pendiente hasta verificarla en el repositorio remoto.
- En P0 los controles CI solo exigen reportes para suites que existan. Los umbrales SonarQube y escaneos bloqueantes se activan cuando la cobertura, proyecto y credenciales estén configurados; no se relajan los mínimos constitucionales.

## Constitution Check

*Gate before research and re-evaluated after design.*

| Puerta | Estado | Aplicación en este plan |
|---|---|---|
| I. Accesibilidad AAA | PASS (con verificación manual pendiente por release) | La página inicial y UI futura siguen WCAG 2.2 AAA/mobile-first; axe en CI y NVDA o VoiceOver manual para cada interfaz/flujo crítico antes del release. |
| II. Seguridad por diseño | PASS | Secretos en GitHub Environments/Vercel/Render, servicios privados y ningún dato de tarjeta; escaneos bloquean secretos y vulnerabilidades altas/críticas de dependencias e imágenes. Threat model inicial en P0; revisión OWASP ASVS L2 completa queda para endurecimiento previo al lanzamiento. |
| III. LOPDP | PASS | Este spec no introduce PII de clientes. Métricas individuales son PII operativa: aviso, minimización y acceso restringido antes de habilitar P4. |
| IV. Escalabilidad y consistencia | PASS (no se implementa flujo de pedidos) | API/worker sin estado; Redis/Postgres/cola preparados en arquitectura. Outbox e idempotencia quedan como obligaciones de specs de dominio, no se simulan aquí. |
| V. Límites de dominio | PASS | NestJS modular; estructura de módulos y regla ESLint de límites prevista. No se añaden abstracciones de negocio prematuras. |
| VI. Calidad verificada | PASS | CI y pruebas se incorporan incrementalmente; gates de SonarQube bloqueantes P2 con los umbrales constitucionales. TDD de precios/pedidos se aplicará en sus specs, no en el scaffolding. |
| VII. Commits atómicos y reversibles | PASS | Convenciones, hooks, CI por commit, PR/rebase y política expand/contract/feature flags quedan especificados. Ningún cambio de este plan realiza commits. |
| Plataforma | PASS | TypeScript, pnpm/Turbo, Next/Vercel, NestJS/Render y despliegue solo por pipeline; no Python en el stack de aplicación. |

No hay violaciones de constitución que requieran excepción.

## Project Structure

```text
apps/
  web/                         # Next.js, UI accesible
  api/                         # NestJS modular y health
  worker/                      # Proceso independiente sin estado
packages/
  contracts/                   # DTOs/ports versionados compartidos entre módulos
  feature-flags/               # Puerto y tipos del mecanismo de toggles dinámicos
  ui/                          # Paquete de tokens accesibles
  tsconfig/                    # Configuraciones TypeScript compartidas
  eslint-config/               # Reglas comunes y límites de módulos
infra/
  compose.yaml                 # Dependencias locales (Postgres, Redis, RabbitMQ, Mailpit)
.github/
  workflows/                   # CI PR, staging y release (por fases P1–P3)
scripts/                        # Utilidades Node/TypeScript para checks si son necesarias
docs/
  adr/                          # Decisiones arquitectónicas
  contributing/                 # Ramas, ownership, PRs e integración
specs/                          # Especificaciones y decisiones de diseño
```

Cada `apps/*` y paquete tiene `package.json`, `tsconfig` y tests. NestJS tiene los módulos pre-registrados una sola vez en `apps/api/src/app.module.ts`; después del merge del Spec #1, cada spec trabaja dentro de su carpeta y no modifica `app.module.ts`. La estructura es `apps/api/src/modules/<module>/{<module>.module.ts,controllers/,application/,domain/,infrastructure/,migrations/,tests/}`. Los cuatro módulos paralelos son `identity`, `customers`, `catalog` y `promotions`; los otros se mantienen vacíos. Frontend por feature en `apps/web/src/features/<feature>/`.

Contratos públicos TypeScript en `packages/contracts/src/`: referencias Identity/Customer sin PII, `catalog/product.ts` para producto, `pricing/money.ts` y `pricing/quote.ts` para montos/precios, y `ports/catalog.port.ts`/`ports/pricing.port.ts` para interfaces. `Money.amountMinor` es entero en centavos, nunca coma flotante. Catálogo publica el contrato de producto; Promociones consume el contrato/port de producto y produce `PriceQuote`. No se implementan CRUD, reglas de menú ni motor promocional en este spec. Cambios a contratos requieren PR del dueño del paquete, compatibilidad aditiva y revisión antes de actualizar consumers.

La raíz contiene `pnpm-workspace.yaml`, `turbo.json`, `package.json`, lockfile, `.node-version`/`.nvmrc`, `.env.example`, `.gitignore` y guía de contribución. La configuración global queda bajo ownership del líder/integrador.

**Structure Decision**: monorepo pnpm/Turborepo con tres aplicaciones y paquetes compartidos mínimos. Respeta la Fase 0 de `ROADMAP.md` y permite ownership por carpetas/PR sin dividir el backend en servicios. Rutas API versionadas `/api/v1/<module>` (kebab-case); imports cruzados solo por exports públicos de `@cafeteria/contracts`/ports, nunca desde otro módulo; migraciones y rutas de módulo en minúsculas.

### Colaboración de tres integrantes

| Integrante/Spec | Rama | Carpetas de ownership primario |
|---|---|---|
| Líder — Spec #1 | `feature/spec-1` | raíz, `.github/`, `infra/`, `packages/contracts/`, `packages/feature-flags/`, `packages/ui/`, CI/deploy y módulos vacíos preregistrados |
| Integrante 2 — Spec #2 | `feature/spec-2` | `apps/api/src/modules/identity/`, `apps/api/src/modules/customers/`, `apps/web/src/features/identity/`, `apps/web/src/features/customers/` |
| Integrante 3 — Spec #3 | `feature/spec-3` | `apps/api/src/modules/catalog/`, `apps/web/src/features/catalog/` |
| Líder — Spec #5 | `feature/spec-5` | `apps/api/src/modules/promotions/`, `apps/web/src/features/promotions/` |

Spec #1 se integra primero a `main`; las otras ramas parten de ese baseline. Owners implementan y prueban en su carpeta, abren PRs separados, rebasan contra `main` después de cada integración y no cambian módulos de otra persona. `app.module.ts`, configuración raíz y lockfile tienen un dueño integrador; cada owner declara dependencias en su `package.json` local y solicita que el integrador actualice el lockfile dentro del mismo PR antes de merge; no se actualiza en dos PRs abiertos en paralelo. Los contratos de producto/precio quedan congelados al comenzar Spec #2/#3/#5; una modificación necesaria se integra primero como PR pequeño de contrato y luego se rebasan consumers. El owner API revisa compatibilidad antes de integrar Promociones con Catálogo.

## Orden de implementación y dependencias

1. **P0.1 Contrato de repositorio y scaffolding**: Node/pnpm/Turbo, root manifest/workspace, tres apps, packages/contracts/ui/feature-flags, tipos compartidos y módulos preregistrados; el lockfile final espera todos los manifests. Dependencia: ninguna; bloquea todo lo demás.
2. **P0.2 Arranque local**: Compose y `.env.example`, `pnpm dev` levanta web/API/worker juntos, `/health`, `db:migrate` y README/quickstart; verificación Windows/Unix. Depende de P0.1 y Docker disponible.
3. **P0.3 Colaboración**: reglas de ramas y PR, Conventional Commits, Husky/commitlint/lint-staged y división por ownership. Depende de P0.1.
4. **P1 CI mínimo**: checks de formato/lint/typecheck/tests/build con cache y Turbo affected; construir y escanear imágenes antes del required gate; protección de `main`. Depende de P0.1–P0.3 y permisos GitHub.
5. **P2 calidad/seguridad**: Testcontainers; SonarQube; thresholds bloqueantes de vulnerabilidad alta/crítica; PR preview con Playwright/axe y verificación manual NVDA/VoiceOver antes de release; rebase-exec por commit. Dependencia: CI estable, reportes de cobertura y credenciales/configuración de servicio.
6. **P3 despliegue de preview y staging**: Vercel prebuilt, imagen API/worker a GHCR por SHA/digest, Render Blueprint con `autoDeploy: false`, migración predeploy, smoke tests y alertas. Dependencia: cuentas, región, planes, servicios/secretos y health endpoints.
7. **P3 release/rollback**: release-please, environments protegidos, aprobación manual, migración `node-pg-migrate` antes de activar backend, backend antes del frontend, serialización, smoke + rollback de ambos proveedores y ensayo de reversión. Dependencia: staging fiable y mecanismos de rollback validados.
8. **P4 Grafana y carga programada**: GitHub/Actions/SonarQube, métricas etiquetadas por equipo, dashboards/ACL/aviso de datos, alertas, k6. Dependencia: eventos de CI/deploy estables, servicio Grafana y decisión de privacidad.

## Complexity Tracking

No hay violaciones. La separación de API y worker responde al despliegue y escalado independiente previsto por la arquitectura; ambos pertenecen al mismo monolito modular/dominio.
