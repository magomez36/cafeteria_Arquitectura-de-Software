# Propuesta al líder: cambios en archivos compartidos (NO aplicados)

Catálogo **no** modifica `packages/contracts/**`, manifests, lockfile, `.env.example`, `AppModule`.
Se avanza dentro de `modules/catalog/**` con tipos locales y se propone lo siguiente
(aditivo, compatible con consumidores actuales).

## 0. Resolución de `@cafeteria/contracts` desde la API — RESUELTO

El líder lo corrigió en `b4309f8` (`feature/spec-1`), integrado en esta rama por `cherry-pick` autorizado (sin conflictos). Catálogo ya importa `Money` de `@cafeteria/contracts`; la copia local desapareció (los helpers de validación de precio siguen en `domain/money.ts` porque son lógica de Catálogo, no del contrato).

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

## 6. Decisiones abiertas para acordar (no implementadas; `packages/contracts` sin tocar)

### 6.1 Cómo identificar un producto y su versión publicada

Hecho hoy en la API: `GET /products/:id` devuelve `productId` + `menuVersionId` (id de la **versión del menú**, no del producto) y el precio base. El precio vive en el producto y queda congelado dentro de la versión de menú publicada (inmutable).

Puntos a decidir:

1. **Un producto puede estar en varios menús** publicados a la vez, cada uno con su versión. Hoy se elige el primer candidato comprable. Opciones:
   - **A (recomendada)**: la referencia de compra es el par `(productId, menuVersionId)`; Cart/Orders reciben ambos en el snapshot y vuelven a pedir ese par al confirmar. Sin cambios de esquema.
   - B: exigir que el cliente indique el menú (`menuId`) al añadir al carrito; Catálogo resuelve la versión.
   - C: introducir un `productVersionId` propio (más preciso, requiere migración y cambia el modelo).
2. **Qué garantiza el snapshot**: precio, nombre, descripción y alérgenos copiados de una versión inmutable, con `capturedAt`. Orders guarda el snapshot completo; no vuelve a consultar el precio tras confirmar (SC-004).
3. **Validez de la referencia**: ¿se acepta confirmar con un `menuVersionId` que ya no es el vigente? Propuesta: sí hasta un TTL del carrito acordado con Spec #4/#6, siempre que el producto siga comprable; si cambió el precio, el carrito avisa.

### 6.2 Consumo de existencias desde Orders

Hecho hoy: `CatalogService.applyConfirmedSale(saleId, lines)`, idempotente por `saleId`, todo o nada, 409 si falta stock, invalida la caché; probado aislado. No se expone por HTTP.

Puntos a decidir:

1. **`saleId`**: propuesta, el id del pedido (estable entre reintentos; la clave idempotente).
2. **Mecanismo**: llamada de puerto en proceso (`StockConsumptionPort.consume`) dentro del monolito, o evento vía outbox + cola (más acorde a la arquitectura objetivo y desacopla Orders de la latencia de Catálogo). Propuesta: outbox/cola con Catálogo como consumidor idempotente.
3. **Falta de stock al confirmar** (409): ¿Orders cancela y devuelve el pago, o acepta con backorder? Es política de Orders/Pagos; Catálogo nunca deja existencias negativas.
4. **Cancelación/devolución**: no existe la operación inversa (reponer stock). Hay que decidir si se necesita y con qué idempotencia.
5. **Forma de la respuesta**: `{applied, soldOut[]}`; confirmar que Orders solo necesita eso.
