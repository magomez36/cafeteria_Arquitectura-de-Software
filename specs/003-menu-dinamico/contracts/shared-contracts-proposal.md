# Propuesta al líder: cambios en archivos compartidos (NO aplicados)

Catálogo **no** modifica `packages/contracts/**`, manifests, lockfile, `.env.example`, `AppModule`.
Se avanza dentro de `modules/catalog/**` con tipos locales y se propone lo siguiente
(aditivo, compatible con consumidores actuales).

## 0. Resolución de `@cafeteria/contracts` desde la API (bloqueante menor)

Hoy `apps/api` (CommonJS, `moduleResolution: Node`) no resuelve `@cafeteria/contracts` (paquete ESM con `exports` a `.ts`): `ts-jest` falla con TS2307. Se pide al líder añadir en `apps/api/tsconfig.json` `paths` `"@cafeteria/contracts": ["../../packages/contracts/src/index.ts"]` y el `moduleNameMapper` equivalente en `jest.config.js` / `test/jest-integration.json` (igual que `@cafeteria/feature-flags`). Mientras tanto Catálogo usa un tipo `Money` local idéntico.

## 1. `packages/contracts/src/catalog/product.ts` (aditivo)

```ts
export interface ProductSnapshot {
  productId: string;
  menuVersionId: string; // versión publicada de la que se copió
  name: string;
  description: string;
  unitPrice: Money; // precio base, sin promociones
  allergens: readonly string[];
  capturedAt: string; // ISO-8601 UTC
}
```

## 2. `CatalogPort` (aditivo)

```ts
getPurchasableProduct(productId: string): Promise<ProductSnapshot | null>; // null si agotado/fuera de horario/retirado
```

Orders guarda esa copia en el pedido (constitución IV; SC-004). Catálogo garantiza que
`unitPrice` es entero en centavos y que el snapshot sale de una versión inmutable.

## 3. Evento/puerto de venta confirmada (para US4.2)

`StockConsumptionPort.consume(items: {productId, quantity}[], idempotencyKey)`; hasta que exista
Orders, Catálogo implementa internamente `CatalogService.applyConfirmedSale(saleId, lines)` (implementado y probado aislado; no expuesto por HTTP).
Semántica: idempotente por `saleId`; todo o nada; devuelve `{applied, soldOut[]}`; lanza conflicto (409) si falta stock. **Por acordar con Orders**: qué hace una venta confirmada si falta stock, y si `saleId` es el id del pedido.

## 4. Autorización (acordar con Integrante 2)

Port en contracts, p. ej. `AuthenticationPort.authenticate(headers): Promise<IdentityReference | null>`
y nombres de rol (`admin`, `staff`). Catálogo inyecta `CATALOG_AUTHORIZER`; mientras tanto deny-by-default.

## 5. Infraestructura

- `.env.example`: `CAFETERIA_TIMEZONE=America/Guayaquil` (opcional; hay default en código).
- Caché: se usa el `redis` ya declarado en `apps/api`; no se piden cambios de Compose.
- Web: si se quiere `revalidate` por tag desde la API, requiere secreto compartido de revalidación
  (variable de entorno nueva) — **decisión del líder**; el plan funciona sin ella (`revalidate: 3`).
