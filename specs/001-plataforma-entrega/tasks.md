---
description: 'Tareas de implementación para la plataforma de entrega continua'
---

# Tasks: Plataforma de entrega continua

**Input**: Design documents in `specs/001-plataforma-entrega/` (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, `contracts/`).
**Prerequisites**: Plan, spec, research, data model, contracts and quickstart are present.
**Branch**: `feature/spec-1`.

**Organization**: tareas agrupadas por historias de usuario del spec original. Las historias P1 se mantienen primero; la plataforma local es prerequisite compartido para que el equipo pueda trabajar en esas historias.

**Testing**: pruebas automatizadas obligatorias por constitución VI. Añadir pruebas antes de implementar comportamiento. No hay lógica de precios/pedidos/pagos en este Spec; no aplica TDD de esos dominios.

## Formato y convenciones

- Cada tarea usa `- [ ] T### [P?] [US#?] descripción con ruta exacta`.
- `[P]` indica que la tarea puede ejecutarse en paralelo sin editar los mismos archivos ni depender de tareas incompletas.
- Las historias usan el mapeo del spec: US1 controles automáticos, US2 preview/staging, US3 release productivo, US4 reversibilidad, US5 métricas.
- **Local**: implementable/validable sin cuenta SaaS, usando Git, Node/pnpm, Docker Compose y CI local. **Externo**: requiere permisos, cuenta, secrets o plan de proveedor.
- Los tokens, `.env` y credenciales son siempre externos al repositorio.

## Fase 1: Setup — plataforma mínima compartida

**Propósito**: crear el monorepo y dejar las aplicaciones inicializables por los tres integrantes.
**Validación de fase**: instalación limpia con lockfile y `pnpm build` sobre las tres apps; no se requiere ninguna cuenta cloud.

- [x] T001 Crear el manifiesto raíz y workspace pnpm, fijar Node.js LTS y pnpm en `package.json`, `.nvmrc`, `pnpm-workspace.yaml` y definir scripts raíz; posponer la generación final del lockfile hasta que existan todos los manifiestos de apps y paquetes.
- [x] T002 Configurar tareas y cache del grafo de paquetes en `turbo.json`, incluyendo `build` después de `^build` y `dev` persistente/no cacheado.
- [x] T003 [P] Inicializar el workspace `@cafeteria/web` con Next.js App Router y TypeScript estricto en `apps/web/`, con página de inicio mínima, Vitest y scripts `dev`, `lint`, `typecheck`, `test` y `build`.
- [x] T004 [P] Inicializar el workspace `@cafeteria/api` con NestJS y TypeScript estricto en `apps/api/`, estructura modular, Jest, `apps/api/Dockerfile` y scripts `dev`, `lint`, `typecheck`, `test` y `build`.
- [x] T005 [P] Crear el workspace `@cafeteria/worker` como proceso Node/TypeScript en `apps/worker/`, con Jest, `apps/worker/Dockerfile`, ciclo de vida sin servidor HTTP obligatorio y scripts `dev`, `lint`, `typecheck`, `test` y `build`.
- [x] T006 Crear manifests `package.json`/`tsconfig.json` con nombres `@cafeteria/tsconfig`, `@cafeteria/eslint-config`, `@cafeteria/contracts`, `@cafeteria/feature-flags` y `@cafeteria/ui` para los workspace packages en `packages/tsconfig/`, `packages/eslint-config/`, `packages/contracts/`, `packages/feature-flags/` y `packages/ui/`; definir referencias públicas en `packages/contracts/src/identity/identity-reference.ts`, `customers/customer-reference.ts`, `catalog/product.ts`, `pricing/money.ts`, `pricing/quote.ts`, `ports/catalog.port.ts`, `ports/pricing.port.ts` y exports en `packages/contracts/src/index.ts`; añadir prueba Vitest de tipos/shape en `packages/contracts/test/public-contracts.test.ts`; `Money.amountMinor` debe ser entero en centavos; usar `workspace:*` y no añadir lógica de negocio.
- [x] T007 Configurar ESLint, Prettier y TypeScript estricto reutilizables en `packages/eslint-config/`, `packages/tsconfig/` y archivos raíz `.prettierrc.json`, `eslint.config.mjs` y `tsconfig.json`.
- [x] T008 Documentar instalación multiplataforma, comandos raíz, puertos, solución de errores y requisitos de Docker en `README.md`.

**Checkpoint**: otro integrante puede clonar la rama, instalar con `pnpm install --frozen-lockfile` y compilar web, API y worker usando la documentación; esto aún no desbloquea historias hasta completar la Fase 2.

---

## Fase 2: Foundational — arranque local bloqueante

**Propósito**: infraestructura local, configuración y contratos mínimos compartidos por todas las historias.
**Validación de fase**: Docker Compose saludable, `GET /health` responde estado sano, pruebas locales pasan y cualquier integrante puede seguir `quickstart.md` sin credenciales cloud.
**Primera fase que desbloquea el trabajo colaborativo en paralelo**: completar esta fase después de Setup.

- [x] T009 Definir servicios, volúmenes aislados, healthchecks y puertos de Postgres, Redis, RabbitMQ y Mailpit en `infra/compose.yaml`.
- [x] T010 Crear valores locales seguros de ejemplo para `DATABASE_URL`, `REDIS_URL`, `AMQP_URL`, correo y URL API en `.env.example`; excluir archivos locales reales y secretos en `.gitignore`.
- [x] T011 Crear y preregistrar una sola vez módulos Nest vacíos `identity`, `customers`, `catalog`, `promotions`, `cart`, `orders`, `payments`, `notifications`, `reports` en `apps/api/src/modules/<module>/<module>.module.ts` y un módulo de plataforma en `apps/api/src/platform/platform.module.ts` desde `apps/api/src/app.module.ts`; dejar carpetas `controllers/`, `application/`, `domain/`, `infrastructure/`, `migrations/`, `tests/` sin funcionalidad de dominio.
- [x] T012 Configurar reglas ESLint de límites entre módulos y convenciones `/api/v1/<module>`, kebab-case e imports solo desde exports públicos de `@cafeteria/contracts` en `packages/eslint-config/`, `apps/api/eslint.config.mjs` y `docs/architecture/module-boundaries.md`; prohibir imports a esquemas/implementaciones privadas y cambios posteriores a `apps/api/src/app.module.ts` salvo PR del integrador.
- [x] T013 Escribir primero pruebas unitarias y de integración para `GET /health` (status HTTP y cuerpo esperado) en `apps/api/src/health/health.controller.spec.ts` y `apps/api/test/health.e2e-spec.ts`.
- [x] T014 Implementar `GET /health` para satisfacer las pruebas en `apps/api/src/health/health.controller.ts` y registrar el módulo de salud en `apps/api/src/app.module.ts`.
- [x] T015 Configurar la infraestructura de ejecución de la prueba de integración de health y sus setup/teardown en `apps/api/test/jest-e2e.json` y `apps/api/test/health.e2e-spec.ts`; ejecutar las suites después de T016 durante el checkpoint de Fase 2.
- [x] T016 Después de crear todos los manifests de workspace, ejecutar `pnpm install` y guardar `pnpm-lock.yaml`; configurar comandos raíz `pnpm dev` (web/API/worker simultáneos), `lint`, `typecheck`, `test`, `build` y `db:migrate` en `package.json`, `turbo.json`, `apps/web/package.json`, `apps/api/package.json` y `apps/worker/package.json`; instalar/configurar `pg` + `node-pg-migrate` con glob `apps/api/src/modules/*/migrations/*.ts`, ledger, order check y advisory lock en `apps/api/src/database/`.
- [x] T017 Redactar ADR inicial del monorepo, contratos, migraciones y feature flags con sus alternativas en `docs/adr/0001-stack-y-monorepo.md`.
- [x] T018 Crear modelo inicial de amenazas y registro mínimo de datos personales del equipo en `docs/security/threat-model.md` y `docs/privacy/data-inventory.md`.
- [x] T019 Definir tokens iniciales de color/tipografía con contraste de texto ≥7:1 y regla `prefers-reduced-motion` en `packages/ui/src/tokens.css`.
- [x] T020 Alinear requisitos, comandos (`pnpm dev` incluido), puertos, servicios locales y resultado esperado en `README.md` y `specs/001-plataforma-entrega/quickstart.md`; documentar ramas `feature/spec-1`, `feature/spec-2`, `feature/spec-3`, `feature/spec-5`, ownership de carpetas, política de PR/rebase e integración serializada de configuración/lockfile/contratos en `docs/contributing/parallel-work.md`.

**Checkpoint local**: completar T001–T020; hacer una prueba de clonación limpia, `pnpm install --frozen-lockfile`, Compose, `pnpm db:migrate`, `pnpm dev` (web, API y worker simultáneos), abrir la página web, comprobar `GET /health`, lint, typecheck, pruebas y build. Esto deja una base local reproducible, pero no autoriza todavía a crear ramas de módulos desde `main` ni integrar el Spec #1.

---

## Fase 3: User Story 1 — Integrar un cambio con controles automáticos (P1)

**Goal**: cada commit/PR recibe resultados visibles y los controles fallidos bloquean la integración.
**Independent Test**: PR válido pasa; mensaje inválido, commit intermedio roto, cobertura bajo umbral o fixture de secreto/vulnerabilidad producen check fallido con causa visible. Confirmar en GitHub que no se puede integrar sin aprobación y checks verdes.
**Dependencias**: Fases 1–2. SonarQube y protección remota requieren configuración externa; checks base se desarrollan localmente.

- [x] T021 [P] [US1] Añadir pruebas de configuración que validen `tipo` según Conventional Commits, `alcance` obligatorio según config commitlint (con excepciones explícitas de merge/revert), descripción no vacía y un cambio lógico por commit en `scripts/ci/commitlint-config.spec.ts`.
- [x] T022 [P] [US1] Añadir pruebas de workflow para comprobar checks requeridos, triggers y ausencia de permisos de deploy en PR en `scripts/ci/workflow-policy.spec.ts`.
- [x] T023 [US1] Configurar Conventional Commits, `commitlint` y hook `commit-msg` de Husky en `commitlint.config.cjs`, `.husky/commit-msg` y `package.json`.
- [x] T024 [P] [US1] Configurar `lint-staged` y hook `pre-commit` de Husky en `.lintstagedrc.json`, `.husky/pre-commit` y `package.json` para validar solo archivos preparados.
- [x] T025 [US1] Crear workflow de PR con lockfile inmutable, permisos mínimos, `pull_request`, concurrencia y acciones fijadas por SHA en `.github/workflows/ci.yml`.
- [x] T026 [US1] Añadir jobs de lint, typecheck, tests unitarios, builds de apps y de imágenes Docker (`apps/api/Dockerfile`, `apps/worker/Dockerfile`) filtrados por el grafo afectado de pnpm/Turbo en `.github/workflows/ci.yml`.
- [x] T027 [US1] Validar cada commit del rango (`head.sha`, `base.sha`) del PR, ejecutar checks de los módulos afectados, reportar estados `queued`, `in_progress`, `success`, `failure` o `cancelled` y duración por job, y cumplir objetivo <15 minutos para hasta 10 commits en `scripts/ci/validate-commit-range.ts` y `.github/workflows/ci.yml`. Evidencia del baseline en el run `44004176940`. El run `43795457725` validó 10 commits en 263 323 ms.
- [x] T028 [P] [US1] Configurar pruebas de integración Testcontainers con Postgres, Redis y RabbitMQ reales; probar conexión, migraciones desde base vacía y validación de orden/prefijos únicos de migraciones en `apps/api/test/integration/`, `apps/api/test/migrations/` y `apps/worker/test/integration/`.
- [x] T029 [US1] Añadir escaneos bloqueantes de dependencias con vulnerabilidad alta o crítica (OSV/npm audit), secretos detectados (gitleaks) y análisis estático (CodeQL); ejecutar Trivy sobre las imágenes construidas por T026 en el mismo check requerido antes del merge y fallar ante hallazgos altos o críticos en `.github/workflows/security.yml` y `.github/workflows/ci.yml`. En `44004176940` aprobaron los escaneos y se retuvo el artefacto verificado por 30 días.
- [x] T030 [US1] Generar LCOV por workspace y configurar SonarQube para código nuevo con cobertura ≥80% (≥95% en `promociones`, `pedidos`, `pagos`), 0 bugs nuevos, 0 vulnerabilidades nuevas, 100% security hotspots revisados, duplicación <3% y ratings A; resultado `not-computed` no es aprobación en `sonar-project.properties` y `.github/workflows/ci.yml`. `pnpm coverage` genera seis reportes de workspaces y `pnpm test:ci:coverage` genera `coverage/scripts/lcov.info`; el agregado local es 913/1129 líneas (80,87%). El Quality Gate nuevo de Sonar se valida en T031 y no se infiere a partir de esta suma local.
- [ ] T031 [US1] Verificar en PR real que un Quality Gate fallido de SonarQube monorepo aparece como check requerido y bloquea el merge; si el check nativo no funciona, configurar agregación/proyectos separados sin reducir umbrales en `docs/ci/sonarqube-monorepo.md` y `.github/workflows/ci.yml`. **Parcial**. Fallo por cobertura observado en `43975115316` antes de activar protección. `44004176940` aprobó y GitHub exige `quality`, que incorpora el gate. Falta observar el bloqueo de merge con un fallo del gate bajo la regla activa.
- [x] T032 [US1] Configurar Playwright + axe para el alcance del Spec #1: página inicial y contrato HTTP `/health` en preview, comprobaciones de teclado/foco/contraste/movimiento reducido; dejar extensiones para registro, carrito y checkout a los specs que implementen esos flujos, sin marcarlos como aprobados en esta fase, en `apps/web/e2e/`, `playwright.config.ts` y `.github/workflows/ci.yml`.
- [ ] T033 [US1] Activar reglas remotas de `main`: PR obligatorio, una aprobación, checks requeridos, sin push directo e historial lineal; documentar nombres estables de checks en `docs/contributing/branch-protection.md`. **Parcial**. El propietario confirmó la activación. La API verificó `protected: true`, enforcement `everyone` y seis contextos requeridos. Faltan evidencia administrativa de aprobación mínima, historial lineal, restricciones de push y verificación de su aplicación.
- [ ] T034 [US1] Validar respuestas visibles para PR válido, commit inválido/intermedio roto, test fallido, cobertura insuficiente, secreto detectado y vulnerabilidad alta/crítica de dependencia o imagen en `docs/ci/acceptance.md`. Evidencia positiva en `44004176940` y fallo real de cobertura en `43975115316`. Las demás pruebas negativas remotas siguen pendientes.

**Evidencia de US1 para el baseline**. El run [`44004176940`](https://github.com/magomez36/cafeteria_Arquitectura-de-Software/actions/runs/44004176940) aprobó en `341cc4a` con 28/28 commits validados en 737 744 ms, políticas 67/67, lint, typecheck, unitarios, integraciones API/worker, health, build y Playwright/axe 4/4. Sonar importó siete LCOV y calculó `PASSED` con 81,5% de cobertura nueva, ratings A, duplicación 2,1%, hotspots revisados 100% y sin bugs ni vulnerabilidades abiertas. También aprobaron CodeQL, auditoría, Gitleaks, imágenes/Trivy y `pr-report`. Los seis checks requeridos de `main` están registrados en `docs/contributing/branch-protection.md`. Validar el SHA del cierre documental por separado.

**Checkpoint**: FR-001–FR-009 quedan cubiertos y los checks obligatorios pasan/bloquean en GitHub; `<15 min` para PR típico; la cobertura vacía/documentación no produce un `Not Computed` presentado como aprobación.

---

## Fase 4: User Story 2 — Ver el cambio desplegado antes y después de integrarlo (P1)

**Goal**: publicar preview por PR, promover cada merge a staging y alertar/fallar sin perder la versión sana previa.
**Independent Test**: PR aprobado por US1 muestra enlace preview con E2E/axe; merge despliega artefactos identificados por SHA en staging y pasa smoke; un fallo conserva la versión anterior y notifica.
**Dependencias**: US1 y configuración externa de Vercel/Render/GHCR. Preview de backend puede usar staging compartido si Render no tiene Preview Environments.

- [x] T035 [P] [US2] Añadir pruebas de contrato para validar que el despliegue registra entorno, SHA, artefacto, estado, fechas y rollback relacionado; el artefacto debe ser digest/prebuilt inmutable, no se reconstruye al promover y la versión previa se conserva en `scripts/deploy/deployment-contract.spec.ts`.
- [x] T036 [US2] Añadir smoke tests de página web y `/health` en `apps/web/e2e/staging-smoke.spec.ts` y `apps/api/test/staging-smoke.spec.ts`.
- [ ] T037 [US2] Configurar build Vercel prebuilt para `apps/web` sin deploy Git automático y con separación de variables preview/staging/prod en `vercel.json` y `.github/workflows/deploy-preview.yml`. **Externo**: proyecto, token y variables Vercel.
- [ ] T038 [US2] Configurar workflow para publicar en GHCR por SHA/digest las imágenes ya construidas y escaneadas por CI, sin exponer credenciales a PRs, en `.github/workflows/publish-images.yml`.
- [ ] T039 [US2] Definir `render.yaml` para API, worker, Postgres/backup/réplica, Key Value y RabbitMQ privado; servicios de datos/cola/workers solo son accesibles desde la red privada; configurar `autoDeployTrigger: off`, `preDeployCommand: pnpm db:migrate`, healthcheck `/health` y región común con Vercel. **Externo**: cuenta, región, plan y decisión Render RabbitMQ/CloudAMQP.
- [ ] T040 [US2] Configurar despliegue preview de API o fallback al backend staging compartido y enlazar las URLs de preview al PR en `.github/workflows/deploy-preview.yml` y `docs/deploy/preview.md`. **Externo**: plan Render permite entornos de preview; no usar secrets de producción.
- [ ] T041 [US2] Configurar promoción automática a staging por merge de `main`, predeploy compatible, deploy del digest/prebuilt ya validado y datos anonimizados/de prueba en `.github/workflows/deploy-staging.yml` y `render.yaml`. **Externo**: secrets GitHub Environment, Vercel, Render y GHCR.
- [ ] T042 [US2] Configurar smoke tests post-deploy y manejo de fallo que preserve staging sano, falle el job y notifique al equipo en `.github/workflows/deploy-staging.yml` y `apps/web/e2e/staging-smoke.spec.ts`.
- [ ] T043 [US2] Comprobar que auto deploy Git de Vercel/Render está desactivado y que solo el workflow autorizado despliega; registrar prueba de acceso/URL en `docs/deploy/provider-setup.md`. **Externo**: settings de las cuentas.
- [ ] T044 [US2] Medir merge-to-staging y confirmar objetivo <20 minutos (SC-004), preview link y datos del entorno correctos en `docs/deploy/acceptance.md`.

**Checkpoint**: FR-010–FR-013 quedan verificados; cualquier integrante revisa un preview, staging refleja `main` y solo el pipeline despliega.

---

## Fase 5: User Story 3 — Publicar en producción con aprobación y rollback automático (P2)

**Goal**: liberar versiones etiquetadas bajo autorización, primero backend y luego frontend, y revertir automáticamente ante smoke fallido.
**Independent Test**: release sin aprobación no despliega; release aprobado promueve backend antes de frontend sin reconstruir; migración fallida cancela; smoke fallido revierte ambos y avisa en menos de cinco minutos.
**Dependencias**: staging estable (US2), secrets por environment, Render/Vercel/GHCR operativos y autorización de release.

- [x] T045 [P] [US3] Añadir pruebas de workflow para aprobación requerida, despliegue serializado, orden API→web y rollback enlazado al despliegue previo en `scripts/deploy/production-release.spec.ts`. Verificado localmente: `pnpm test:ci` (39/39); prueba política válida y rechaza ausencia de aprobación, concurrencia, cancelación, orden API/worker→web y rollback no relacionado. El ensayo real de release permanece separado y requiere entorno de producción autorizado (T051).
- [x] T046 [US3] Configurar release-please para versionado semántico, changelog y etiqueta derivada de Conventional Commits en `.github/workflows/release-please.yml`, `release-please-config.json` y `.release-please-manifest.json`.
- [ ] T047 [US3] Crear GitHub Environment `production` con aprobadores requeridos y secrets aislados, documentando nombres sin valores en `docs/deploy/production-environment.md`. **Externo**: owner/admin del repo y plan GitHub compatible.
- [ ] T048 [US3] Crear workflow serializado de release que exija tag/Environment aprobado, ejecute predeploy/migraciones y despliegue API y worker antes de frontend desde artefactos validados en `.github/workflows/release-production.yml`. **Externo**: API tokens/Environments de Render, Vercel y GHCR.
- [x] T049 [US3] Añadir pruebas del predeploy que simulen error de migración y confirmen que la versión anterior sigue activa en `apps/api/test/deploy-migration.e2e-spec.ts` y `scripts/deploy/production-release.spec.ts`. Verificado localmente con PostgreSQL 17 desechable y un fallo SQL real. La transacción revirtió el cambio parcial y conservó el esquema, la fila previa y HTTP 200 de la API anterior. La prueba de orquestación confirmó que no se activó ningún servicio tras el error de predeploy. El ensayo con proveedores sigue en T051.
- [ ] T050 [US3] Automatizar smoke post-release, rollback de Render y Vercel a artefactos previos y alerta con tiempos trazables en `.github/workflows/release-production.yml` y `docs/deploy/rollback-runbook.md`.
- [ ] T051 [US3] Antes de habilitar release, verificar manualmente con NVDA o VoiceOver los flujos críticos de la interfaz y guardar evidencia; ejecutar ensayo de release autorizado/rollback, verificar cero downtime visible (SC-006), aprobación humana, versión/tag/changelog y recuperación <5 min (SC-005) en `docs/deploy/production-acceptance.md` y `docs/accessibility/acceptance.md`.

**Checkpoint**: FR-014–FR-019 cubiertos; producción solo procede con aprobación, artefactos idénticos, secretos específicos y rollback probado.

---

## Fase 6: User Story 4 — Revertir cualquier cambio de forma segura (P2)

**Goal**: hacer que un `git revert` pase CI y llegue a staging sin deshacer destructivamente datos ni activar funciones incompletas.
**Independent Test**: revertir una selección de commit de `main`, incluidos cambios con migración aplicada; comprobar staging y estado de datos; apagar una feature flag sin nuevo deploy.
**Dependencias**: CI y staging (US1–US2), despliegue de schema/migraciones y configuración de flags.

- [x] T052 [P] [US4] Añadir pruebas de integración que verifiquen migraciones expand/contract compatibles con versión anterior en `apps/api/test/migrations/expand-contract.int-spec.ts`.
- [x] T053 [US4] Escribir primero pruebas de feature flags (ausente/default-off, true/false, Redis caído, cambio en runtime, allowlist de flags de UI y rechazo de escritura pública) y después implementar `FeatureFlagReader`, provider node-redis y enforcement server-side en `packages/feature-flags/src/`, endpoint read-only en `apps/api/src/platform/feature-flags/` y CLI de operación privada en `apps/api/src/ops/set-feature-flag.ts`; no implementar flags de negocio.
- [x] T054 [US4] Documentar commits atómicos, `git revert`, fixup/autosquash y guía de migración compensatoria en `docs/contributing/revert-and-migrations.md`.
- [ ] T055 [US4] Configurar prueba programada de reversión de commit no destructiva a staging y confirmar que recorre required checks antes de integrar en `.github/workflows/revert-drill.yml`.
- [ ] T056 [US4] Ejecutar simulacro de reversión con commit funcional y migración ya aplicada; verificar 100% de despliegues elegidos sin intervención extra (SC-007) y registrar evidencia en `docs/deploy/revert-drill.md`.

**Checkpoint**: FR-005 y garantías de reversibilidad de US4 cubiertas; ningún rollback de código intenta revertir destructivamente una migración aplicada.

---

## Fase 7: User Story 5 — Seguir la entrega y el aporte del equipo (P3)

**Goal**: exponer métricas confiables de equipo, calidad, pipeline y contribuciones con privacidad y sin rankings.
**Independent Test**: despliegue aparece en dashboards en menos de una hora; revisiones/tests/documentación son visibles; usuario no autorizado no accede al dashboard individual; alertas responden a escenarios controlados.
**Dependencias**: eventos CI/deploy y releases US1–US3, cuenta Grafana, fuentes GitHub/SonarQube y aprobación de política de privacidad.

- [x] T057 [P] [US5] Añadir pruebas de esquema para métricas con valor/unidad, fuente, frescura, periodo y `collectedAt`; sujeto permitido `equipo o persona autorizada`, dato individual solo con aviso y ACL, sin rankings, y sin inferir calidad individual por conteos de commits en `packages/contracts/src/telemetry.schema.spec.ts`.
- [ ] T058 [US5] Emitir métricas de duración, resultado, SHA y despliegue desde GitHub Actions con reintento/retención si Grafana no está disponible en `.github/workflows/telemetry.yml` y `scripts/telemetry/publish.ts`.
- [ ] T059 [US5] Configurar Grafana Cloud y fuentes de GitHub, pipeline y SonarQube con credenciales de mínimo alcance en `infra/grafana/datasources.yaml` y `docs/observability/setup.md`. **Externo**: cuenta Grafana, GitHub App/token y SonarQube API.
- [x] T060 [US5] Crear dashboards de DORA, flujo de PR, calidad y salud del pipeline en `infra/grafana/dashboards/delivery.json`, `workflow.json`, `quality.json` y `pipeline-health.json`.
- [x] T061 [US5] Crear dashboard de aporte que incluya cambios integrados, revisiones, tests y documentación, agregado por equipo y sin orden/ranking individual en `infra/grafana/dashboards/team-contribution.json`.
- [ ] T062 [US5] Configurar roles/ACL, aviso de recolección y retención para el dashboard individual en `infra/grafana/access.yaml` y `docs/privacy/team-metrics.md`. **Externo**: roles del workspace Grafana y comunicación al equipo.
- [x] T063 [US5] Configurar alertas para `main` rojo, descenso de Quality Gate y aumento de change failure rate en `infra/grafana/alerts/delivery.yaml`.
- [ ] T064 [US5] Crear escenario k6 de carga contra staging y programarlo nightly y antes de temporadas de festividades en `tests/load/staging.js` y `.github/workflows/load-staging.yml`. **Externo**: runner de CI, credenciales/URL staging; nunca producción.
- [ ] T065 [US5] Verificar reflexión de cada despliegue en menos de una hora (SC-008), permisos/privacidad, alertas y visibilidad equilibrada de contribuciones en `docs/observability/acceptance.md`.

**Checkpoint**: FR-020–FR-024 cubiertos; fuentes, dashboards, alertas, retención y permisos respetan la política de datos del equipo.

---

## Fase 8: Polish y aceptación transversal

**Propósito**: validar el flujo mínimo completo de Fase 0 y cerrar brechas entre spec y plataforma implementada.

- [x] T066 [P] Actualizar guía de instalación y comandos probados, incluyendo Docker, Node/pnpm y troubleshooting multiplataforma en `README.md`.
- [ ] T067 [P] Revisar accesibilidad AAA del sitio mínimo con axe sin violaciones, teclado, foco visible, contraste ≥7:1 y movimiento reducido; verificar manualmente con NVDA o VoiceOver cada interfaz/flujo crítico antes de cada release y documentar dispositivo, páginas y hallazgos en `apps/web/e2e/accessibility.spec.ts` y `docs/accessibility/acceptance.md`.
- [ ] T068 Ejecutar escenario de extremo a extremo de quickstart: commit/PR → checks → preview → merge → staging → dashboards; registrar tiempos SC-001/004/009 en `specs/001-plataforma-entrega/quickstart.md`.
- [x] T069 Revisar FR-001–FR-024 y SC-001–SC-009 contra contratos, workflows, documentación y verificaciones; registrar brechas remanentes en `docs/ci/spec-001-gap-review.md`.

**Criterio final de aceptación**: cambio mínimo de página y health endpoint atraviesa controles, preview, staging y panel de entrega; rollback y producción con aprobación están ensayados; métricas personales protegidas. Esto no implica que se haya publicado a producción.

---

## Dependencias y orden de ejecución

### Grafo de fases

```text
Fase 1 Setup
  └── Fase 2 Foundational (GATE: desbloquea al equipo)
        └── Fase 3 US1 CI / Quality Gate
              └── Fase 4 US2 Preview / Staging
                    ├──> Fase 5 US3 Producción ──> Fase 7 US5 Métricas completas
                    └──> Fase 6 US4 Reversibilidad
                          └── Fase 8 aceptación (también requiere US3 y US5)
```

- Fase 1 no depende de servicios externos. T003–T005 pueden paralelizarse tras T001–T002.
- Fase 2 bloquea las historias de plataforma; T014 depende de T013 y T004, mientras T009/T010/T011 pueden avanzar en sus rutas separadas. El checkpoint local exige todas las tareas T001–T020.
- US2 depende de los checks requeridos US1 para habilitar preview por PR. Preparación de proveedor/render config puede paralelizarse con US1 en archivos separados, pero preview no se habilita hasta pasar US1.
- US3 depende de artefactos y staging US2; US4 depende de CI y staging (US1–US2), pero no de release productivo; US5 puede preparar fuentes/dashboards antes, y su aceptación DORA completa depende de releases US3 y de cuenta Grafana.
- Producción y observabilidad no son prerequisites para que compañeros clonen, ejecuten y empiecen trabajo.

### Oportunidades de paralelismo

- Tras T001–T002: T003, T004 y T005 usan carpetas distintas.
- En Fase 2: servicios Compose, módulos Nest, ADR y documentación de inventarios/tokens pueden repartirse por archivos separados; ruta de health depende de T004.
- Tras Fase 2: el líder completa US1 y propone PR de baseline a `main`. Después de integrar T001–T034 con una aprobación y checks verdes, los integrantes parten de `main` para Specs #2/#3/#5; mientras tanto puede prepararse US2 en archivos de proveedor. Los cambios a workflows deben coordinarse si coinciden en `.github/workflows/`.
- US3, US4 y US5 pueden repartirse después de que US2 estabilice staging; Grafana no debe bloquear release/rollback.

## Paralelismo: ejemplo US1

```text
T021 commitlint config tests  || T022 workflow policy tests
T023 commit hooks             || T024 lint-staged hook
T028 Testcontainers setup      || T029 security workflow
```

Las tareas de pruebas no se integran antes de que exista su configuración base y deben correrse en CI al completar la historia.

## Estrategia de implementación

### Hito mínimo de colaboración

1. Completar Fase 1 y Fase 2 (T001–T020).
2. Verificar clonación limpia, `pnpm install --frozen-lockfile`, Compose, `pnpm db:migrate`, `pnpm dev` simultáneo, página inicial, `GET /health`, pruebas, lint, typecheck y build.
3. Completar después US1 (T021–T034) e integrar el PR aprobado de la plataforma a `main`.
4. Tras el merge de T001–T034, crear/actualizar `feature/spec-2`, `feature/spec-3` y `feature/spec-5` desde ese baseline; no esperar Vercel, Render ni Grafana. SonarQube y protección de rama sí son dependencias del primer merge por constitución.

### Primera versión funcional integrable en `main`

Completar T001–T034 (Setup, base y US1): monorepo instalable, página inicial/API health/worker, dependencias locales, guías, hooks Conventional Commits, pruebas, workflow CI requerido, seguridad y Quality Gate de SonarQube realmente bloqueante; branch protection con al menos una revisión. La integración ocurre solo por PR con aprobación y todos los checks en verde. Para cumplir SC-009 de Fase 0 al completo, además hacen falta T035–T044 (preview y staging) y T057–T060/T065 (al menos telemetría y dashboard de entrega); el mínimo del curso para iniciar colaboración no equivale al cierre total de Fase 0.

### Entrega completa incremental

Setup + Foundational → US1 → US2 → US3 → US4/US5 → aceptación transversal. Mantener pequeños PRs y commits Conventional, verdes, atómicos y reversibles; usar `git revert` después del rollback de despliegue cuando corresponda.
