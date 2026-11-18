import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { Client } from 'pg';

describe('expand/contract migration compatibility', () => {
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

  it('keeps previous and next application shapes usable through expand, backfill and contract', async () => {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      await client.query(
        'CREATE TABLE compatibility_probe (id integer PRIMARY KEY, display_name text NOT NULL)',
      );
      await client.query(
        "INSERT INTO compatibility_probe (id, display_name) VALUES (1, 'espresso')",
      );

      // Expand: additive nullable field; the old reader/writer remains valid.
      await client.query('ALTER TABLE compatibility_probe ADD COLUMN display_label text NULL');
      await client.query(
        'UPDATE compatibility_probe SET display_label = display_name WHERE display_label IS NULL',
      );
      const oldReader = await client.query(
        'SELECT id, display_name FROM compatibility_probe WHERE id = 1',
      );
      expect(oldReader.rows[0].display_name).toBe('espresso');
      await client.query("UPDATE compatibility_probe SET display_name = 'flat white' WHERE id = 1");

      // New code can read the expanded shape while old code is still deployed.
      const newReader = await client.query(
        'SELECT id, display_label FROM compatibility_probe WHERE id = 1',
      );
      expect(newReader.rows[0].display_label).toBe('espresso');
      await client.query(
        "UPDATE compatibility_probe SET display_label = 'flat white' WHERE id = 1",
      );

      // Contract only after the old application is retired; the new shape remains readable.
      await client.query('ALTER TABLE compatibility_probe DROP COLUMN display_name');
      const contracted = await client.query(
        'SELECT display_label FROM compatibility_probe WHERE id = 1',
      );
      expect(contracted.rows[0].display_label).toBe('flat white');
    } finally {
      await client.end();
    }
  }, 60000);
});
