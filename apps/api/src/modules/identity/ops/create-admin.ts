import dotenv from 'dotenv';
import { Pool } from 'pg';
import { bootstrapAdmin } from '../application/bootstrap-admin';
import { PgAccountRepository } from '../infrastructure/pg-repositories';

dotenv.config({ path: '../../.env' });

// Usage (from apps/api): ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_PASSWORD=... \
//   pnpm exec tsx src/modules/identity/ops/create-admin.ts
async function main(): Promise<void> {
  const { ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD, DATABASE_URL, IDENTITY_PII_KEY } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !DATABASE_URL) {
    throw new Error('ADMIN_EMAIL, ADMIN_PASSWORD and DATABASE_URL are required.');
  }
  const piiKey = IDENTITY_PII_KEY ?? Buffer.alloc(32, 'identity-dev-only-key').toString('base64');
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    await bootstrapAdmin(new PgAccountRepository(pool), piiKey, {
      email: ADMIN_EMAIL,
      fullName: ADMIN_NAME ?? 'Administrador',
      password: ADMIN_PASSWORD,
    });
    console.log('Administrator created. MFA will be enrolled on first login.');
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
