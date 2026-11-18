# Contrato de límites e integración de módulos

## Ownership y rutas

| Spec | NestJS | Next.js feature | API base |
|---|---|---|---|
| Spec #2 | `apps/api/src/modules/identity/`, `customers/` | `apps/web/src/features/identity/`, `apps/web/src/features/customers/` | `/api/v1/identity`, `/api/v1/customers` |
| Spec #3 | `apps/api/src/modules/catalog/` | `apps/web/src/features/catalog/` | `/api/v1/catalog` |
| Spec #5 | `apps/api/src/modules/promotions/` | `apps/web/src/features/promotions/` | `/api/v1/promotions` |

Los módulos `identity`, `customers`, `catalog` y `promotions` son creados y preregistrados en NestJS por Spec #1. Cada implementación posterior modifica su carpeta asignada y tests propios. `app.module.ts` queda estable tras Spec #1: no añadir providers/controladores importando archivos internos de otro módulo ni cambiar la raíz para agregar funcionalidades ya pre-registradas.

## Estructura NestJS por módulo

```text
apps/api/src/modules/<module>/
  <module>.module.ts
  controllers/       # HTTP adapter, rutas versionadas
  application/       # Casos de uso y orquestación
  domain/            # Modelo/reglas propias del dominio
  infrastructure/    # Adaptadores y persistencia del schema propio
  migrations/        # Solo migraciones del schema dueño
  tests/             # Unitarias e integración del módulo
```

Imports cruzados solo mediante exports públicos de `@cafeteria/contracts` o ports definidos allí. No se accede directamente a clases, repositorios ni tablas internas de otro módulo. ESLint boundaries bloquea imports de paths privados.

## Tipos compartidos de TypeScript

Exports iniciales bajo `packages/contracts/src/`:

- `identity/identity-reference.ts`: `IdentityReference` con identificador y roles; no incluye credenciales.
- `customers/customer-reference.ts`: `CustomerReference` solo contiene ID, nunca PII.
- `catalog/product.ts`: `ProductSummary` con `productId`, nombre visible, `unitPrice: Money` y estado de disponibilidad.
- `pricing/money.ts`: `Money { amountMinor: number; currency: 'USD' }`; `amountMinor` es entero en centavos, sin coma flotante.
- `pricing/quote.ts`: `PriceQuote` con product ID, cantidad, unit price, subtotal, discount, total y `calculatedAt`; todos los importes son `Money` y los valores son calculados por servidor.
- `ports/catalog.port.ts`: interfaz de lectura `CatalogPort` que retorna el contrato público, no entidades de persistencia.
- `ports/pricing.port.ts`: interfaz `PricingPort` que recibe referencia de producto/cantidad y devuelve `PriceQuote`.

Producto y precio se definen antes de implementar los módulos. Catálogo conserva ownership del producto y Promociones del cálculo; los dos equipos pueden implementar aislados contra este contrato. Una modificación pública es aditiva dentro de PR revisado por el integrador y requiere que los consumers actualicen/rebasen después.

## Convenciones

- Paquetes, módulos, directorios y nombres de migración en kebab-case/lowercase.
- Rutas versionadas `/api/v1/<module>`; recursos en plural, cuerpos/errores documentados por DTO público.
- Imports internos usan aliases públicos del paquete. Imports a `apps/api/src/modules/<other-module>/**` son inválidos.
- Cada workspace declara sus dependencias en su propio `package.json`; raíz, configuración y lockfile se integran por el líder para evitar writes concurrentes.
