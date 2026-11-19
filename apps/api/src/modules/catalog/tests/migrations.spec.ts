import path from 'node:path';
import { runner } from 'node-pg-migrate';
import { Client } from 'pg';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';

jest.setTimeout(180_000);

/** Política del proyecto: migraciones idempotentes, reversibles en desarrollo y expand-only. */
describe('migraciones de catálogo (Postgres real): up, re-up, down y up de nuevo', () => {
  let postgres: StartedTestContainer;
  let url: string;

  const migrate = (direction: 'up' | 'down', count?: number): Promise<unknown> =>
    runner({
      databaseUrl: url,
      dir: path.resolve(__dirname, '../migrations'),
      direction,
      ...(count === undefined ? {} : { count }),
      migrationsTable: 'cafeteria_migrations',
      logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: (m: unknown) => {
          if (!String(m).includes("Can't determine timestamp")) console.error(m);
        },
      },
      log: () => undefined,
    });

  const tables = async (): Promise<string[]> => {
    const db = new Client({ connectionString: url });
    await db.connect();
    try {
      const r = await db.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'catalog' ORDER BY 1",
      );
      return r.rows.map((row) => row.table_name);
    } finally {
      await db.end();
    }
  };

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
  });

  afterAll(async () => postgres?.stop());

  it('up es idempotente, down revierte en orden inverso y se puede volver a aplicar', async () => {
    await migrate('up');
    const full = await tables();
    expect(full).toContain('stock_consumptions');
    expect(full).toContain('menus');

    await migrate('up'); // segunda ejecución: sin cambios
    expect(await tables()).toEqual(full);

    await migrate('down', 1); // la última migración (expand-only) se revierte sola
    const afterOne = await tables();
    expect(afterOne).not.toContain('stock_consumptions');
    expect(afterOne).toContain('menus');

    await migrate('down', 1);
    expect(await tables()).toEqual([]);

    await migrate('up');
    expect(await tables()).toEqual(full);
  });
});
