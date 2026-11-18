import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { createClient } from 'redis';
import { RedisFeatureFlagStore } from '@cafeteria/feature-flags';

describe('Redis-backed feature flag store', () => {
  let redis: StartedTestContainer;
  let client: ReturnType<typeof createClient>;
  let store: RedisFeatureFlagStore;

  beforeAll(async () => {
    redis = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
    client = createClient({ url: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}` });
    client.on('error', () => undefined);
    await client.connect();
    store = new RedisFeatureFlagStore(client);
  }, 120000);

  afterAll(async () => {
    if (client?.isOpen) await client.quit();
    await redis?.stop();
  });

  it('defaults off, reads runtime changes and returns off when Redis is unavailable', async () => {
    expect(await store.isEnabled('catalog.new-menu')).toBe(false);
    await store.set('catalog.new-menu', true);
    expect(await store.isEnabled('catalog.new-menu')).toBe(true);
    await store.set('catalog.new-menu', false);
    expect(await store.isEnabled('catalog.new-menu')).toBe(false);
    await store.set('catalog.new-menu', true);
    await client.quit();
    expect(await store.isEnabled('catalog.new-menu')).toBe(false);
  }, 30000);
});
