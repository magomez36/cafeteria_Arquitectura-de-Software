# Evidencia de verificación — Spec 3 (Menú dinámico)

Rama `feature/spec-3`, base `e0b90e6`. Entorno: Windows 11, Node v22.21.0 (el proyecto pide 24.x), pnpm 10.12.4, Docker 29.0.1.
Fecha de ejecución: 2026-11-17. Todo lo de abajo se ejecutó en esta copia de trabajo.

## Comandos y resultados

| Comando                                                                                       | Resultado                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint` (raíz)                                                                            | 6/6 tareas OK                                                                                                                                                                               |
| `pnpm typecheck` (raíz)                                                                       | 6/6 OK                                                                                                                                                                                      |
| `pnpm test` (raíz)                                                                            | OK. API: 116 pruebas (incluye 7 de esquema y 15 HTTP con Postgres+Redis reales); web: 2 archivos / 14 pruebas                                                                               |
| `pnpm build` (raíz)                                                                           | 6/6 OK (`/menu` aparece como ruta dinámica)                                                                                                                                                 |
| `pnpm --filter @cafeteria/api test:integration`                                               | 5/5 (pruebas del líder, siguen verdes con mi migración)                                                                                                                                     |
| `pnpm --filter @cafeteria/api test:e2e`                                                       | 2/2 (`AppModule` arranca sin BD: la infraestructura del catálogo es perezosa)                                                                                                               |
| E2E web: `CATALOG_E2E_STUB=1 WEB_BASE_URL=http://127.0.0.1:3100 playwright test catalog-menu` | 4/4: axe (wcag2a/aa/21/22aa/**aaa**, comprobado que se evaluó `color-contrast-enhanced`), texto de agotado/fuera de horario, alt en imágenes, filtro operado solo con teclado, foco visible |
| Mismo E2E sin `CATALOG_E2E_STUB`                                                              | 4 omitidos (no rompe CI)                                                                                                                                                                    |

## Criterios de aceptación cubiertos

| Criterio             | Evidencia                                                                                      | Alcance real                         |
| -------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------ |
| US1.1–1.4            | `domain/public-view.spec.ts`, `tests/catalog.http.spec.ts`, `catalog.test.ts`, E2E             | API real con BD real; UI contra stub |
| US2.1–2.4            | `catalog.http.spec.ts` (borrador invisible, preview, bloqueo con detalle, publicación visible) | Sin UI admin                         |
| US3.1, 3.3, 3.4      | `catalog.http.spec.ts` (nueva versión, restaurar = v3, historial con autor/fecha/cambios)      | Sin UI                               |
| US3.2                | **No verificable**: requiere Orders (Spec #6). Solo se probó el contrato `GET /products/:id`   | Bloqueado                            |
| US4.1, 4.3           | `catalog.http.spec.ts`                                                                         | Con authorizer simulado en test      |
| US4.2                | **No implementado** (`applyConfirmedSale`)                                                     | Pendiente                            |
| FR-011               | Dos admin → 409; carrera de 5 → 1 gana                                                         | Cumplido a nivel API                 |
| FR-012               | Auditoría con actor y valores anterior/nuevo                                                   | Cumplido a nivel API                 |
| SC-002               | 21–25 ms publicar→visible, 1 muestra local                                                     | **No concluyente**                   |
| SC-001, p95 < 300 ms | Sin medir                                                                                      | Pendiente                            |

## Decisiones de implementación que conviene revisar

1. **Restaurar no modifica el borrador** (decisión confirmada por el líder; la respuesta incluye `warning` y el efecto de publicar el borrador después está probado): crea la versión N+1 con el contenido de la versión elegida; los productos y el borrador conservan sus valores actuales. Si alguien publica el borrador después, vuelve a publicar los valores nuevos. (Alternativa: restaurar también el borrador, pero afectaría a productos compartidos entre menús.)
2. **`Money` local**: la API no resuelve `@cafeteria/contracts` (CJS vs `exports` ESM sin mapeo en `tsconfig`/jest). Se pidió al líder el mapeo (contracts/shared-contracts-proposal.md §0).
3. **Nombres de rol `admin`/`staff`**: supuesto a confirmar con Integrante 2.
4. **Lista de alérgenos**: pendiente de validar con la normativa ecuatoriana de etiquetado.
5. **Node 22 vs 24**: esta máquina usa Node 22.21.0 y el proyecto pide 24.x; conviene repetir las pruebas con 24 antes del PR.

## Hallazgos heredados (no introducidos por este spec)

El baseline documenta GHSA-fc5q-39xc-vjpf (picomatch). No se ejecutó la auditoría de dependencias en esta sesión ni se tocó ninguna configuración de seguridad; este spec no añade dependencias.

## Pendiente de acción humana

- Prueba manual con NVDA/VoiceOver y revisión visual (Constitución I).
- Medición de carga representativa (SC-001/SC-002, p95).
- Confirmar con el líder: mapeo de `@cafeteria/contracts` en la API, parche `ProductSnapshot`/`CatalogPort`, `.env.example` (`CAFETERIA_TIMEZONE`).
- Integrar `CATALOG_AUTHORIZER` con Identity cuando Spec #2 esté lista (hoy toda ruta admin responde 401).
