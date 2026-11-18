# Modelo de datos: esquema `catalog`

Migraciones en `apps/api/src/modules/catalog/migrations/` (timestamp UTC, aditivas).

## Tablas

**allergens** `code text PK`, `label_es text NOT NULL`. Lista cerrada sembrada por migración.

**products** `id uuid PK`, `name text NOT NULL (1..120)`, `description text NOT NULL (<=500)`,
`price_minor integer NOT NULL CHECK (>=0)`, `currency char(3) NOT NULL DEFAULT 'USD' CHECK ('USD')`,
`image_url text NULL`, `image_alt text NULL`, `allergens text[] NOT NULL DEFAULT '{}'`,
`allergens_declared boolean NOT NULL DEFAULT false`,
`availability text NOT NULL DEFAULT 'available' CHECK (in 'available','sold_out')`,
`stock_quantity integer NULL CHECK (>=0)`, `revision integer NOT NULL DEFAULT 1`,
`archived_at timestamptz NULL`, `created_at`, `updated_at`.

**menus** `id uuid PK`, `name text NOT NULL`, `status text NOT NULL DEFAULT 'draft'
CHECK (in 'draft','published','retired')`, `revision integer NOT NULL DEFAULT 1`,
`current_version_id uuid NULL → menu_versions`, `created_by text NOT NULL`, `created_at`, `updated_at`.

**menu_schedule_slots** `menu_id → menus ON DELETE CASCADE`, `day_of_week smallint CHECK 1..7`,
`starts_at time`, `ends_at time`, `CHECK (ends_at > starts_at)`. Horario del borrador.

**menu_categories** `id uuid PK`, `menu_id → menus`, `name text`, `position integer`.

**menu_items** `category_id → menu_categories`, `product_id → products`, `position integer`,
`PRIMARY KEY (category_id, product_id)`.

**menu_versions** (inmutable) `id uuid PK`, `menu_id → menus`, `version_number integer`,
`UNIQUE (menu_id, version_number)`, `snapshot jsonb NOT NULL`, `changes jsonb NOT NULL`
(diff frente a la versión anterior), `published_by text NOT NULL`, `published_at timestamptz NOT NULL`,
`restored_from_version integer NULL`. Trigger `BEFORE UPDATE OR DELETE` ⇒ excepción.

**audit_log** (append-only, mismo trigger) `id bigserial`, `entity text`, `entity_id uuid`,
`action text`, `actor_id text`, `changes jsonb`, `occurred_at timestamptz DEFAULT now()`.
Registra cambios de precio/contenido (FR-012) con valor anterior y nuevo; sin PII.

## Forma del snapshot (`menu_versions.snapshot`)

```json
{ "menu": { "id", "name", "schedule": [{ "dayOfWeek": 1, "startsAt": "07:00", "endsAt": "11:00" }] },
  "categories": [{ "id", "name", "position",
    "products": [{ "productId", "name", "description", "priceMinor": 350, "currency": "USD",
                   "imageUrl", "imageAlt", "allergens": ["leche"] }] }] }
```

## Transiciones del menú

`draft → published` (publicar) · `published → published` (nueva versión) · `published → retired`
(retirar; versiones se conservan) · `retired → published` (restaurar/republicar). Restaurar crea
versión N+1 con `restored_from_version`.

## Reglas / invariantes

- Un precio solo cambia en `products` por permiso `catalog.menu.write`; cada cambio genera `audit_log`.
- Publicable ⇔ ≥1 producto, todos con `image_alt` no vacío, `allergens_declared = true`, precio válido.
- `stock_quantity = 0` ⇒ `availability = 'sold_out'` (aplicado en dominio y en `applyConfirmedSale`).
