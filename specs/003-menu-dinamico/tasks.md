# Tasks: Menú dinámico

**Entradas**: [spec.md](spec.md), [plan.md](plan.md), [data-model.md](data-model.md), [contracts/](contracts/)
**Regla**: una casilla se marca `[x]` solo con evidencia ejecutada; los comandos y resultados están en [evidence.md](evidence.md). Tests obligatorios (Constitución VI).
Rutas API relativas a `apps/api/src/modules/catalog/`; web a `apps/web/src/`.

Leyenda: `[x]` hecho y verificado · `[~]` parcial (se indica qué falta) · `[ ]` pendiente.

## Fase 1 — Setup

- [x] T001 Jest descubre `catalog/**/*.spec.ts` (`pnpm --filter @cafeteria/api test`). Los `.gitkeep` se dejan: son del scaffolding del líder.
- [x] T002 Migración `20261117150000_catalog-schema.ts` (esquema `catalog`, triggers de inmutabilidad, semilla de alérgenos). Verificado con Postgres real: `tests/schema.spec.ts` (7 pruebas). **No se probó `down`.**

## Fase 2 — Fundacional

- [x] T010 [P] `domain/money.ts` + spec.
- [x] T011 [P] `domain/allergens.ts` + spec.
- [x] T012 [P] `domain/schedule.ts` + spec (bordes 07:00/11:00, zona horaria, cambio de día, fin de semana).
- [x] T013 [P] `domain/authorization.ts` + spec (deny-by-default, personal vs. admin).
- [x] T014 [P] `domain/revision.ts` + spec (428/409).
- [~] T015 `infrastructure/database.ts`, `public-cache.ts`. Verificado con Redis real (invalidación por epoch visible en `catalog.http.spec.ts`). **Falta probar la degradación con Redis caído y el TTL de 5 s.**

## Fase 3 — US1 (P1) Consultar el menú

- [x] T020 [P] [US1] `domain/public-view.ts` + spec.
- [x] T021 [US1] `controllers/public-menu.controller.ts`: `GET /menus`, `GET /products/:id`, cabecera de caché, validación de query (cubierto en `tests/catalog.http.spec.ts`).
- [x] T022 [US1] Integración Postgres+Redis: solo versiones publicadas; el borrador nunca aparece.
- [x] T023 [P] [US1] Componentes `MenuView`, `AllergenFilter`, `ProductCard`, `AvailabilityBadge` + Vitest (`features/catalog/catalog.test.ts`).
- [~] T024 [US1] Página `app/menu/page.tsx` + E2E Playwright/axe (`e2e/catalog-menu.spec.ts`). **Verificado contra una API stub**, no contra la API real. Los estados vacío/error/cargando existen pero **no tienen E2E**. Pendiente prueba manual con lector de pantalla.

## Fase 4 — US2 (P1) Crear y publicar

- [x] T030 [P] [US2] `domain/publish-validation.ts` + spec (FR-004, SC-005).
- [x] T031 [US2] Repositorio y casos de uso de borrador (menú, categorías, ítems, productos, horario) con `revision`.
- [x] T032 [US2] Controlador admin + autorización en servidor: 401 por defecto, sin `x-role`, ninguna ruta admin pública; 403 al personal en rutas de contenido.
- [x] T033 [US2] Publicar (transacción atómica) + preview; integración: bloqueo con detalle, publicación visible al instante.
- [ ] T034 [US2] UI admin (editor, previsualización, publicación). **No iniciada; bloqueada**: las rutas admin responden 401 hasta que Spec #2 defina cómo la web reenvía la sesión a la API; sin eso la UI no se puede ejercitar de extremo a extremo.
- [~] T035 [US2] SC-002: se midió publicar→visible = 21–25 ms en local (1 muestra, sin carga). **No es una medición representativa; SC-002 no se declara cumplido.**

## Fase 5 — US3 (P1) Versiones

- [x] T040 [P] [US3] `domain/menu-snapshot.ts`, `domain/version-diff.ts` + specs.
- [x] T041 [US3] Historial, restaurar (versión N+1), retirar; inmutabilidad por trigger.
- [x] T042 [US3] Concurrencia: 409 sin sobrescribir; carrera real de 5 guardados ⇒ 1 gana, 4 reciben 409.
- [x] T043 [US3] Auditoría de cambios de precio/contenido/disponibilidad con actor y valores (FR-012).
- [~] T044 [US3] Snapshot para pedidos: `GET /products/:id` devuelve precio base, `menuVersionId` y estado; parche propuesto al líder en `contracts/shared-contracts-proposal.md`. **US3.2/SC-004 extremo a extremo bloqueado por Spec #6 (Orders no existe).**
- [ ] T045 [US3] UI de historial y restauración. **No iniciada.**

## Fase 6 — US4 (P2) Disponibilidad

- [x] T050 [US4] `PATCH /admin/products/:id/availability`: personal marca agotado con efecto inmediato; rechaza precio (422) y `PUT` de producto (403); existencias 0 ⇒ agotado. Autorización con mock de test; **la autorización real depende de Spec #2**.
- [ ] T051 [US4] `applyConfirmedSale` (descuento idempotente). **No implementado** (necesita tabla de idempotencia y el contrato con Orders).
- [ ] T052 [US4] UI de disponibilidad para personal. **No iniciada.**

## Fase 7 — Cierre

- [ ] T060 Carga/latencia de `GET /menus` (p95 < 300 ms, SC-001). **Sin medir.**
- [~] T061 `pnpm lint`, `typecheck`, `test`, `build` desde la raíz y `test:integration` en verde (ver evidence.md). **No se midió cobertura ni se ejecutó `pnpm db:migrate` contra el Compose local.**
- [ ] T062 Revisión manual NVDA/VoiceOver (pendiente de una persona).
- [~] T063 `evidence.md` creado; actualizar `checklists/requirements.md` al cerrar el spec.

## Dependencias

Fase 1 → 2 → (US1 → US2 → US3 → US4). Externas: Spec #2 (authorizer real y nombres de rol), Spec #6 (snapshot/stock), líder (contracts, resolución de `@cafeteria/contracts` en la API, `.env.example`).
