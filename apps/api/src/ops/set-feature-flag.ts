import dotenv from 'dotenv';
import { connectRedisFlagStore, type FeatureFlagKey } from '@cafeteria/feature-flags';

dotenv.config({ path: '../../.env' });

async function main(): Promise<void> {
  const [key, rawValue, ...rest] = process.argv.slice(2);
  if (
    !key ||
    !/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/.test(key) ||
    !['true', 'false'].includes(rawValue ?? '') ||
    rest.length
  ) {
    throw new Error('Usage: pnpm --filter @cafeteria/api flags:set <module.flag> <true|false>');
  }
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error('REDIS_URL is required (copy .env.example to .env).');
  const store = await connectRedisFlagStore(redisUrl);
  try {
    await store.set(key as FeatureFlagKey, rawValue === 'true');
    console.log(`Feature flag ${key} updated.`);
  } finally {
    await store.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Unable to update feature flag.');
  process.exitCode = 1;
});
