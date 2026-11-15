import dotenv from 'dotenv';
import { runner } from 'node-pg-migrate';
import { globSync } from 'node:fs';
import path from 'node:path';
import { validateMigrationOrder } from './migration-files';
dotenv.config({ path: '../../.env' });

async function migrate(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required (copy .env.example to .env).');
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
    logger: console,
    log: console.log,
  });
}

void migrate().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
