import type { MigrationBuilder } from 'node-pg-migrate';

/** Expand-only: crea el esquema propio del módulo Catálogo; no toca otros esquemas. */
export const up = (pgm: MigrationBuilder): void => {
  pgm.sql(`
    CREATE SCHEMA IF NOT EXISTS catalog;

    CREATE TABLE catalog.allergens (
      code text PRIMARY KEY,
      label_es text NOT NULL
    );
    INSERT INTO catalog.allergens (code, label_es) VALUES
      ('gluten', 'Cereales con gluten'), ('crustaceos', 'Crustáceos'), ('huevo', 'Huevo'),
      ('pescado', 'Pescado'), ('mani', 'Maní'), ('soya', 'Soya'), ('leche', 'Leche y lácteos'),
      ('frutos_secos', 'Frutos secos'), ('apio', 'Apio'), ('mostaza', 'Mostaza'),
      ('sesamo', 'Sésamo'), ('sulfitos', 'Sulfitos'), ('moluscos', 'Moluscos'),
      ('altramuces', 'Altramuces');

    CREATE TABLE catalog.products (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
      description text NOT NULL CHECK (char_length(description) <= 500),
      price_minor integer NOT NULL CHECK (price_minor BETWEEN 0 AND 10000000),
      currency char(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
      image_url text NULL CHECK (image_url IS NULL OR image_url ~ '^(https://|/)'),
      image_alt text NULL CHECK (image_alt IS NULL OR char_length(image_alt) <= 300),
      allergens text[] NOT NULL DEFAULT '{}',
      allergens_declared boolean NOT NULL DEFAULT false,
      availability text NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'sold_out')),
      stock_quantity integer NULL CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
      revision integer NOT NULL DEFAULT 1,
      archived_at timestamptz NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE catalog.menus (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
      status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'retired')),
      revision integer NOT NULL DEFAULT 1,
      current_version_id uuid NULL,
      created_by text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE catalog.menu_versions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      menu_id uuid NOT NULL REFERENCES catalog.menus(id),
      version_number integer NOT NULL CHECK (version_number >= 1),
      snapshot jsonb NOT NULL,
      changes jsonb NOT NULL DEFAULT '[]'::jsonb,
      published_by text NOT NULL,
      published_at timestamptz NOT NULL DEFAULT now(),
      restored_from_version integer NULL,
      UNIQUE (menu_id, version_number)
    );

    ALTER TABLE catalog.menus
      ADD CONSTRAINT menus_current_version_fk
      FOREIGN KEY (current_version_id) REFERENCES catalog.menu_versions(id);

    CREATE TABLE catalog.menu_schedule_slots (
      menu_id uuid NOT NULL REFERENCES catalog.menus(id) ON DELETE CASCADE,
      day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
      starts_at time NOT NULL,
      ends_at time NOT NULL,
      CHECK (ends_at > starts_at)
    );

    CREATE TABLE catalog.menu_categories (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      menu_id uuid NOT NULL REFERENCES catalog.menus(id) ON DELETE CASCADE,
      name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
      position integer NOT NULL DEFAULT 0
    );

    CREATE TABLE catalog.menu_items (
      category_id uuid NOT NULL REFERENCES catalog.menu_categories(id) ON DELETE CASCADE,
      product_id uuid NOT NULL REFERENCES catalog.products(id),
      position integer NOT NULL DEFAULT 0,
      PRIMARY KEY (category_id, product_id)
    );

    CREATE TABLE catalog.audit_log (
      id bigserial PRIMARY KEY,
      entity text NOT NULL,
      entity_id uuid NOT NULL,
      action text NOT NULL,
      actor_id text NOT NULL,
      changes jsonb NOT NULL DEFAULT '{}'::jsonb,
      occurred_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE FUNCTION catalog.forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'catalog.% es de solo anexar: no se permite % ', TG_TABLE_NAME, TG_OP
        USING ERRCODE = 'restrict_violation';
    END;
    $$;

    CREATE TRIGGER menu_versions_immutable
      BEFORE UPDATE OR DELETE ON catalog.menu_versions
      FOR EACH ROW EXECUTE FUNCTION catalog.forbid_mutation();
    CREATE TRIGGER audit_log_append_only
      BEFORE UPDATE OR DELETE ON catalog.audit_log
      FOR EACH ROW EXECUTE FUNCTION catalog.forbid_mutation();

    CREATE INDEX menu_versions_menu_idx ON catalog.menu_versions (menu_id, version_number DESC);
    CREATE INDEX menus_published_idx ON catalog.menus (status) WHERE status = 'published';
    CREATE INDEX audit_log_entity_idx ON catalog.audit_log (entity, entity_id, occurred_at DESC);
  `);
};

/** Solo para entornos de desarrollo/pruebas: en producción se deshace con una migración nueva. */
export const down = (pgm: MigrationBuilder): void => {
  pgm.sql('DROP SCHEMA IF EXISTS catalog CASCADE;');
};
