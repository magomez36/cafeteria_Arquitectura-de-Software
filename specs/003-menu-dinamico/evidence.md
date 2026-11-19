# Evidencia de verificación — Spec 3 (Menú dinámico)

Rama `feature/spec-3`, base `e0b90e6`. Entorno: Windows 11, pnpm 10.12.4, Docker 29.0.1.
Fecha: 2026-11-17. Todo lo de abajo se ejecutó en esta copia de trabajo.

**Node.** El proyecto pide 24.x. La máquina tiene 22.21.0; la verificación final se repitió con **Node 24.22.3**, obtenido como binario del paquete npm `node` (sin instalarlo en el sistema) y puesto primero en el `PATH` solo para esos comandos. La primera ronda (lote anterior) se hizo con 22.21.0 y también estaba en verde.

## Verificación independiente — 2026-11-19 (Node 24.22.3, pnpm 10.12.4, Docker 29.0.1)

Estado de partida: árbol limpio; `git cherry-pick b4309f8` (solo ese commit, sin conflictos → `e115862`); luego `a3e5e0b` (Money oficial) y `58eb306` (pruebas).

| Comando                                                               | Resultado                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run lint` / `typecheck` / `build`                               | exit 0 / 0 / 0                                                                                                                                                                                                                                                                            |
| `pnpm exec turbo run test --force`                                    | API 130 OK + 1 omitida (rendimiento opt-in); web 36; contracts 5; feature-flags 7; worker 5; ui 1                                                                                                                                                                                         |
| `pnpm test:ci`                                                        | 67/67                                                                                                                                                                                                                                                                                     |
| `test:integration` API / worker; `test:e2e` API                       | exit 0                                                                                                                                                                                                                                                                                    |
| `pnpm coverage`                                                       | exit 0. API global: 94,47 % sentencias, 84,67 % ramas, 97,01 % funciones, 96,19 % líneas. Módulo catálogo: `catalog.service` 92,4 %, `admin.controller` 98,4 %, `catalog.repository` 91,5 % sentencias; `catalog-error.filter` 66,7 % (la rama de excepciones inesperadas no se ejercita) |
| Playwright con Node 24 (web con `API_URL` al stub, puertos 3100/3101) | menú público 6/6 y administración 8/8 (axe A/AA/AAA, 401 vs 403, vacío, error, 409, bloqueo de publicación, historial, disponibilidad con teclado); los 4 genéricos 4/4; sin las variables `CATALOG_E2E_*` los 14 de Catálogo se omiten                                                   |
| `pnpm db:migrate` en Postgres 17 desechable (ya eliminado), dos veces | aplica `20261117150000` y `20261118120000`; segunda vez «No migrations to run»                                                                                                                                                                                                            |
| `tests/migrations.spec.ts` (nuevo)                                    | up → up idempotente → `down` ×2 hasta esquema vacío → up de nuevo = mismo esquema                                                                                                                                                                                                         |
| `test/migrations/*` (política expand/contract del proyecto)           | 2/2 suites OK                                                                                                                                                                                                                                                                             |
| `pnpm audit`                                                          | 1178 dependencias, 0 vulnerabilidades (info/baja/moderada/alta/crítica = 0)                                                                                                                                                                                                               |

Los E2E de Playwright de la ronda anterior se hicieron con Node 22.21.0; ahora están repetidos con Node 24.

## Pruebas del lote actual

- `tests/stock-and-cache.spec.ts` (Postgres + Redis reales, 7 pruebas, repetida 3 veces seguidas en Node 24 tras corregir una aserción de orden en mi propia prueba): descuento idempotente, todo o nada, concurrencia (12 ventas/5 unidades ⇒ 5; 8 envíos del mismo `saleId` ⇒ 1), auditoría, TTL ≤ 5 s con expiración real, lectura pública y escrituras con Redis detenido.
- `tests/catalog.http.spec.ts` (ahora 20 pruebas; 5 nuevas: entradas inválidas, JSON mal formado, 404, quitar categoría con `If-Match` obsoleto → 409, permisos de personal/anónimo) (antes 15): se añadió la advertencia de restauración y «publicar el borrador tras restaurar» (v1 restaurada como v3 a 250; borrador publicado como v4 a 300) y el acceso de personal a `GET /admin/products` (200) pero no a `GET /admin/menus` (403).
- Web (Vitest, 36): cliente de administración con `fetch` simulado (cabeceras reenviadas, mapeo 401/403/404/409/422/428/500, red caída, detalle de publicación bloqueada), lectura de formularios (precio a centavos sin coma flotante, horario, disponibilidad que nunca lleva precio), estados (409, 401/403, bloqueo, éxito, vacío), ids únicos entre formularios, textos de cambios de versión, estados de carga.

## Mediciones de rendimiento (locales, `tests/perf.spec.ts`, opt-in con `CATALOG_PERF=1`)

Datos sintéticos: 3 menús × 4 categorías × 15 productos (180 productos). API, Postgres y Redis en la misma máquina (contenedores); el generador de carga comparte proceso con la API.

| Medición                                     | n    | p50     | p95      | p99      | máx      | Nota                                   |
| -------------------------------------------- | ---- | ------- | -------- | -------- | -------- | -------------------------------------- |
| `GET /menus`, caché caliente, 30 en paralelo | 3000 | 75,8 ms | 129,9 ms | 186,4 ms | 193,4 ms | 0 errores, 361 req/s                   |
| `GET /menus`, caché fría (invalida antes)    | 60   | 54,3 ms | 67,7 ms  | 88,1 ms  | 88,1 ms  | secuencial; llega siempre a Postgres   |
| Publicar → visible en la lectura pública     | 30   | 75,4 ms | 82,1 ms  | 97,9 ms  | 97,9 ms  | incluye la propia petición de publicar |

**Qué sí y qué no son.** Sirven para detectar regresiones y confirmar que no hay cuellos de botella gruesos en el diseño. **No** demuestran p95 < 300 ms (SC-001) ni < 10 s de publicación a visibilidad (SC-002) en producción: falta una carga representativa (red real, instancias separadas, concurrencia sostenida, datos reales). Antes de declarar SC-001 hay que medir en un entorno comparable al desplegado.

## Criterios de aceptación cubiertos

| Criterio        | Evidencia                                                                                              | Alcance real                         |
| --------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| US1.1–1.4       | `public-view.spec.ts`, `catalog.http.spec.ts`, `catalog.test.ts`, E2E menú                             | API real con BD real; UI contra stub |
| US2.1–2.4       | `catalog.http.spec.ts`; UI admin vs stub                                                               | UI sin sesión real                   |
| US3.1, 3.3, 3.4 | `catalog.http.spec.ts` (nueva versión, restaurar = N+1, historial con autor/fecha/cambios); UI vs stub | UI sin sesión real                   |
| US3.2           | **No verificable**: requiere Orders (Spec #6). Solo se probó el contrato `GET /products/:id`           | Bloqueado                            |
| US4.1, 4.3      | `catalog.http.spec.ts`; UI vs stub                                                                     | Authorizer simulado solo en test     |
| US4.2           | `stock-and-cache.spec.ts` (`applyConfirmedSale` aislado)                                               | **No verificado con Orders**         |
| FR-011          | Dos admin → 409; carrera de 5 → 1 gana; la UI muestra el 409                                           | Cumplido a nivel API y UI (stub)     |
| FR-012          | Auditoría con actor y valores anterior/nuevo                                                           | Cumplido a nivel API                 |
| SC-001          | Medición local (arriba)                                                                                | **No concluyente**                   |
| SC-002          | 21–98 ms en pruebas locales                                                                            | **No concluyente**                   |
| SC-005          | Publicación bloqueada sin alt/alérgenos (API y UI)                                                     | Cumplido en pruebas                  |

## Decisiones de implementación que conviene revisar

1. **Restaurar no modifica el borrador** (decisión confirmada por el líder). La respuesta incluye `warning`, la UI lo muestra antes de restaurar y pide confirmación; probado qué pasa al publicar el borrador después.
2. **`Money`**: resuelto; se usa el tipo oficial de `@cafeteria/contracts`.
3. **Nombres de rol `admin`/`staff`**: supuesto a confirmar con Identity (Spec #2).
4. **Lista de alérgenos**: pendiente de validar con la normativa ecuatoriana de etiquetado.
5. **El personal puede listar productos** (`GET /admin/products` pasó a `catalog.availability.write`) porque necesita ver existencias; sigue sin poder editarlos ni ver menús.
6. **La UI de administración reenvía a la API solo la cookie/`Authorization` de la propia petición**. No fabrica identidad ni usa cabeceras de rol; sin credenciales válidas la API responde 401 y la UI lo muestra. La forma final de la sesión la define Identity.
7. **Stale-while-revalidate del menú público**: si la API falla, la página sigue mostrando la última respuesta cacheada y solo muestra el error si no hay copia.
8. **`applyConfirmedSale` rechaza con 409 si falta stock** (no deja negativos ni vende de más); la política de Orders ante ese rechazo está por acordar.

## Auditoría de dependencias

- **Introducidas por Catálogo: ninguna.** `git diff e0b90e6 71d9d17` sobre `package.json` (raíz, api, web, contracts) y `pnpm-lock.yaml` está vacío; Catálogo no añadió ni cambió dependencias.
- **Heredadas**: `pnpm audit` reporta 0 vulnerabilidades sobre 1178 dependencias en esta fecha. El baseline del líder mencionaba GHSA-fc5q-39xc-vjpf (picomatch); ya no aparece en el resultado (no se investigó si se actualizó la dependencia o si el aviso se retiró). Limitación: `pnpm audit` usa la base de avisos de npm; no sustituye al escaneo de SonarQube/CI.

## Hallazgos nuevos

1. **JSON mal formado no usa el formato de error del catálogo.** El parser falla antes del filtro del controlador y responde el manejador global de Nest (`{statusCode, message}`, 400, sin traza). Corregirlo exige un filtro global en la plataforma (decisión del líder); Catálogo no lo registra para no alterar otros módulos. Fijado en `catalog.http.spec.ts`.
2. **Integración con autenticación simulada**: ya existía y se amplió (ver abajo). El simulador (`x-test-actor`) solo existe en los archivos de prueba y se inyecta con `overrideProvider(CATALOG_AUTHORIZER)`; el módulo registra `DenyAllAuthorizer` y una prueba comprueba que con él todas las rutas admin dan 401 aunque se envíen cabeceras de rol.

## Pendiente de acción humana o de otros specs

- Prueba manual con NVDA/VoiceOver y revisión visual (Constitución I).
- Medición de carga representativa (SC-001/SC-002).
- Identity (Spec #2): `CATALOG_AUTHORIZER` real, nombres de rol, forma de la sesión web→API; luego E2E con sesiones auténticas.
- Orders (Spec #6): integrar `applyConfirmedSale`/`StockConsumptionPort` y el snapshot del pedido (US3.2, SC-004, US4.2).
- Líder: mapeo de `@cafeteria/contracts` en la API, revisión de `ProductSnapshot`/`CatalogPort`, `.env.example` (`CAFETERIA_TIMEZONE`).

## Matriz de requisitos funcionales (cierre parcial, 2026-11-19)

Criterio: **CUMPLIDO** = verificado con pruebas ejecutadas en lo que depende solo de Catálogo; **PARCIAL** = verificado a nivel API/UI con simulaciones, falta una dependencia o una verificación humana; **BLOQUEADO** = depende de otro spec; **PENDIENTE** = nada hecho.

| Requisito                                      | Estado   | Evidencia                                                                                                                      | Qué falta                                                              |
| ---------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| FR-001 crear/editar/publicar/retirar/restaurar | PARCIAL  | `catalog.http.spec.ts` (ciclo completo, retirar conserva versiones, restaurar = N+1, quitar categoría) con BD real; UI vs stub | Sesión admin real (Identity, Spec #2)                                  |
| FR-002 campos y alt obligatorio                | CUMPLIDO | `schema.spec.ts` (CHECK precio/URL), `publish-validation.spec.ts`, HTTP: entradas inválidas rechazadas                         | —                                                                      |
| FR-003 borrador y vista previa                 | CUMPLIDO | HTTP: borrador no aparece en `/menus`, `GET .../preview` lo muestra                                                            | — (UI vs stub)                                                         |
| FR-004 bloqueo sin alt/alérgenos               | CUMPLIDO | HTTP: 422 con detalle y publica al corregir; UI muestra qué falta                                                              | —                                                                      |
| FR-005 versión inmutable e historial           | CUMPLIDO | Trigger de inmutabilidad (`schema.spec.ts`), historial con autor/fecha/cambios (HTTP)                                          | —                                                                      |
| FR-006 visible en < 10 s                       | PARCIAL  | Prueba de integración 21–98 ms; caché con TTL ≤ 5 s e invalidación                                                             | Medición en entorno representativo (SC-002)                            |
| FR-007 horarios por menú                       | CUMPLIDO | `schedule.spec.ts` (bordes, zona horaria, cambio de día), HTTP fuera de horario                                                | —                                                                      |
| FR-008 disponibilidad y existencias            | PARCIAL  | `PATCH availability`, existencias 0 ⇒ agotado, `applyConfirmedSale` idempotente/concurrente (Postgres real)                    | Descuento por venta confirmada **no verificado con Orders** (Spec #6)  |
| FR-009 personal: disponibilidad, no precios    | PARCIAL  | HTTP: personal 200 en disponibilidad, 422 con precio, 403 en PUT/menús                                                         | Autorizador real y nombres de rol (Identity)                           |
| FR-010 categorías y filtro de alérgenos        | CUMPLIDO | HTTP + E2E menú (teclado, filtro excluye leche)                                                                                | Prueba con lector de pantalla (humana)                                 |
| FR-011 ediciones concurrentes                  | CUMPLIDO | 409 al segundo; carrera de 5 ⇒ 1 gana; 428 sin `If-Match`; 409 al quitar categoría obsoleta; UI muestra el 409                 | —                                                                      |
| FR-012 auditoría                               | CUMPLIDO | Registro append-only con actor y valores (HTTP + `schema.spec.ts`)                                                             | — (actor real depende de Identity)                                     |
| FR-013 WCAG 2.2 AAA                            | PARCIAL  | axe A/AA/AAA + contraste 7:1 en menú y 3 pantallas admin (Node 24), disponibilidad con texto                                   | NVDA/VoiceOver y revisión visual (T062, humana); axe no cubre toda AAA |

| Criterio        | Estado                             | Evidencia / bloqueo                                                                                    |
| --------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| US1.1–1.4       | CUMPLIDO (API real) / PARCIAL (UI) | US1.2 «no se puede añadir al carrito» depende del carrito (Spec #4); la UI muestra «Agotado» con texto |
| US2.1–2.4       | PARCIAL                            | API real OK; UI admin solo vs stub                                                                     |
| US3.1, 3.3, 3.4 | PARCIAL                            | API real OK; UI vs stub                                                                                |
| US3.2 / SC-004  | BLOQUEADO                          | Requiere Orders (Spec #6); solo se probó `GET /products/:id`                                           |
| US4.1, 4.3      | PARCIAL                            | Autorizador simulado solo en test                                                                      |
| US4.2           | BLOQUEADO (en conjunto)            | La lógica y su atomicidad están probadas aisladas; falta que Orders la dispare                         |
| SC-001, SC-002  | PENDIENTE de medición real         | Mediciones locales no concluyentes                                                                     |
| SC-003          | PENDIENTE                          | Prueba de usabilidad con una persona                                                                   |
| SC-005          | CUMPLIDO                           | Bloqueo en API y UI                                                                                    |
