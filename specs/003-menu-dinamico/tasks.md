# Tasks: Menú dinámico

**Entradas**: [spec.md](spec.md), [plan.md](plan.md), [data-model.md](data-model.md), [contracts/](contracts/)
**Regla**: una casilla se marca `[x]` solo con evidencia ejecutada (comando + resultado) registrada en el commit o en `evidence.md`. Tests obligatorios (Constitución VI).
Rutas API relativas a `apps/api/src/modules/catalog/`; web a `apps/web/src/`.

## Fase 1 — Setup

- [ ] T001 Quitar `.gitkeep` ya innecesarios al añadir ficheros reales; confirmar jest descubre `catalog/**/*.spec.ts` (`pnpm --filter @cafeteria/api test`).
- [ ] T002 Migración `…_catalog-schema.ts`: esquema `catalog`, tablas, triggers de inmutabilidad, semilla de alérgenos. Verif.: test de integración con BD vacía + `down`.

## Fase 2 — Fundacional (bloquea las historias)

- [ ] T010 [P] `domain/money.ts` + spec: validar centavos enteros ≥0, mapeo a `Money`.
- [ ] T011 [P] `domain/allergens.ts` + spec: lista cerrada, parseo de `excludeAllergens`.
- [ ] T012 [P] `domain/schedule.ts` + spec: `isOpenAt`, `nextOpening`, zona `America/Guayaquil`, bordes `[07:00,11:00)`, domingo/lunes, rechazo de franjas inválidas.
- [ ] T013 [P] `domain/authorization.ts` + spec: permisos, `DenyAllAuthorizer`, `requirePermission` (401/403).
- [ ] T014 [P] `domain/revision.ts` + spec: parseo `If-Match`, 428/409.
- [ ] T015 `infrastructure/database.ts` (Pool `pg`), `infrastructure/public-cache.ts` (Redis epoch+TTL, degradación si Redis cae).

## Fase 3 — US1 (P1) Consultar el menú

- [ ] T020 [P] [US1] `domain/public-view.ts` + spec: composición, dedupe por categoría, filtro de alérgenos, agotado/horario, menú sin disponibles → mensaje.
- [ ] T021 [US1] `controllers/public-menu.controller.ts` + spec HTTP: `GET /menus`, `GET /products/:id`, cabeceras de caché, validación de query.
- [ ] T022 [US1] Integración Postgres+Redis: solo versiones publicadas; borrador nunca aparece.
- [ ] T023 [P] [US1] `features/catalog/` componentes `MenuView`, `AllergenFilter`, `ProductCard`, `AvailabilityBadge` + Vitest (texto de agotado, `fieldset/legend`).
- [ ] T024 [US1] Página `app/menu/page.tsx` con loading/empty/error + E2E Playwright+axe (teclado, filtro).

## Fase 4 — US2 (P1) Crear y publicar

- [ ] T030 [P] [US2] `domain/publish-validation.ts` + spec (FR-004, SC-005).
- [ ] T031 [US2] Repositorios y casos de uso de borrador (menú, categorías, ítems, productos, horario) con `revision`.
- [ ] T032 [US2] Controladores admin + guard server-side; tests: 401/403 por defecto, sin `x-role`, ningún admin público.
- [ ] T033 [US2] Publicar (transacción atómica) + preview; integración: publicar → visible en público; bloqueo con detalle.
- [ ] T034 [US2] UI admin: editor, previsualización, publicación (AAA, teclado) + Vitest.
- [ ] T035 [US2] Medición manual/automática de SC-002 (<10 s) documentada en `evidence.md`.

## Fase 5 — US3 (P1) Versiones

- [ ] T040 [P] [US3] `domain/menu-snapshot.ts`, `domain/version-diff.ts` + specs.
- [ ] T041 [US3] Historial, restaurar (versión N+1), retirar; integración: inmutabilidad por trigger, restauración visible.
- [ ] T042 [US3] Concurrencia: dos administradores, segundo guardado → 409 sin sobrescribir (integración con dos conexiones).
- [ ] T043 [US3] Auditoría de cambios de precio/contenido (FR-012) con valor anterior/nuevo y actor.
- [ ] T044 [US3] Snapshot contractual para pedidos: `GET /products/:id` + parche propuesto al líder. **SC-004/US3.2 extremo a extremo bloqueado por Spec #6** (stub documentado).
- [ ] T045 [US3] UI de historial (quién/cuándo/qué) y restauración.

## Fase 6 — US4 (P2) Disponibilidad

- [ ] T050 [US4] `PATCH /admin/products/:id/availability` con permiso `availability.write`; rechaza campos de precio; test personal vs. admin con authorizer mock.
- [ ] T051 [US4] `applyConfirmedSale` (descuento idempotente, 0 ⇒ agotado) probado aislado. Integración con Orders pendiente.
- [ ] T052 [US4] UI de disponibilidad para personal + Vitest.

## Fase 7 — Cierre

- [ ] T060 Carga/latencia representativa de `GET /menus` (p95 y SC-001) — **no afirmar sin medición**.
- [ ] T061 `pnpm lint`, `typecheck`, `test`, `test:integration`, `build`, migración desde BD nueva; cobertura del código nuevo.
- [ ] T062 Revisión manual NVDA/VoiceOver y contraste 7:1 documentada (pendiente humano).
- [ ] T063 Actualizar `checklists/requirements.md` / `evidence.md`; resumen de dependencias para el líder.

## Dependencias

Fase 1 → 2 → (US1 → US2 → US3 → US4). Dentro de una fase, `[P]` son independientes.
Externas: Spec #2 (authorizer real), Spec #6 (snapshot/stock), líder (contracts, `.env.example`).
