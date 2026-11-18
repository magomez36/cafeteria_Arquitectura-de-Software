import dotenv from 'dotenv';
import path from 'node:path';
import { applyMigrations } from './apply-migrations';
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

async function migrate(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required (copy .env.example to .env).');
  await applyMigrations(
    databaseUrl,
    path.resolve(__dirname, '../modules'),
    __filename.endsWith('.ts') ? 'ts' : 'js',
  );
}

void migrate().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
