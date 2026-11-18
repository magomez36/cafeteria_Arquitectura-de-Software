import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from 'pg';
import { GenericContainer, Wait } from 'testcontainers';
import { AppModule } from '../src/app.module';
import { applyMigrations } from '../src/database/apply-migrations';

it('rolls back a failed predeploy while the previous API and its schema stay healthy', async () => {
  const postgres = await new GenericContainer('postgres:17-alpine')
    .withEnvironment({ POSTGRES_PASSWORD: 'test-only', POSTGRES_DB: 'cafeteria_test' })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();
  try {
    const databaseUrl = `postgresql://postgres:test-only@${postgres.getHost()}:${postgres.getMappedPort(5432)}/cafeteria_test`;
    const client = new Client({ connectionString: databaseUrl });
    const directory = await mkdtemp(path.join(tmpdir(), 'cafeteria-predeploy-'));
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const previous = moduleRef.createNestApplication();
    try {
      await previous.listen(0, '127.0.0.1');
      await client.connect();
      await client.query('CREATE TABLE orders_probe (id integer PRIMARY KEY, label text NOT NULL)');
      await client.query("INSERT INTO orders_probe VALUES (1, 'baseline')");
      const healthUrl = `${await previous.getUrl()}/health`;
      expect(await (await fetch(healthUrl)).json()).toEqual({ status: 'ok' });

      const migrations = path.join(directory, 'platform', 'migrations');
      await mkdir(migrations, { recursive: true });
      await writeFile(
        path.join(migrations, '20261117090000_expand.js'),
        "exports.up = (pgm) => pgm.sql('ALTER TABLE orders_probe ADD COLUMN extra text');\n",
      );
      await writeFile(
        path.join(migrations, '20261117090001_fail.js'),
        "exports.up = (pgm) => pgm.sql('SELECT no_such_column FROM orders_probe');\n",
      );
      await expect(applyMigrations(databaseUrl, directory, 'js')).rejects.toThrow(/no_such_column/);

      const health = await fetch(healthUrl);
      expect(health.status).toBe(200);
      await expect(health.json()).resolves.toEqual({ status: 'ok' });
      const state = await client.query('SELECT * FROM orders_probe');
      expect(state.rows).toEqual([{ id: 1, label: 'baseline' }]);
    } finally {
      await Promise.all([previous.close(), client.end(), rm(directory, { recursive: true })]);
    }
  } finally {
    await postgres.stop();
  }
}, 120_000);
