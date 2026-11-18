# Contrato REST: `/api/v1/catalog`

Errores: `{ "error": { "code": "...", "message": "..." , "details"?: [...] } }` (mensajes en español, sin
trazas). Códigos: `validation_failed` 422, `unauthenticated` 401, `forbidden` 403, `not_found` 404,
`conflict` 409, `precondition_required` 428, `publish_blocked` 422.

## Público (sin sesión; solo versiones publicadas)

| Método | Ruta                                                 | Respuesta                                                                                                                                                                                                                                                                                                                                                                              |
| ------ | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/menus?category=<id>&excludeAllergens=leche,gluten` | `{ generatedAt, timezone, allergens: [{code,label}] (lista cerrada), menus: [{ id, name, versionNumber, notice, availability: { availableNow, nextAvailableAt \| null, schedule }, categories: [{ id, name, products: [{ productId, name, description, unitPrice: Money, imageUrl, imageAlt, allergens: [{code,label}], availability: 'available'\|'sold_out', purchasable }] }] }] }` |
| GET    | `/products/:productId`                               | `ProductSummary` + `menuVersionId` (para Cart/Orders) o 404                                                                                                                                                                                                                                                                                                                            |

- `purchasable = availableNow del menú && availability == 'available'`.
- Menús solapados: se devuelven ambos; dentro de cada categoría con el mismo nombre un `productId` aparece una vez.
- Cabeceras: `Cache-Control: public, max-age=0, s-maxage=3`. `excludeAllergens` con código desconocido ⇒ 422.
- **Nunca** devuelve borradores, `revision`, `createdBy`, existencias exactas ni auditoría.

## Administración (requiere `CatalogAuthorizer`; deny-by-default)

| Método          | Ruta                                                                                        | Permiso                      |
| --------------- | ------------------------------------------------------------------------------------------- | ---------------------------- |
| GET/POST        | `/admin/menus`                                                                              | `catalog.menu.write`         |
| GET/PUT         | `/admin/menus/:id` (`If-Match` en PUT; `ETag` en GET)                                       | `catalog.menu.write`         |
| PUT             | `/admin/menus/:id/schedule`                                                                 | `catalog.menu.write`         |
| POST/PUT/DELETE | `/admin/menus/:id/categories[/:categoryId]`, `/items`                                       | `catalog.menu.write`         |
| GET             | `/admin/menus/:id/preview` (misma forma que público, desde el borrador)                     | `catalog.menu.write`         |
| POST            | `/admin/menus/:id/publish` (`If-Match`) ⇒ 201 versión / 422 `publish_blocked` con `details` | `catalog.menu.write`         |
| POST            | `/admin/menus/:id/retire`                                                                   | `catalog.menu.write`         |
| GET             | `/admin/menus/:id/versions` (historial: quién, cuándo, `changes`)                           | `catalog.audit.read`         |
| POST            | `/admin/menus/:id/versions/:n/restore`                                                      | `catalog.menu.write`         |
| GET             | `/admin/products`                                                                           | `catalog.availability.write` |
| POST/PUT        | `/admin/products[/:id]` (`If-Match` en PUT)                                                 | `catalog.menu.write`         |
| PATCH           | `/admin/products/:id/availability` `{ availability?, stockQuantity? }`                      | `catalog.availability.write` |

PATCH de disponibilidad rechaza (422) cualquier otro campo, de modo que personal no puede tocar precio.

## Restaurar una versión: advertencia al administrador

`POST /admin/menus/:id/versions/:n/restore` responde `201` con `{ versionNumber, ..., warning }`. La restauración publica
el contenido de la versión elegida como versión N+1, pero **no modifica el borrador ni los productos compartidos**.
`warning` debe mostrarse tal cual en la UI de administración: si después se publica el borrador, se vuelven a publicar
los valores actuales y se reemplaza el contenido restaurado (cubierto en `tests/catalog.http.spec.ts`: restaurar v1 ⇒ v3 a 250;
publicar el borrador ⇒ v4 a 300).
