import { globSync } from 'node:fs';
import path from 'node:path';
import { runner } from 'node-pg-migrate';
import { Client } from 'pg';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { validateMigrationOrder } from '../../src/database/migration-files';

describe('database migration safety', () => {
  let postgres: StartedTestContainer;

  beforeAll(async () => {
    postgres = await new GenericContainer('postgres:17-alpine')
      .withEnvironment({
        POSTGRES_USER: 'cafeteria',
        POSTGRES_PASSWORD: 'test-only',
        POSTGRES_DB: 'cafeteria_test',
      })
      .withExposedPorts(5432)
      .start();
  }, 120000);

  afterAll(async () => {
    await postgres?.stop();
  });

  it('orders timestamped migrations and rejects duplicate or invalid prefixes', () => {
    expect(
      validateMigrationOrder(['20261115000002_add_second.ts', '20261115000001_add_first.ts']).map(
        (file) => file.prefix,
      ),
    ).toEqual(['20261115000001', '20261115000002']);
    expect(() =>
      validateMigrationOrder(['20261115000001_add_first.ts', '20261115000001_add_second.ts']),
    ).toThrow(/Duplicate migration prefix/);
    expect(() => validateMigrationOrder(['migration-without-prefix.ts'])).toThrow(/YYYYMMDDHHMMSS/);
  });

  it('runs migrations against a clean PostgreSQL database and creates the ledger', async () => {
    const databaseUrl = `postgresql://cafeteria:test-only@${postgres.getHost()}:${postgres.getMappedPort(5432)}/cafeteria_test`;
    const migrationDirectory = path.resolve('src/modules');
    const migrationNames = globSync('*/migrations/*.ts', { cwd: migrationDirectory }).map((file) =>
      path.basename(file),
    );
    validateMigrationOrder(migrationNames);
    await runner({
      databaseUrl,
      dir: 'src/modules/*/migrations/*.ts',
      useGlob: true,
      direction: 'up',
      migrationsTable: 'cafeteria_migrations',
      checkOrder: true,
      log: () => undefined,
    });
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    const ledger = await client.query(
      "select to_regclass('public.cafeteria_migrations') as ledger",
    );
    expect(ledger.rows[0].ledger).toBe('cafeteria_migrations');
    await client.end();
  }, 60000);
});
