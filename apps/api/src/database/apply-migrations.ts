import { globSync } from 'node:fs';
import path from 'node:path';
import { runner } from 'node-pg-migrate';
import { validateMigrationOrder } from './migration-files';

export async function applyMigrations(
  databaseUrl: string,
  directory: string,
  extension: 'ts' | 'js',
): Promise<void> {
  const pattern = `*/migrations/*.${extension}`;
  const names = globSync(pattern, { cwd: directory }).map((file) => path.basename(file));
  validateMigrationOrder(names, extension);

  await runner({
    databaseUrl,
    dir: `${directory.replaceAll('\\', '/')}/${pattern}`,
    useGlob: true,
    direction: 'up',
    migrationsTable: 'cafeteria_migrations',
    checkOrder: true,
    singleTransaction: true,
    logger: console,
    log: console.log,
  });
}
