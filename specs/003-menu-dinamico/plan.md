# Implementation Plan: Menú dinámico

**Branch**: `feature/spec-3` (base fija `e0b90e6`) | **Spec**: [spec.md](spec.md)
**Responsable**: integrante 3 (Catálogo y menú dinámico)

## Summary

Módulo `catalog` del monolito NestJS: menús en borrador, publicación atómica que genera una
**versión inmutable** (snapshot JSONB), historial/auditoría append-only, disponibilidad
operativa (agotado/existencias) separada del contenido versionado, lectura pública cacheada
(Redis + `Cache-Control` corto) con actualización visible < 10 s sin desplegar, y UI web
mobile-first (tienda pública + administración). El precio base vive aquí; descuentos son del
spec 005.

## Technical Context

- **Lenguaje**: TypeScript (Node 24). API NestJS 11, `pg` directo (sin ORM, es lo que ya
  hay en `apps/api/package.json`), `redis` 5, tests Jest (`apps/api`) y Vitest/Playwright (`apps/web`).
- **Almacenamiento**: Postgres 17, esquema propio `catalog`; Redis 7 para caché pública.
- **Dinero**: enteros en centavos (`price_minor`, `CHECK >= 0`), moneda `USD` (contrato `Money`).
- **Zona horaria**: `America/Guayaquil` (UTC-5, sin DST), constante del módulo, sobrescribible
  con `CAFETERIA_TIMEZONE` (leída con default; añadirla a `.env.example` es del líder).
- **Restricción de manifests**: no se puede tocar `apps/api/package.json` ni el lockfile. Por
  tanto **sin class-validator/zod**: validación de entrada con funciones propias (domain/validation).
  Web: sin dependencias nuevas (`fetch` nativo + React/Next existentes; tests con vitest/jsdom
  ya instalados; axe vía `@axe-core/playwright` ya instalado).
- **Metas**: p95 < 300 ms lectura de menú (constitución IV) y SC-001/SC-002; **no se afirman
  sin medición** (ver tasks T060).

## Constitution Check

| Principio            | Cumplimiento en el plan                                                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I Accesibilidad AAA  | Estado agotado con texto + icono; filtros con `fieldset/legend`; foco visible; objetivos ≥44 px; `prefers-reduced-motion`; axe en Playwright; prueba manual NVDA pendiente (documentada).                                                                    |
| II Seguridad         | Mutaciones solo vía `CatalogAuthorizer` inyectable; **deny-by-default** hasta Spec #2; sin header `x-role`, sin bypass; público = solo versiones publicadas. ASVS: validación de entrada, errores genéricos, sin SQL concatenado (consultas parametrizadas). |
| III Datos personales | El catálogo no almacena PII. Auditoría guarda `actor_id` (identificador), nunca email/nombre.                                                                                                                                                                |
| IV Escalabilidad     | API sin estado; caché en Redis; precio calculado servidor; snapshot contractual para pedidos. Stock decrementa por evento de Orders (stub, ver Dependencias).                                                                                                |
| V Límites de módulo  | Solo `@cafeteria/contracts`; esquema `catalog` propio; migraciones en `modules/catalog/migrations`.                                                                                                                                                          |
| VI Calidad           | TDD en reglas puras (dinero, horarios, publicación, diff, concurrencia); integración con Testcontainers (Postgres+Redis); E2E+axe. Cobertura ≥80 % del código nuevo a medir.                                                                                 |
| VII Commits          | Un cambio lógico por commit, scope `catalog`/`docs`/`web`; migraciones aditivas (expand/contract).                                                                                                                                                           |

Sin violaciones; Complexity Tracking vacío.

## Arquitectura (apps/api/src/modules/catalog)

```text
catalog.module.ts
domain/
  money.ts                  # validación/formatos de centavos
  allergens.ts              # lista cerrada (códigos)
  schedule.ts               # franjas, zona horaria, isOpenAt / nextOpening
  menu-snapshot.ts          # tipos del snapshot + builder puro
  publish-validation.ts     # FR-004 (alt, alérgenos, >=1 producto, precio)
  version-diff.ts           # "qué cambió" entre versiones
  revision.ts               # control optimista (If-Match / ETag)
  public-view.ts            # composición pública: horario, dedupe, filtros, disponibilidad
  authorization.ts          # Permission, Actor, CatalogAuthorizer (port) + DenyAll
application/                # casos de uso (draft, publish, restore, availability, public query)
infrastructure/
  database.ts               # Pool `pg` propio (DATABASE_URL)
  *-repository.ts           # SQL parametrizado, transacciones
  public-cache.ts           # Redis: epoch + TTL 5 s
controllers/
  public-menu.controller.ts # GET /api/v1/catalog/menus, /products/:id
  admin-*.controller.ts     # /api/v1/catalog/admin/...
migrations/                 # 2026MMDDHHMMSS_*.ts
tests/                      # unit + integration
```

Web (`apps/web/src/features/catalog`, rutas `apps/web/src/app/menu/**` y `app/admin/catalogo/**`):
`api.ts`, componentes `MenuView`, `AllergenFilter`, `ProductCard`, `AvailabilityBadge`.
Administración (`features/catalog/admin/`): `client.ts` (cliente de API desacoplado, `AdminCatalogClient`,
mapea 401/403/404/409/422/428 a estados de UI), `session.ts` (reenvía solo la cookie/`Authorization` de la
persona; nunca fabrica identidad), `forms.ts`/`outcome.ts` (lectura de formularios y estado de acciones),
`actions.ts` (acciones de servidor), `components/` (`ActionForm`, `StateNotice`, `LoadFailure`, campos, historial).
Páginas: `app/admin/catalogo/` (menús), `[menuId]` (editor, publicar, historial), `[menuId]/vista-previa`,
`productos` (contenido y disponibilidad). No se edita `layout.tsx` ni la navegación global.

## Decisiones clave (detalle en research.md)

1. **Contenido versionado vs. estado operativo**: la tienda lee el snapshot inmutable de la
   versión vigente y superpone disponibilidad/existencias _vivas_ de `catalog.products`. Así el
   personal cambia agotado sin publicar (US4) y el precio/contenido solo cambia publicando (US3).
2. **Publicación atómica**: una transacción: `SELECT … FOR UPDATE` del menú, comprobar `revision`,
   validar, insertar `menu_versions`, actualizar puntero y estado, escribir auditoría; **después**
   del commit incrementar el epoch de caché en Redis.
3. **Concurrencia**: `revision` entero por menú (y por producto) expuesto como `ETag`; mutaciones
   exigen `If-Match`; `UPDATE … WHERE revision = $n` y 0 filas ⇒ `409 conflict` sin sobrescribir.
4. **Restaurar** = publicar de nuevo el snapshot de una versión anterior como versión N+1
   (nunca se muta ni borra una versión).
5. **Caché <10 s**: API `Cache-Control: public, max-age=0, s-maxage=3`; Redis clave
   `catalog:public:{epoch}` TTL 5 s + invalidación por epoch al publicar/cambiar disponibilidad.
   Peor caso sin invalidación (Redis caído) ≈ 5+3 = 8 s; Next `revalidate: 3`.
6. **Autorización**: token `CATALOG_AUTHORIZER`; implementación por defecto `DenyAllAuthorizer`.
   Spec #2 aportará la real. Mocks solo en tests.

## Endpoints

Ver [contracts/rest-api.md](contracts/rest-api.md). Modelo en [data-model.md](data-model.md).

## Amenazas (STRIDE resumido)

| Amenaza                           | Mitigación                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| Fuga de borradores                | Rutas públicas leen solo `menu_versions`; test de no-filtración.                      |
| Escalada (personal cambia precio) | Permisos por acción en servidor; test 403 en US4.3.                                   |
| Spoofing de rol                   | Sin headers de confianza; deny-by-default sin autoridad.                              |
| Tampering de versiones            | Trigger que rechaza UPDATE/DELETE en `menu_versions` y `audit_log`.                   |
| Inyección / XSS                   | SQL parametrizado; React escapa; URLs de imagen validadas (`https:` o ruta relativa). |
| Lost update                       | `revision` + `If-Match` + 409.                                                        |
| DoS por listados                  | Paginación acotada en admin; público cacheado; límites de longitud.                   |

## Dependencias externas / stubs

| Depende de                                         | Estado       | Tratamiento                                                                                                                                                                                                                                             |
| -------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec #2 Identity (roles `admin`/`staff`, guard)    | No integrado | Port + deny-by-default; tests con mock. **Pruebas de autorización efectiva pendientes.**                                                                                                                                                                |
| Spec #6 Orders (snapshot, decremento de stock)     | No existe    | Contrato propuesto (shared-contracts-proposal.md); método `applyConfirmedSale` implementado y probado de forma aislada (tabla `stock_consumptions` idempotente); sin verificar con Orders. SC-004/US3.2 **no** se declaran cumplidos extremo a extremo. |
| Spec #4 Cart                                       | No existe    | Solo exponemos `available` y `ProductSummary`.                                                                                                                                                                                                          |
| Contratos compartidos / `.env.example` / manifests | Líder        | Parches propuestos, no aplicados.                                                                                                                                                                                                                       |

## Estrategia de pruebas

Unitarias (Jest, puras): dinero, horarios (borde 07:00/11:00, medianoche, zona), validación de
publicación, diff, dedupe, filtros, revisión. Integración (Testcontainers): migraciones desde BD
vacía, publicación atómica, inmutabilidad (trigger), concurrencia con dos transacciones, caché
Redis y epoch. Web: Vitest (componentes), Playwright+axe (tienda, filtro por teclado).
