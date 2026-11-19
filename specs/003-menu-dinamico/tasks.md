# Tasks: Menú dinámico

**Entradas**: [spec.md](spec.md), [plan.md](plan.md), [data-model.md](data-model.md), [contracts/](contracts/)
**Regla**: una casilla se marca `[x]` solo con evidencia ejecutada; los comandos y resultados están en [evidence.md](evidence.md). Tests obligatorios (Constitución VI).
Rutas API relativas a `apps/api/src/modules/catalog/`; web a `apps/web/src/`.

Leyenda: `[x]` hecho y verificado · `[~]` parcial (se indica qué falta) · `[ ]` pendiente.

## Fase 1 — Setup

- [x] T001 Jest descubre `catalog/**/*.spec.ts` (`pnpm --filter @cafeteria/api test`). Los `.gitkeep` se dejan: son del scaffolding del líder.
- [x] T002 Migraciones `20261117150000_catalog-schema.ts` y `20261118120000_catalog-stock-consumption.ts`. Verificado con Postgres real: `tests/schema.spec.ts` y `pnpm db:migrate` (2 migraciones, segunda ejecución sin cambios) sobre un Postgres 17 desechable. `tests/migrations.spec.ts` (Postgres real): up → up (sin cambios) → `down` ×2 (deja el esquema vacío) → up (restaura el mismo esquema). Ambas migraciones son expand-only.

## Fase 2 — Fundacional

- [x] T010 [P] `domain/money.ts` + spec. El tipo `Money` viene ahora de `@cafeteria/contracts` (commit `a3e5e0b`, tras integrar `b4309f8` del líder); en el módulo solo quedan los helpers de validación de precio.
- [x] T011 [P] `domain/allergens.ts` + spec.
- [x] T012 [P] `domain/schedule.ts` + spec (bordes 07:00/11:00, zona horaria, cambio de día, fin de semana).
- [x] T013 [P] `domain/authorization.ts` + spec (deny-by-default, personal vs. admin).
- [x] T014 [P] `domain/revision.ts` + spec (428/409).
- [x] T015 `infrastructure/database.ts`, `public-cache.ts`. `tests/stock-and-cache.spec.ts`: TTL ≤ 5 s y expiración real de la clave; un cambio hecho sin invalidar se ve tras el TTL; con Redis detenido la lectura pública y las escrituras siguen funcionando desde Postgres (< 5 s). Se corrigió un cuelgue al cerrar con Redis caído. **No probado**: reconexión cuando Redis vuelve a estar disponible.

## Fase 3 — US1 (P1) Consultar el menú

- [x] T020 [P] [US1] `domain/public-view.ts` + spec.
- [x] T021 [US1] `controllers/public-menu.controller.ts`: `GET /menus`, `GET /products/:id`, cabecera de caché, validación de query.
- [x] T022 [US1] Integración Postgres+Redis: solo versiones publicadas; el borrador nunca aparece.
- [x] T023 [P] [US1] Componentes `MenuView`, `AllergenFilter`, `ProductCard`, `AvailabilityBadge` + Vitest.
- [~] T024 [US1] Página `app/menu/page.tsx`. E2E Playwright/axe (WCAG 2.x A/AA/AAA incl. contraste 7:1), teclado, foco, **estado vacío y estado de error** contra una API stub; el estado de **carga** (`loading.tsx`) solo tiene prueba unitaria (`role="status"`). **Falta**: E2E contra la API real (la API real es deny-by-default para administrar, no se puede sembrar un menú sin Identity), prueba manual con lector de pantalla. Observación: ante un fallo de la API la página sigue sirviendo la última respuesta cacheada (stale) y solo muestra el error si no hay copia previa.

## Fase 4 — US2 (P1) Crear y publicar

- [x] T030 [P] [US2] `domain/publish-validation.ts` + spec (FR-004, SC-005).
- [x] T031 [US2] Repositorio y casos de uso de borrador (menú, categorías, ítems, productos, horario) con `revision`.
- [x] T032 [US2] Controlador admin + autorización en servidor: 401 por defecto, sin `x-role`, ninguna ruta admin pública; 403 al personal en rutas de contenido.
- [x] T033 [US2] Publicar (transacción atómica) + preview; integración: bloqueo con detalle, publicación visible al instante.
- [~] T034 [US2] UI admin: lista/alta de menús, editor (nombre, horario, categorías, productos), alta/edición de productos, vista previa y publicación (`app/admin/catalogo/**`, `features/catalog/admin/**`). Probada con Vitest (cliente, formularios, estados) y E2E contra API stub con axe AAA. **Falta**: E2E con sesiones reales (depende de Identity, Spec #2); el cliente reenvía cookie/Authorization de la persona y no existe ningún bypass.
- [~] T035 [US2] SC-002: prueba de integración (<10 s, 21–30 ms) y medición local de 30 publicaciones: p50 75 ms, p95 82 ms, máx 98 ms (`tests/perf.spec.ts`). Es una medición local en contenedores con datos sintéticos, **no** evidencia de producción; SC-002 no se declara cumplido.

## Fase 5 — US3 (P1) Versiones

- [x] T040 [P] [US3] `domain/menu-snapshot.ts`, `domain/version-diff.ts` + specs.
- [x] T041 [US3] Historial, restaurar (versión N+1) con `warning` al administrador, retirar; inmutabilidad por trigger. Probado: restaurar v1 ⇒ v3 a 250; publicar el borrador después ⇒ v4 a 300.
- [x] T042 [US3] Concurrencia: 409 sin sobrescribir; carrera real de 5 guardados ⇒ 1 gana, 4 reciben 409.
- [x] T043 [US3] Auditoría de cambios de precio/contenido/disponibilidad con actor y valores (FR-012).
- [~] T044 [US3] Snapshot para pedidos: `GET /products/:id` devuelve precio base, `menuVersionId` y estado; parche propuesto en `contracts/shared-contracts-proposal.md` (pendiente de revisión del líder). **US3.2/SC-004 extremo a extremo bloqueado por Spec #6 (Orders no existe).**
- [~] T045 [US3] UI de historial (autor, fecha, cambios legibles) y restauración con advertencia visible y confirmación. Probada contra API stub (axe AAA, cuadro de confirmación). **Falta** E2E con sesión real.

## Fase 6 — US4 (P2) Disponibilidad

- [x] T050 [US4] `PATCH /admin/products/:id/availability`: personal marca agotado con efecto inmediato; rechaza precio (422) y `PUT` de producto (403); existencias 0 ⇒ agotado; el personal puede listar productos (`GET /admin/products` con `catalog.availability.write`). Autorización con mock de test inyectado por DI solo en pruebas (`catalog.http.spec.ts`; producción usa `DenyAllAuthorizer`); **la autorización real depende de Spec #2**.
- [~] T051 [US4] `CatalogService.applyConfirmedSale(saleId, lines)`: descuento atómico (todo o nada), idempotente por `saleId` (tabla append-only `catalog.stock_consumptions`), bloqueo ordenado, agotado automático y auditoría. Probado de forma aislada con Postgres real: reintento, 12 ventas concurrentes sobre 5 unidades ⇒ 5 confirman, 8 envíos paralelos del mismo `saleId` ⇒ 1 descuento, venta rechazada no deja rastro. **No verificado con Orders** (no existe) ni expuesto por HTTP; el contrato `StockConsumptionPort` sigue pendiente de aprobación.
- [~] T052 [US4] UI de disponibilidad/existencias (`app/admin/catalogo/productos`), operable con teclado; envía solo disponibilidad/existencias. Probada contra API stub. **Falta** E2E con sesión real y ocultar por rol (la UI aún no conoce el rol de la persona; la API responde 403 si no corresponde).

## Fase 7 — Cierre

- [~] T060 Rendimiento local de `GET /menus` (~180 productos, 30 conexiones, 3000 peticiones): caché caliente p50 76 ms / p95 130 ms / p99 186 ms, 0 errores, 361 req/s; sin caché p95 68 ms (n=60, secuencial). El generador de carga corre en el mismo proceso que la API. **No es una prueba de carga representativa; SC-001 (p95 < 300 ms) no se declara cumplido.**
- [x] T061 Verificación independiente en Node 24.22.3 (binario del paquete npm `node`, sin instalación global), pnpm 10.12.4, Docker 29.0.1, tras el `cherry-pick` de `b4309f8`: `lint`, `typecheck`, `build` (exit 0); `turbo run test --force` (API 130 OK + 1 omitida opt-in; web 36; contracts 5; feature-flags 7; worker 5; ui 1); `test:ci` 67/67; `test:integration` API 5/5 y worker; `test:e2e` API; `pnpm coverage` (API: 94,5 % sentencias / 84,7 % ramas / 97,0 % funciones / 96,2 % líneas); `pnpm db:migrate` en Postgres 17 desechable (aplica las 2 migraciones; segunda ejecución «No migrations to run»); `down` probado (T002); E2E Playwright de Catálogo repetidos en Node 24: 6/6 menú + 8/8 administración (14/14) y los 4 genéricos; `pnpm audit`: 1178 dependencias, 0 vulnerabilidades, y Catálogo no modificó ningún `package.json` ni el lockfile.
- [ ] T062 Revisión manual NVDA/VoiceOver (pendiente de una persona).
- [~] T063 `evidence.md` y `checklists/requirements.md` actualizados; el spec no se da por terminado.

## Dependencias

Fase 1 → 2 → (US1 → US2 → US3 → US4). Externas: Spec #2 (authorizer real, sesión web→API y nombres de rol), Spec #6 (snapshot de pedido, consumo de stock), líder (contracts, resolución de `@cafeteria/contracts` en la API, `.env.example`).
