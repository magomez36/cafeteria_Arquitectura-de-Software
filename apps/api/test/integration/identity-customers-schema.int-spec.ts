import path from 'node:path';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { Client } from 'pg';
import { runner } from 'node-pg-migrate';

describe('identity and customers migrations on a fresh database', () => {
  let postgres: StartedTestContainer;
  let databaseUrl: string;

  beforeAll(async () => {
    postgres = await new GenericContainer('postgres:17-alpine')
      .withEnvironment({
        POSTGRES_USER: 'cafeteria',
        POSTGRES_PASSWORD: 'test-only',
        POSTGRES_DB: 'cafeteria_test',
      })
      .withExposedPorts(5432)
      .start();
    databaseUrl = `postgresql://cafeteria:test-only@${postgres.getHost()}:${postgres.getMappedPort(5432)}/cafeteria_test`;
  }, 120000);

  afterAll(async () => postgres?.stop());

  it('applies up, enforces constraints, and rolls back cleanly', async () => {
    const dir = path.resolve(__dirname, '../../src/modules/*/migrations/*.ts');
    const run = (direction: 'up' | 'down', count?: number) =>
      runner({
        databaseUrl,
        dir,
        useGlob: true,
        direction,
        ...(count ? { count } : {}),
        migrationsTable: 'cafeteria_migrations',
        checkOrder: true,
        log: () => undefined,
      });
    await run('up');

    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const tables = await client.query(
        `SELECT table_schema || '.' || table_name AS t FROM information_schema.tables
         WHERE table_schema IN ('identity', 'customers') ORDER BY 1`,
      );
      expect(tables.rows.map((r: { t: string }) => r.t)).toEqual([
        'customers.consents',
        'customers.customers',
        'customers.data_inventory',
        'customers.rights_requests',
        'identity.accounts',
        'identity.one_time_tokens',
        'identity.security_events',
      ]);

      await expect(
        client.query(
          `INSERT INTO identity.accounts (email_blind, email_enc, password_hash, role)
           VALUES ('h1', 'e1', 'p1', 'superuser')`,
        ),
      ).rejects.toThrow();

      await client.query(
        `INSERT INTO identity.accounts (email_blind, email_enc, password_hash) VALUES ('h2', 'e2', 'p2')`,
      );
      await expect(
        client.query(
          `INSERT INTO identity.accounts (email_blind, email_enc, password_hash) VALUES ('h2', 'e3', 'p3')`,
        ),
      ).rejects.toThrow();

      const inventory = await client.query(
        'SELECT count(*)::int AS n FROM customers.data_inventory',
      );
      expect(inventory.rows[0].n).toBeGreaterThan(0);
    } finally {
      await client.end();
    }

    await run('down', 3);
    const after = new Client({ connectionString: databaseUrl });
    await after.connect();
    try {
      const left = await after.query(
        `SELECT count(*)::int AS n FROM information_schema.schemata WHERE schema_name IN ('identity', 'customers')`,
      );
      expect(left.rows[0].n).toBe(0);
    } finally {
      await after.end();
    }
  });
});
