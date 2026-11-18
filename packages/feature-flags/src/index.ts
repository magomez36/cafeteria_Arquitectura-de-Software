import { createClient } from 'redis';

export type FeatureFlagKey = `${string}.${string}`;

const FLAG_KEY = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/;

export interface FeatureFlagReader {
  isEnabled(key: FeatureFlagKey): Promise<boolean>;
}

export interface FeatureFlagWriter {
  set(key: FeatureFlagKey, enabled: boolean): Promise<void>;
}

export interface FeatureFlagRedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  readonly isOpen?: boolean;
  quit?(): Promise<unknown>;
}

/** Redis is the source of truth; missing, malformed and unavailable values fail closed. */
export class RedisFeatureFlagStore implements FeatureFlagReader, FeatureFlagWriter {
  constructor(private readonly client: FeatureFlagRedisClient) {}

  async isEnabled(key: FeatureFlagKey): Promise<boolean> {
    if (!FLAG_KEY.test(key)) return false;
    try {
      const value = await this.client.get(`feature-flag:${key}`);
      return value === 'true';
    } catch {
      return false;
    }
  }

  async set(key: FeatureFlagKey, enabled: boolean): Promise<void> {
    if (!FLAG_KEY.test(key))
      throw new Error('Feature flag key must use the module.flag kebab-case format.');
    await this.client.set(`feature-flag:${key}`, String(enabled));
  }

  async close(): Promise<void> {
    if (this.client.isOpen && this.client.quit) await this.client.quit();
  }
}

export const presentationFlagAllowlist = [
  'catalog.new-menu',
  'promotions.campaign-banner',
] as const satisfies readonly FeatureFlagKey[];

export async function getPresentationFlags(
  reader: FeatureFlagReader,
): Promise<Record<string, boolean>> {
  const entries = await Promise.all(
    presentationFlagAllowlist.map(async (key) => [key, await reader.isEnabled(key)] as const),
  );
  return Object.fromEntries(entries);
}

export async function connectRedisFlagStore(url: string): Promise<RedisFeatureFlagStore> {
  const client = createClient({ url });
  client.on('error', () => undefined);
  await client.connect();
  return new RedisFeatureFlagStore(client);
}
