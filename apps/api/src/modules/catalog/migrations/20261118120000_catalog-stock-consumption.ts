import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Expand-only: registro de ventas ya descontadas del inventario. La clave primaria (sale_id) es lo que
 * hace idempotente el descuento: reintentar la misma venta confirmada no vuelve a restar existencias.
 */
export const up = (pgm: MigrationBuilder): void => {
  pgm.sql(`
    CREATE TABLE catalog.stock_consumptions (
      sale_id text PRIMARY KEY CHECK (char_length(sale_id) BETWEEN 1 AND 100),
      lines jsonb NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TRIGGER stock_consumptions_append_only
      BEFORE UPDATE OR DELETE ON catalog.stock_consumptions
      FOR EACH ROW EXECUTE FUNCTION catalog.forbid_mutation();
  `);
};

/** Solo para desarrollo/pruebas. */
export const down = (pgm: MigrationBuilder): void => {
  pgm.sql('DROP TABLE IF EXISTS catalog.stock_consumptions;');
};
