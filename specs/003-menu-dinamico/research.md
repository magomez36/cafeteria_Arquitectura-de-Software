# Research y decisiones: Menú dinámico

## D1 — Snapshot JSONB vs. tablas versionadas

**Decisión**: `menu_versions.snapshot JSONB` inmutable (categorías, productos, precios en centavos,
alérgenos, horario). **Alternativas**: tablas de producto con `valid_from/valid_to` (más joins en el
camino caliente, más difícil garantizar inmutabilidad). JSONB permite servir el menú con una sola
lectura y es la copia que Orders puede referenciar (`menuVersionId`).

## D2 — Dinero

Enteros en centavos (`price_minor integer CHECK (>=0)`), igual que `Money` del contrato. Nunca float.

## D3 — Disponibilidad fuera del snapshot

Agotado/existencias cambian durante el día y las edita el personal (sin permiso de precios, FR-009).
Se guardan en `catalog.products` y se superponen en lectura. Un producto sin fila viva (borrado)
se trata como no disponible.

## D4 — Horario y zona horaria

Franjas `(día ISO 1–7, inicio, fin)` en hora local de la cafetería. Se evalúa convirtiendo el
instante UTC con `Intl.DateTimeFormat` y `timeZone`. Intervalo semiabierto `[inicio, fin)`.
Franjas que cruzan medianoche se modelan como dos franjas (validación rechaza fin ≤ inicio).
Menú sin franjas = siempre vigente. Cálculo de `nextAvailableAt` buscando hasta 7 días adelante.

## D5 — Concurrencia optimista

`revision` + `ETag` débil `W/"<revision>"`; `If-Match` obligatorio en mutaciones (428 si falta,
409 si no coincide). Elegido sobre locks pesimistas por la UX de edición larga.

## D6 — Caché

Redis guarda el JSON público compuesto por `epoch`; publicar/restaurar/retirar y cambiar
disponibilidad hacen `INCR catalog:epoch`. TTL 5 s como red de seguridad. Si Redis falla, se lee
de Postgres (degradación, no error). CDN/Next: `s-maxage=3`. La metrica SC-002 se mide en T061.

## D7 — Autorización

Port `CatalogAuthorizer.authorize(request, permission): Promise<Actor>` lanza 401/403.
Permisos: `catalog.menu.write` (admin), `catalog.availability.write` (admin, staff),
`catalog.audit.read` (admin). Los nombres de rol (`admin`, `staff`) son **supuesto** a confirmar
con Integrante 2 (`IdentityReference.roles` es `string[]`). Por defecto `DenyAllAuthorizer`.

## D8 — Alérgenos

Lista cerrada de códigos (gluten, crustáceos, huevo, pescado, maní, soya, leche, frutos secos,
apio, mostaza, sésamo, sulfitos, moluscos, altramuces). **Pendiente de validar** contra la
normativa de etiquetado ecuatoriana vigente (RTE INEN 022); queda en una tabla para poder
ajustarla por migración. Distinción "sin información" (`allergens_declared = false`) vs.
"declarado sin alérgenos" (`true` + lista vacía): solo lo segundo es publicable (FR-004/SC-005).

## D9 — Sin dependencias nuevas

No se editan manifests (restricción de coordinación). Validación manual de DTO; se propondrá al
líder `zod` si se desea un esquema compartido.

## D10 — Imágenes

Se guarda URL (`https://` o ruta relativa `/…`) + `image_alt` obligatorio para publicar. La subida
de ficheros queda fuera de este spec (supuesto: URLs de almacenamiento externo); anotado como
pendiente para decisión del equipo.
