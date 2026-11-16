# Punto de recuperación — Spec #1

**Fecha de corte:** 2026-11-16 (America/Guayaquil).
**Objetivo:** detener de forma segura el desarrollo integral del Spec #1 y poder retomarlo sin rehacer trabajo.
**Estado SDD:** planificación y tareas existentes conservadas; continuar con `$speckit-implement` sin regenerar especificaciones.

## 1. Objetivo y límites

Completar `specs/001-plataforma-entrega/` para establecer la plataforma de entrega continua de la cafetería: monorepo TypeScript con Next.js, NestJS y worker; CI, calidad y seguridad; previews, staging y releases; feature flags y migraciones reversibles; telemetría, Grafana y aceptación final. El trabajo permanece únicamente en `feature/spec-1` y PR #1 hacia `main` en Draft.

No fusionar a `main`, no desplegar producción, no crear ramas de Specs #2/#3/#5, no reducir controles y no configurar recursos con costo sin aprobación. Primero debe terminarse y aceptarse el Spec #1; luego se habilitará el trabajo de los compañeros desde `main`.

## 2. Estado exacto de Git y GitHub al corte

- Rama local: `feature/spec-1`.
- HEAD local y `origin/feature/spec-1`: `53aadfa5707a0dd799629d5f77755ee5d0ea7060` (`fix(ci): skip images for documentation changes`). No hay commits locales sin publicar.
- PR [#1](https://github.com/magomez36/cafeteria_Arquitectura-de-Software/pull/1): abierto, Draft, base `main`, sin merge; la punta remota coincide con HEAD.
- Cambio rastreado **solo local y sin commit** al corte: `specs/001-plataforma-entrega/tasks.md`, tres líneas actualizadas: evidencia más reciente para T027/T029 y T045 marcada completa con `pnpm test:ci` 39/39.
- `git diff --stat`: 1 archivo, 3 inserciones, 3 eliminaciones. `git diff --check`: limpio (solo advertencias de conversión LF/CRLF).
- Cambios publicados recientes: `976c914` (evidencia local de accesibilidad), `3708de2` (plantillas de datasource Grafana), `bdbbba6` (validación del endpoint OTLP), `f8738a6` (exportador OTLP con reintentos/retención), `020fe13` (espera/reintento acotado para arranque PostgreSQL) y `53aadfa` (evitar que cambios documentales inicien el build de imágenes sin archivo de imagen).
- El cambio local T045 y este checkpoint no están publicados. La copia recuperable de la modificación está en `docs/progress/recovery-2026-11-16/` (ver sección 9).

### GitHub Actions

- Run `43812334596` (PR CI, SHA `53aadfa...`): **completed, overall failure**. Commit range validó 22/22 commits en 677,757 ms (11m17s), todos `success`; quality duró 807,000 ms y falló solo en `Require SonarQube project and credentials`, al faltar `SONAR_TOKEN`/variables. CodeQL, secret scan, dependency audit e imágenes (incl. Trivy y artefacto) pasaron; `pr-report` falló correctamente porque quality falló. Preview `43812334562` quedó `skipped` por PR Draft.
- Run `43812334562` (Preview deployment): `skipped`, conforme a la condición Draft del PR.
- Evidencia anterior, run `43810143343` (SHA `020fe13...`): validó 21/21 commits en 409,993 ms; lint, typecheck, tests, integraciones, health, build, Playwright/axe, security y Trivy/imágenes pasaron. `quality` y `pr-report` fallaron por falta de configuración de Sonar (`SONAR_TOKEN` y variables del proyecto). No se ha demostrado aún una ejecución exitosa de Sonar.
- No hay `gh` CLI instalado. La conexión GitHub disponible es de lectura y no ofrece cancelación de workflows ni administración de branch rules; el run activo no se pudo cancelar desde esta sesión.

## 3. Progreso total

Estado real de aceptación: **44 completas (63.8%), 17 parciales y 8 pendientes, de 69**. El porcentaje verificable es 44/69; las tareas parciales no se cuentan como completadas. En el archivo local T045 está marcada `x`; en la punta remota publicada sigue pendiente hasta publicar ese cambio.

En esta continuación se corrigió y publicó el predicado de `images` para que solo corra cuando API o worker cambian, se añadió una prueba de política para esa regla, y se actualizó evidencia de T027/T029 y documentos de CI/observabilidad. Además, T045 se comprobó localmente dentro de `pnpm test:ci` (39/39) y se marcó localmente; falta publicar esa actualización. No se iniciaron tareas nuevas después de la instrucción de pausa.

## 4. Tabla de las 69 tareas

`Completa` equivale a aceptación local/remota disponible. `Parcial` indica código/documentación presente, pero falta evidencia externa o una parte obligatoria. `Pendiente` indica que el componente principal aún no existe o no se ejecutó.

| ID   | Estado real           | Evidencia / falta principal                                                                                                    |
| ---- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| T001 | Completa              | Workspace y versiones fijadas.                                                                                                 |
| T002 | Completa              | Grafo y caché Turbo.                                                                                                           |
| T003 | Completa              | Next.js App Router, TypeScript, página inicial y scripts.                                                                      |
| T004 | Completa              | NestJS, módulos, health, scripts e imagen.                                                                                     |
| T005 | Completa              | Worker Node/TypeScript e imagen.                                                                                               |
| T006 | Completa              | Paquetes compartidos, contratos y flags base.                                                                                  |
| T007 | Completa              | TypeScript estricto, ESLint y Prettier.                                                                                        |
| T008 | Completa              | README de instalación multiplataforma.                                                                                         |
| T009 | Completa              | Compose con Postgres, Redis, RabbitMQ y Mailpit.                                                                               |
| T010 | Completa              | `.env.example` seguro y exclusiones Git.                                                                                       |
| T011 | Completa              | Módulos Nest vacíos y límites previstos.                                                                                       |
| T012 | Completa              | Boundaries, rutas e imports públicos.                                                                                          |
| T013 | Completa              | Pruebas previas de health.                                                                                                     |
| T014 | Completa              | `GET /health`.                                                                                                                 |
| T015 | Completa              | Configuración E2E health.                                                                                                      |
| T016 | Completa              | Lockfile, scripts coordinados y migraciones node-pg-migrate.                                                                   |
| T017 | Completa              | ADR stack/monorepo.                                                                                                            |
| T018 | Completa              | Threat model e inventario de datos.                                                                                            |
| T019 | Completa              | Tokens AAA y reduced motion.                                                                                                   |
| T020 | Completa              | README, quickstart y reglas de colaboración.                                                                                   |
| T021 | Completa              | Pruebas commitlint/Conventional Commits.                                                                                       |
| T022 | Completa              | Pruebas de política CI.                                                                                                        |
| T023 | Completa              | Commitlint y hook commit-msg.                                                                                                  |
| T024 | Completa              | Husky/lint-staged.                                                                                                             |
| T025 | Completa              | Workflow de PR con SHA pins, permisos mínimos y concurrencia.                                                                  |
| T026 | Completa              | CI por workspace y builds de imágenes.                                                                                         |
| T027 | Completa              | Run `43812334596` validó 22/22 commits en 677,757 ms; quality falla después por Sonar faltante.                                |
| T028 | Completa              | Testcontainers Postgres/Redis/RabbitMQ y migraciones.                                                                          |
| T029 | Completa              | Audit, Gitleaks, CodeQL y Trivy pasaron, incluido run `43812334596`.                                                           |
| T030 | Completa              | LCOV y configuración de Quality Gate fail-closed; Sonar real queda en T031.                                                    |
| T031 | Parcial               | Workflow falla cerrado; falta Sonar project/token/binding y gate real publicado como check de PR.                              |
| T032 | Completa              | Playwright + axe; alcance home/health; local 4/4.                                                                              |
| T033 | Parcial               | `docs/contributing/branch-protection.md` especifica reglas; no se pudieron activar/verificar sin permisos admin.               |
| T034 | Parcial               | Matriz/procedimiento documentados; faltan PRs desechables para observar escenarios negativos en GitHub/Sonar.                  |
| T035 | Completa              | Contrato de despliegue y pruebas de artefacto inmutable/rollback.                                                              |
| T036 | Completa              | Smoke tests locales web y health.                                                                                              |
| T037 | Parcial               | `apps/web/vercel.json` y workflow prebuilt preparados; falta proyecto/token/variables y preview real.                          |
| T038 | Parcial               | Workflow GHCR configurado con imágenes verificadas por SHA/digest; falta ejecutar publicación post-merge real.                 |
| T039 | Pendiente             | Falta `render.yaml`; bloqueado por región, planes, Postgres/backup/réplica, Redis y decisión RabbitMQ/CloudAMQP.               |
| T040 | Parcial               | Preview Vercel y fallback a API staging parametrizados; no hay endpoint/proyecto/preview real.                                 |
| T041 | Pendiente             | No existe workflow de despliegue a staging; depende de digest web/API, Render/Vercel y secrets.                                |
| T042 | Parcial               | Smoke suites existen localmente; no existe despliegue staging ni prueba de preservación/alerta postdeploy.                     |
| T043 | Parcial               | Auto deploy deshabilitado en config Vercel deseada y documentado; no verificado en cuentas y falta Render.                     |
| T044 | Pendiente             | Sin merge-to-staging real no se puede medir SC-004 (<20 min).                                                                  |
| T045 | Completa (solo local) | `production-release.spec.ts`, policy válida y casos de rechazo; `pnpm test:ci` 39/39. Cambio no publicado.                     |
| T046 | Completa              | release-please, semver/changelog PR; no implica release real.                                                                  |
| T047 | Parcial               | Pasos y nombres de secrets documentados; falta Environment `production` y aprobación admin/plan.                               |
| T048 | Pendiente             | Falta workflow `release-production.yml`; requiere endpoints/tokens y artefactos validados.                                     |
| T049 | Pendiente             | Falta escenario E2E de error de migración y preservación de versión activa.                                                    |
| T050 | Parcial               | Runbook de rollback presente; falta automatización postrelease y evidencia real.                                               |
| T051 | Parcial               | Checklist manual NVDA/VoiceOver y release documentados; falta lector, entorno y ensayo autorizado.                             |
| T052 | Completa              | Migraciones expand/contract compatibles probadas con integración.                                                              |
| T053 | Completa              | Feature flags Redis, default-off, allowlist, runtime y escritura privada probados.                                             |
| T054 | Completa              | Guía revert y migraciones compensatorias.                                                                                      |
| T055 | Parcial               | `docs/deploy/revert-drill.md` define el procedimiento; falta workflow programado/manual contra staging.                        |
| T056 | Pendiente             | No se ejecutó simulacro staging de commit+migración/revert.                                                                    |
| T057 | Completa              | Contrato telemetría y privacidad probado.                                                                                      |
| T058 | Parcial               | Workflow OTLP, retries, spool y retención implementados/probados localmente; falta run real de default branch/ingesta Grafana. |
| T059 | Parcial               | Datasource YAML de plantilla, tests y guía; falta Grafana Cloud, fuentes, credenciales y Save & test.                          |
| T060 | Completa              | Dashboards JSON locales, sin datasource real.                                                                                  |
| T061 | Completa              | Dashboard de equipo agregado sin ranking individual.                                                                           |
| T062 | Parcial               | Desired-state de acceso y guía privacidad; faltan ACL del workspace y aviso al equipo.                                         |
| T063 | Completa              | Alertas declarativas locales; falta activación remota cubierta por T059/T065.                                                  |
| T064 | Parcial               | k6 y workflow nightly/dispatch + guardia HTTPS/staging implementados; faltan URLs/runner y ejecución real.                     |
| T065 | Pendiente             | Sin Grafana/deployment no se puede verificar SC-008, alertas, permisos o latencia <1 h.                                        |
| T066 | Completa              | README y quickstart actualizados con comandos.                                                                                 |
| T067 | Parcial               | Axe y Playwright 4/4; NVDA no está instalado y VoiceOver no está disponible en Windows.                                        |
| T068 | Pendiente             | Escenario completo requiere PR no Draft, preview, merge a main, staging y Grafana.                                             |
| T069 | Completa              | Gap review FR-001–FR-024 / SC-001–SC-009, con brechas identificadas.                                                           |

## 5. Progreso por historia

| Historia          | Completas | Parciales | Pendientes | Funciona / falta                                                                                                                             |
| ----------------- | --------: | --------: | ---------: | -------------------------------------------------------------------------------------------------------------------------------------------- |
| US1 — T021–T034   |        11 |         3 |          0 | Conventional commits, CI, escaneos, LCOV config, Playwright/axe. Faltan Quality Gate real (Sonar), protección de `main` y negative test PRs. |
| US2 — T035–T044   |         2 |         5 |          3 | Contratos, smoke, Vercel preview/GHCR config parcial. Faltan Blueprint Render, workflow staging, smoke postdeploy real y tiempo SC-004.      |
| US3 — T045–T051   |         2 |         3 |          2 | Tests de política de release y release-please. Falta ambiente/approval real, workflow serializado, prueba de migración y rollback y NVDA.    |
| US4 — T052–T056   |         3 |         1 |          1 | Feature flags y migraciones compatibles funcionan; falta workflow y simulacro de revert en staging.                                          |
| US5 — T057–T065   |         4 |         4 |          1 | Dashboards/alertas/telemetría/k6 configurados localmente; Grafana, ACL, staging, ingestión y latencia reales pendientes.                     |
| Final — T066–T069 |         2 |         1 |          1 | Docs/gap review y axe pasan; falta screen reader manual y quickstart real tras merge.                                                        |

## 6. Componentes clave implementados

- **Monorepo:** `apps/web` Next.js; `apps/api` NestJS; `apps/worker`; pnpm/Turborepo y `packages/{contracts,feature-flags,ui,eslint-config,tsconfig}`.
- **Servicios y persistencia local:** `infra/compose.yaml`; Postgres, Redis, RabbitMQ, Mailpit; `node-pg-migrate`, ledger y advisory lock.
- **Calidad/CI:** `.github/workflows/ci.yml`, `security.yml`, acciones fijadas por SHA, commit range, lint/typecheck/tests/build/Playwright/axe/LCOV/Sonar fail-closed, image scans/retención y `pr-report`; commitlint/Husky/lint-staged; `scripts/ci/*` y pruebas de políticas.
- **Despliegue/release:** `.github/workflows/deploy-preview.yml`, `publish-images.yml`, `release-please.yml`; `apps/web/vercel.json`; contratos y policy tests en `scripts/deploy/`; docs `docs/deploy/*`. No existen `render.yaml`, `deploy-staging.yml` ni `release-production.yml` al corte.
- **Flags y migraciones:** `packages/feature-flags`, endpoint de lectura pública restringido y CLI privada; integración expand/contract.
- **Observabilidad:** `.github/workflows/telemetry.yml`, `.github/workflows/load-staging.yml`, `scripts/telemetry/*`, `scripts/load/*`, `tests/load/staging.js`, `infra/grafana/{datasources.yaml,access.yaml,dashboards/,alerts/}`.
- **Accesibilidad/documentación:** `apps/web/e2e/*`, `docs/accessibility/acceptance.md`, `docs/ci/{acceptance.md,sonarqube-monorepo.md}`, `docs/observability/*`, `docs/contributing/branch-protection.md`, `docs/ci/spec-001-gap-review.md`.

## 7. Últimos resultados de pruebas

Resultados comprobables tras el fix de CI previo a esta pausa:

- `pnpm test:ci`: 39/39 (incluye commit policy, workflow policy, release policy, telemetría y load target guard).
- `pnpm lint`: pasó en 6 workspaces.
- `pnpm typecheck`: pasó en 6 workspaces.
- `pnpm test`: pasó; unitarias, 4 suites/5 tests API integration, 1 test worker integration, 2 API E2E.
- `pnpm build`: pasó en 6 workspaces; Next.js emitió advertencia de plugin ESLint no detectado, sin fallo.
- Playwright web: 4/4 local, axe sin violaciones y checks de contraste/reduced motion/health.
- `git diff --check`: limpio antes de esta sesión y el último diff mostrado también limpio; repetir al reanudar por el nuevo checkpoint.
- GitHub run `43810143343`: todo local/CI, CodeQL/Gitleaks/dependency audit, build de imágenes y Trivy pasaron; Sonar no ejecutó por falta de credenciales, `quality` falló cerrado y `pr-report` propagó correctamente.
- GitHub run `43812334596`: finalizado; quality falló al exigir credenciales Sonar ausentes, `pr-report` propagó el fallo, y security e imágenes pasaron.
- SonarQube: **no aprobado/no ejecutado**; no hay `SONAR_TOKEN`, `SONAR_PROJECT_KEY`, `SONAR_ORGANIZATION` ni binding configurado.

No repetir suites extensas solo para generar este checkpoint. Al reanudar, ejecutar lint/typecheck/test/build tras los cambios nuevos; el run `43812334596` ya fue revisado.

## 8. Bloqueos y dependencias externas

### Requieren propietario/admin del repositorio

1. SonarQube Cloud: importar/bindear repo, establecer `main` como new-code reference, gate estricto de constitución, variables `SONAR_PROJECT_KEY`/`SONAR_ORGANIZATION`, secret `SONAR_TOKEN`; confirmar check real en PR.
2. Protección `main`: PR obligatorio, ≥1 aprobación, checks exactos `quality`, `security / codeql`, `security / dependency-audit`, `security / secret-scan`, `images`, `pr-report`, linear history y no force push. El GitHub App actual no tiene admin; `gh` CLI no está instalado.
3. Escenarios negativos CI: PR desechable con commit inválido/intermedio roto, test fallido, LCOV bajo, secreto sintético y fixture vulnerable; limpiar cada fixture y demostrar bloqueo. No usar `feature/spec-1` ni `main` para introducirlos.
4. GitHub Environments `preview`, `staging`, `production` y sus reviewers/secrets/variables aislados; no hay valores disponibles.

### Requieren crear/seleccionar servicios sin inventar costos

5. Vercel: proyecto web existente, org/project IDs, token de mínimo alcance, región, variables preview/staging/production y Git auto deployment apagado.
6. Render: workspace/region común con Vercel, aprobación de costo/planes para API/worker/Postgres/backups/réplica/Key Value, y decisión Render private RabbitMQ vs CloudAMQP. Luego service IDs/URLs, predeploy migrations, health `/health`, Git auto deploy off.
7. Grafana: cuenta/stack aprobados sin gasto no autorizado; OTLP endpoint/credencial, GitHub App de solo lectura, datasource Prometheus y Sonar, Save & test, dashboards/alertas y ACL/retención; comunicar métricas personales al equipo.
8. Para T067: NVDA en Windows (no está instalado) o VoiceOver en Apple.
9. T068 exige PR listo y merge posterior autorizado; no ocurre antes de terminar el Spec #1.

### Resolvable locally after restart

- Inspeccionar el resultado final del run y actualizar evidencia real.
- Completar pruebas y policy gates locales y workflows faltantes, especialmente T041/T048/T049/T055, sin ejecutar servicios remotos.
- Añadir contratos/scripts y documentación con nombres de secretos/variables sin sus valores.
- Actualizar `tasks.md` solo cuando cada criterio de aceptación tenga evidencia; no marcar checks remotos por configuración local.

## 9. Copia local recuperable

El directorio `docs/progress/recovery-2026-11-16/` conserva:

- `tasks.md`: copia íntegra de la versión local con T045 marcada completa.
- `tracked-changes.patch`: patch de las modificaciones rastreadas respecto a HEAD.
- `SPEC1_CHECKPOINT_2026-11-16.md`: copia de este punto de recuperación.

El checkpoint actual es el archivo solicitado, todavía local/no commit. No se copió ningún `.env`, credencial, dependencia ni salida de compilación. Mantener ambos originales y respaldo hasta revisar el commit siguiente.

## 10. Orden de continuación

1. Verificar que la rama sigue `feature/spec-1`, comprobar HEAD/status y no sobrescribir `tasks.md`, el checkpoint ni la copia de recuperación.
2. Leer este documento, la constitución, spec/plan/tasks/research/data-model/quickstart y contratos (sin regenerar ni tocar Specs ajenos).
3. Confirmar la ejecución cerrada `43812334596` y registrar que bloqueó solo por credenciales Sonar; no reintentar sin configurar el proyecto y sus secretos.
4. Validar que el fix `53aadfa` hizo skip de `images` para cambios documentales, y que `pr-report` refleja correctamente los jobs. Dejar PR #1 Draft.
5. Revisar/registrar T045 local; antes de hacer commit ejecutar `git diff --check` y validación de mensaje/hooks. Publicar solo si los checks locales pasan y los cambios forman un commit pequeño.
6. Resolver lo local posible de US2–US5 (T041, T048–T050, T055) con simulaciones no destructivas y tests; dejar servicios reales como pendientes hasta configuración manual.
7. No desplegar producción ni ejecutar prueba de staging/rollback hasta que el propietario haya aprobado recursos, entorno y costo.
8. Cerrar tasks/doc evidencias, ejecutar `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `git diff --check`; solo entonces commits atómicos y push a `feature/spec-1` (autorizados previamente).
9. Revaluar US1/US2 con credenciales/admin, ejecutar escenarios remotos; solo convertir PR a Ready cuando todos los checks obligatorios y aceptación estén listos. El merge es acción humana separada y no está autorizado.

## 11. Comandos al reanudar

Desde la raíz en PowerShell:

```powershell
git branch --show-current
git status --short
git rev-parse HEAD
git diff --stat
git diff --check
npm exec --yes --package=node@24 --package=pnpm@10.12.4 -- pnpm test:ci
npm exec --yes --package=node@24 --package=pnpm@10.12.4 -- pnpm lint
npm exec --yes --package=node@24 --package=pnpm@10.12.4 -- pnpm typecheck
npm exec --yes --package=node@24 --package=pnpm@10.12.4 -- pnpm test
npm exec --yes --package=node@24 --package=pnpm@10.12.4 -- pnpm build
```

## 12. Prompt listo para reanudar

> Retoma el Spec #1 desde `docs/progress/SPEC1_CHECKPOINT_2026-11-16.md`. Primero inspecciona rama, HEAD, status, diff y el estado final del run GitHub Actions `43812334596`; conserva intactos el checkpoint y `docs/progress/recovery-2026-11-16/`. No repitas tareas ya completadas ni regeneres specs. Sigue exclusivamente `feature/spec-1`, mantén PR #1 en Draft, continúa T027–T069 según tareas y evidencias, no trabajes Specs #2/#3/#5, no modifiques `main`, no despliegues producción ni incurras costos. Resuelve primero tareas locales independientes y documenta bloqueos externos; actualiza checkbox solo con evidencia completa. Antes de publicar, valida localmente y crea commits atómicos respetando hooks. La decisión sigue siendo terminar integralmente Spec #1 y preparar su aceptación/merge a `main`; solo después habilitar ramas de compañeros.

## 13. Actualización de continuación — 2026-11-16

### Estado preservado y nuevos cambios

- Rama `feature/spec-1`; HEAD local/remoto continúa en `53aadfa5707a0dd799629d5f77755ee5d0ea7060` al comenzar este bloque. PR #1 se volvió a consultar: abierto, Draft, sin merge, base `main`, punta `feature/spec-1` en `53aadfa`, mergeable según GitHub.
- El directorio `docs/progress/recovery-2026-11-16/` se conservó intacto.
- Commit local creado después de pasar las verificaciones locales: `437b02d test(platform): exercise runtime coverage`; contiene solo pruebas/configuración de cobertura y el runtime del worker. Los hooks Husky, ESLint y Prettier pasaron. **No está publicado** porque el PR remoto sigue bloqueado por credenciales Sonar conocidas y repetirlo no aportaría evidencia nueva.
- Cambios aún sin commit: `specs/001-plataforma-entrega/tasks.md` (evidencia actualizada de T027/T029/T030 y T045), `docs/ci/acceptance.md` (run remoto y resultados locales) y este checkpoint. El directorio de recuperación sigue intacto y excluido de staging. Al retomar, ejecutar `git status --short`; no hay push de los cambios de esta continuación.

### Verificaciones nuevas

- `pnpm coverage` terminó correctamente. LCOV por líneas: API 100% (25/25), worker 96,67% (29/30), web 100% (1/1), contratos 88,89% (16/18), feature flags 100% (19/19), UI 100% (1/1). La configuración de Vitest de contratos impide volver a contabilizar la prueba JS compilada bajo `dist`. Estos porcentajes locales no son un resultado de Sonar ni del Quality Gate.
- `pnpm lint`: pasó (6 workspaces).
- `pnpm typecheck`: pasó (6 workspaces).
- `pnpm build`: pasó (6 workspaces; sigue la advertencia conocida de plugin ESLint Next no detectado).
- Suite unitaria de los workspaces y `pnpm test:ci`: pasaron; la salida confirma 39/39 pruebas de política y 5/5 pruebas del worker, además de los tests de API, web, contratos, UI y feature flags.
- El comando raíz `pnpm test` se ejecutó: unidades y políticas pasaron, pero se detuvo en las pruebas de integración API porque Testcontainers no encontró daemon (`Could not find a working container runtime strategy`). `docker info` confirmó que falta el pipe `//./pipe/docker_engine`; Docker Desktop/daemon debe iniciarse para repetir integración. No se eliminaron contenedores, volúmenes ni datos.
- `git diff --check`: limpio en la última revisión; solo advertencias normales de conversión LF/CRLF en Windows.
- Para resolver el EACCES del sandbox con el registro de npm se pidió autorización de ejecución ampliada. No se cambió Node del sistema; comandos ejecutados con Node 24/pnpm 10.12.4 fijados.

### GitHub / seguridad / aceptación

- Se volvió a consultar la ejecución 43812334596. `quality` completó commit range, lint, typecheck, unidades/políticas, integraciones API/worker, health, build, Playwright/axe y LCOV. Falló solamente en “Require SonarQube project and credentials” por identidad/token faltantes; análisis Sonar fue omitido. `pr-report` falló correctamente por esa dependencia.
- En el mismo run: CodeQL, secret-scan, dependency-audit, imágenes API/worker y Trivy concluyeron `success`; imágenes/manifest se retuvieron. Playwright/axe pasó. Preview `43812334562` se omitió por ser Draft.
- Un comentario anterior de CodeQL sobre regex polinómica queda asociado a un análisis previo; el repositorio contiene el arreglo en commit `89254ae` (`fix(contracts): avoid telemetry regex complexity`), confirmado por `git blame`. La ejecución CodeQL más reciente pasó; la herramienta disponible no permite consultar el estado de la alerta individual en Security.
- La tarea T030 sigue marcada completa por su alcance de reportes y configuración; Quality Gate remoto y su check requerido permanecen en T031 parcial. La cobertura de los módulos existentes supera 80% de líneas localmente; aún debe comprobarse el nuevo-code gate real. Los módulos `promociones`, `pedidos` y `pagos` no tienen implementación de negocio ni requisito de cobertura de módulo introducido.
- Total de tareas permanece **44 completas (63,8%), 17 parciales y 8 pendientes**; no se cambió el estado de otras tareas por evidencia solo local o por bloqueos externos.

### Próxima reanudación

1. Revisar `git status --short`, diff y el nuevo patch antes de preparar un commit; no agregar `docs/progress/recovery-2026-11-16/` al commit.
2. Si Docker Desktop está iniciado, repetir primero `pnpm --filter @cafeteria/api test:integration`, `pnpm --filter @cafeteria/worker test:integration` y después el flujo de pruebas necesario; si no, mantenerlas como bloqueo ambiental.
3. Continuar trabajo local independiente (por ejemplo, añadir escenarios locales para fallos de migración de predeploy y simulación de rollback), sin publicar workflows que usen destinos o planes inventados.
4. Solicitar una sola vez al owner Sonar project key/org y token almacenado como secret; requerir acceso admin para branch rules y test PRs negativos. No volver a disparar CI con el mismo fallo de Sonar mientras esos datos sigan ausentes.

## 14. Reanudación prioritaria de Sonar — 2026-11-16

- El propietario confirma que ya creó `SONAR_TOKEN` como secret y `SONAR_PROJECT_KEY`/`SONAR_ORGANIZATION` como variables de GitHub Actions. No se leyeron ni se registraron sus valores; el workflow los consume mediante `${{ secrets.SONAR_TOKEN }}` y `${{ vars.* }}`.
- Docker Desktop está instalado (`docker.exe` disponible), pero el daemon local no responde: no existe `//./pipe/docker_engine`; además, el acceso al archivo de configuración Docker del perfil está denegado. Integraciones Testcontainers locales permanecen bloqueadas hasta que Docker Desktop arranque.
- HEAD local antes de preparar el push: `437b02df447d0a4611b9cea601a69750c27cceb9`; `origin/feature/spec-1` sigue en `53aadfa5707a0dd799629d5f77755ee5d0ea7060`. Un commit local está pendiente de publicación. Cambios docs/tareas/checkpoint también locales; no agregar `docs/progress/recovery-2026-11-16/`.
- Procedimiento de esta reanudación: validar únicamente los cambios locales pendientes, preparar commit documental atómico sin respaldos ni secretos, publicar a `feature/spec-1`, consultar la ejecución nueva de Actions y confirmar que el escaneo Sonar importa los seis LCOV y devuelve un Quality Gate calculado. No declarar aprobado `Not computed` ni el último run previo `43812334596`.

## 15. Corrección de Sonar y reportes LCOV — 2026-11-16

### Estado de Git al retomar

- Rama `feature/spec-1`; HEAD local y remoto `bd01bd9b502923b91164bb29972121c670eb590c`.
- Los commits `437b02d` y `bd01bd9` ya están publicados en `origin/feature/spec-1`; no hay commits locales nuevos.
- Los cambios de esta etapa siguen sin commit. La carpeta `docs/progress/recovery-2026-11-16/` continúa sin seguimiento y debe permanecer fuera de staging.
- No se cambió la especificación de otro integrante, no se hizo merge, despliegue ni cambio en `main`.

### Resultado remoto que motivó los cambios

- PR #1 continúa en Draft. Run real `43917776461`, SHA `bd01bd9`: el paso de Sonar analizó el código y calculó un Quality Gate **FAILED**, no `not-computed`.
- Métricas del análisis: cobertura nueva 23,0%, security rating C, reliability rating D; mantenibilidad, duplicación (0,6%) y revisión de hotspots (100%) pasaron. Sonar reportó 7 vulnerabilidades y 2 bugs.
- CodeQL, dependency-audit, secret-scan, build/scan de imágenes y Trivy pasaron. `pr-report` falló correctamente porque `quality` falló. El workflow de Preview se omitió porque el PR era Draft.
- El propietario confirmó que configuró `SONAR_TOKEN`, `SONAR_PROJECT_KEY` y `SONAR_ORGANIZATION`; no se leyeron ni copiaron sus valores.

### Correcciones locales sin publicar

- Se corrigió el ordenamiento por defecto con comparadores deterministas en el validador de commits.
- Se trasladaron los permisos de `ci.yml` y `deploy-preview.yml` al nivel de cada job, manteniendo permisos mínimos; se añadieron pruebas de política.
- El job de telemetría `workflow_run` ahora se omite para ejecuciones cuyo repositorio de origen no coincide con el repositorio confiable; hay prueba de política.
- Las utilidades CI resuelven Git desde ubicaciones fijas soportadas en Windows/Linux, sin depender de `PATH` para localizar el ejecutable. Se añadieron pruebas.
- Se agregó `c8` y el comando `pnpm test:ci:coverage`; `sonar-project.properties` importa un séptimo reporte `coverage/scripts/lcov.info` y reconoce specs `.mjs`.
- Se añadieron pruebas para la validación de rangos reales, detección de rutas afectadas, reportes GitHub, comprobaciones requeridas, migraciones, telemetría, targets staging y límites entre módulos.
- Documentos actualizados: `docs/ci/sonarqube-monorepo.md`, `docs/ci/acceptance.md`, `specs/001-plataforma-entrega/tasks.md` y este checkpoint. El resto de los archivos locales se observa con `git status --short`.

### Validaciones locales posteriores

- `pnpm test:ci:coverage`: 60/60 pruebas pasaron; salida de líneas de los scripts instrumentados 79,42%.
- `pnpm coverage`: pasó para los seis workspaces; API 100%, worker 96,67%, web 100%, contratos 88,89%, feature flags 100%, UI 100%.
- Reportes LCOV combinados localmente: 913/1129 líneas cubiertas (80,87%). Esta suma local no reemplaza la cobertura de código nuevo que calcula Sonar.
- `pnpm lint`, ESLint dirigido a scripts, `pnpm typecheck` y `pnpm build` pasaron. Next.js conserva el aviso conocido de plugin ESLint no detectado.
- Docker Desktop estaba instalado, pero el daemon local no respondía al último chequeo; las integraciones Testcontainers locales siguen dependiendo de iniciar Docker. En el run remoto previo las integraciones pasaron.
- `git diff --check` pasó antes de los últimos cambios documentales; debe repetirse antes de commit.

### Estado de tareas y continuación

- T030 sigue completa por la generación/configuración local de seis reportes de workspace más el reporte LCOV de scripts. T031 sigue parcial: hace falta una nueva ejecución real que importe los siete reportes, calcule un gate aprobado y publique el check para el SHA actualizado.
- T033 sigue parcial: falta verificar reglas efectivas de protección de `main`. Los escenarios negativos remotos de T034 siguen pendientes.
- El total global de tareas no se recalculó en este bloque; no se marcaron como completas tareas que dependan de GitHub, Sonar, Docker o servicios externos.
- Próximo paso: revisar `git diff` y `git diff --check`, ejecutar `pnpm test:ci:coverage` y Prettier check sobre archivos modificados, crear commits atómicos sin `docs/progress/recovery-2026-11-16/`, hacer push normal a `feature/spec-1` y consultar el nuevo run. Mantener PR #1 en Draft hasta que el análisis de Sonar y todos los checks obligatorios pasen.
