import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runner } from 'node-pg-migrate';
import { applyMigrations } from './apply-migrations';

jest.mock('node-pg-migrate', () => ({ runner: jest.fn() }));

describe('predeploy migration configuration', () => {
  let root: string;
  const databaseUrl = 'postgresql://localhost/cafeteria_test';

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'cafeteria-migration-order-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function migration(module: string, file: string): Promise<void> {
    const directory = path.join(root, module, 'migrations');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, file), '');
  }

  it.each(['ts', 'js'] as const)(
    'selects %s migrations with ordered, transactional execution',
    async (extension) => {
      await migration('platform', `20261117150000_expand.${extension}`);
      await applyMigrations(databaseUrl, root, extension);
      expect(runner).toHaveBeenCalledWith(
        expect.objectContaining({
          databaseUrl,
          dir: `${root.replaceAll('\\', '/')}/*/migrations/*.${extension}`,
          migrationsTable: 'cafeteria_migrations',
          checkOrder: true,
          singleTransaction: true,
          direction: 'up',
        }),
      );
    },
  );

  it('rejects timestamps reused between modules before connecting to PostgreSQL', async () => {
    await migration('first', '20261117150000_expand.js');
    await migration('second', '20261117150000_backfill.js');
    await expect(applyMigrations(databaseUrl, root, 'js')).rejects.toThrow(
      /Duplicate migration prefix/,
    );
    expect(runner).not.toHaveBeenCalled();
  });
});
