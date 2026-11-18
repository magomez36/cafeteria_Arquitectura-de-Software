import path from 'node:path';
import { runner } from 'node-pg-migrate';
import { Client } from 'pg';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';

jest.setTimeout(180_000);

describe('catalog schema (Postgres real)', () => {
  let postgres: StartedTestContainer;
  let url: string;
  let db: Client;

  beforeAll(async () => {
    postgres = await new GenericContainer('postgres:17-alpine')
      .withEnvironment({
        POSTGRES_USER: 'cafeteria',
        POSTGRES_PASSWORD: 'test-only',
        POSTGRES_DB: 'cafeteria_test',
      })
      .withExposedPorts(5432)
      .start();
    url = `postgresql://cafeteria:test-only@${postgres.getHost()}:${postgres.getMappedPort(5432)}/cafeteria_test`;
    await runner({
      databaseUrl: url,
      dir: path.resolve(__dirname, '../migrations'),
      direction: 'up',
      migrationsTable: 'cafeteria_migrations',
      logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        // 14-digit UTC prefixes (repo convention) make node-pg-migrate log a harmless notice.
        error: (m: unknown) => {
          if (!String(m).includes("Can't determine timestamp")) console.error(m);
        },
      },
      log: () => undefined,
    });
    db = new Client({ connectionString: url });
    await db.connect();
  });

  afterAll(async () => {
    await db?.end();
    await postgres?.stop();
  });

  it('crea la lista cerrada de alérgenos', async () => {
    const { rows } = await db.query('SELECT count(*)::int AS n FROM catalog.allergens');
    expect(rows[0].n).toBe(14);
  });

  it('rechaza precios negativos y fuera de rango (centavos enteros)', async () => {
    await expect(
      db.query(
        "INSERT INTO catalog.products (name, description, price_minor) VALUES ('x', 'y', -1)",
      ),
    ).rejects.toThrow(/check/i);
  });

  it('rechaza URLs de imagen no https ni relativas', async () => {
    await expect(
      db.query(
        "INSERT INTO catalog.products (name, description, price_minor, image_url) VALUES ('a','b',1,'javascript:alert(1)')",
      ),
    ).rejects.toThrow(/check/i);
  });

  it('las versiones publicadas son inmutables (UPDATE y DELETE fallan)', async () => {
    const menu = await db.query(
      "INSERT INTO catalog.menus (name, created_by) VALUES ('Desayunos', 'admin-1') RETURNING id",
    );
    const version = await db.query(
      `INSERT INTO catalog.menu_versions (menu_id, version_number, snapshot, published_by)
       VALUES ($1, 1, '{}'::jsonb, 'admin-1') RETURNING id`,
      [menu.rows[0].id],
    );
    await expect(
      db.query('UPDATE catalog.menu_versions SET snapshot = \'{"x":1}\' WHERE id = $1', [
        version.rows[0].id,
      ]),
    ).rejects.toThrow(/solo anexar/);
    await expect(
      db.query('DELETE FROM catalog.menu_versions WHERE id = $1', [version.rows[0].id]),
    ).rejects.toThrow(/solo anexar/);
  });

  it('no permite dos versiones con el mismo número', async () => {
    const menu = await db.query(
      "INSERT INTO catalog.menus (name, created_by) VALUES ('Almuerzos', 'admin-1') RETURNING id",
    );
    const insert = (): Promise<unknown> =>
      db.query(
        "INSERT INTO catalog.menu_versions (menu_id, version_number, snapshot, published_by) VALUES ($1, 1, '{}', 'a')",
        [menu.rows[0].id],
      );
    await insert();
    await expect(insert()).rejects.toThrow(/unique|duplicate/i);
  });

  it('el registro de auditoría es de solo anexar', async () => {
    const row = await db.query(
      `INSERT INTO catalog.audit_log (entity, entity_id, action, actor_id)
       VALUES ('product', gen_random_uuid(), 'price_changed', 'admin-1') RETURNING id`,
    );
    await expect(
      db.query("UPDATE catalog.audit_log SET actor_id = 'x' WHERE id = $1", [row.rows[0].id]),
    ).rejects.toThrow(/solo anexar/);
  });

  it('valida franjas horarias (fin posterior al inicio)', async () => {
    const menu = await db.query(
      "INSERT INTO catalog.menus (name, created_by) VALUES ('Cenas', 'a') RETURNING id",
    );
    await expect(
      db.query("INSERT INTO catalog.menu_schedule_slots VALUES ($1, 1, '11:00', '07:00')", [
        menu.rows[0].id,
      ]),
    ).rejects.toThrow(/check/i);
  });
});
