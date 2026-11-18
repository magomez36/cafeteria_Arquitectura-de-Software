import { Pool } from 'pg';

export const CATALOG_POOL = Symbol('CATALOG_POOL');

/** Pool perezoso: `pg` no abre conexiones hasta la primera consulta (el arranque no depende de la BD). */
export function createCatalogPool(): Pool {
  return new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
}
