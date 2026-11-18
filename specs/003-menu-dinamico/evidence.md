# Evidencia de verificación — Spec 3 (Menú dinámico)

Rama `feature/spec-3`, base `e0b90e6`. Entorno: Windows 11, pnpm 10.12.4, Docker 29.0.1.
Fecha: 2026-11-17. Todo lo de abajo se ejecutó en esta copia de trabajo.

**Node.** El proyecto pide 24.x. La máquina tiene 22.21.0; la verificación final se repitió con **Node 24.22.3**, obtenido como binario del paquete npm `node` (sin instalarlo en el sistema) y puesto primero en el `PATH` solo para esos comandos. La primera ronda (lote anterior) se hizo con 22.21.0 y también estaba en verde.

## Comandos y resultados (Node 24.22.3, sin caché de turbo)

| Comando                                                                                          | Resultado                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec turbo run lint typecheck test --force`                                                | 18/18 tareas OK. API: 123 pruebas OK + 1 omitida (rendimiento, opt-in); web: 4 archivos / 36 pruebas                                                                                                                                        |
| `pnpm exec turbo run build --force`                                                              | 6/6 OK (rutas `/menu`, `/admin/catalogo`, `/admin/catalogo/[menuId]`, `.../vista-previa`, `.../productos` dinámicas)                                                                                                                        |
| `pnpm test:ci`                                                                                   | OK                                                                                                                                                                                                                                          |
| `pnpm --filter @cafeteria/api test:integration` / `@cafeteria/worker test:integration`           | 5/5 y 1/1                                                                                                                                                                                                                                   |
| `pnpm --filter @cafeteria/api test:e2e`                                                          | 2/2                                                                                                                                                                                                                                         |
| `pnpm db:migrate` contra un Postgres 17 desechable (contenedor propio, ya eliminado)             | Aplica `20261117150000_catalog-schema` y `20261118120000_catalog-stock-consumption`; segunda ejecución «No migrations to run»; 14 alérgenos; tabla `catalog.stock_consumptions` presente                                                    |
| E2E menú público (stub, Node 22): `CATALOG_E2E_STUB=1 ... playwright test catalog-menu`          | 6/6: axe A/AA/AAA (contraste 7:1 evaluado), agotado/fuera de horario con texto, teclado, foco, **estado vacío**, **estado de error**                                                                                                        |
| E2E administración (stub, Node 22): `CATALOG_E2E_ADMIN_STUB=1 ... playwright test catalog-admin` | 8/8: axe A/AA/AAA en 3 pantallas, 401 vs 403, vacío, servicio caído, reenvío de cookie + `If-Match` + sin `x-role`, 409, publicación bloqueada con detalle, historial + advertencia + confirmación de restaurar, disponibilidad con teclado |
| Mismos E2E sin la variable `CATALOG_E2E_*_STUB`                                                  | Se omiten (no rompen CI)                                                                                                                                                                                                                    |

Los E2E de Playwright se ejecutaron con Node 22.21.0 (lote anterior a la verificación con Node 24); no se repitieron con 24.

## Pruebas del lote actual

- `tests/stock-and-cache.spec.ts` (Postgres + Redis reales, 7 pruebas, repetida 3 veces seguidas en Node 24 tras corregir una aserción de orden en mi propia prueba): descuento idempotente, todo o nada, concurrencia (12 ventas/5 unidades ⇒ 5; 8 envíos del mismo `saleId` ⇒ 1), auditoría, TTL ≤ 5 s con expiración real, lectura pública y escrituras con Redis detenido.
- `tests/catalog.http.spec.ts` (15 pruebas): se añadió la advertencia de restauración y «publicar el borrador tras restaurar» (v1 restaurada como v3 a 250; borrador publicado como v4 a 300) y el acceso de personal a `GET /admin/products` (200) pero no a `GET /admin/menus` (403).
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
2. **`Money` local**: provisional; se eliminará cuando el líder resuelva `@cafeteria/contracts` en la API.
3. **Nombres de rol `admin`/`staff`**: supuesto a confirmar con Identity (Spec #2).
4. **Lista de alérgenos**: pendiente de validar con la normativa ecuatoriana de etiquetado.
5. **El personal puede listar productos** (`GET /admin/products` pasó a `catalog.availability.write`) porque necesita ver existencias; sigue sin poder editarlos ni ver menús.
6. **La UI de administración reenvía a la API solo la cookie/`Authorization` de la propia petición**. No fabrica identidad ni usa cabeceras de rol; sin credenciales válidas la API responde 401 y la UI lo muestra. La forma final de la sesión la define Identity.
7. **Stale-while-revalidate del menú público**: si la API falla, la página sigue mostrando la última respuesta cacheada y solo muestra el error si no hay copia.
8. **`applyConfirmedSale` rechaza con 409 si falta stock** (no deja negativos ni vende de más); la política de Orders ante ese rechazo está por acordar.

## Hallazgos heredados (no introducidos por este spec)

El baseline documenta GHSA-fc5q-39xc-vjpf (picomatch). No se ejecutó la auditoría de dependencias ni se tocó configuración de seguridad; este spec no añade dependencias.

## Pendiente de acción humana o de otros specs

- Prueba manual con NVDA/VoiceOver y revisión visual (Constitución I).
- Medición de carga representativa (SC-001/SC-002).
- Identity (Spec #2): `CATALOG_AUTHORIZER` real, nombres de rol, forma de la sesión web→API; luego E2E con sesiones auténticas.
- Orders (Spec #6): integrar `applyConfirmedSale`/`StockConsumptionPort` y el snapshot del pedido (US3.2, SC-004, US4.2).
- Líder: mapeo de `@cafeteria/contracts` en la API, revisión de `ProductSnapshot`/`CatalogPort`, `.env.example` (`CAFETERIA_TIMEZONE`).
