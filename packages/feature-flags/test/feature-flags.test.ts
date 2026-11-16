import { describe, expect, it, vi } from 'vitest';
import { getPresentationFlags, RedisFeatureFlagStore, type FeatureFlagKey } from '../src/index';

describe('RedisFeatureFlagStore', () => {
  it('defaults missing, malformed, unavailable and unnamespaced flags to off', async () => {
    const get = vi.fn(async (): Promise<string | null> => null);
    const store = new RedisFeatureFlagStore({ get, set: vi.fn(async () => undefined) });
    expect(await store.isEnabled('catalog.new-menu')).toBe(false);
    get.mockResolvedValueOnce('garbage');
    expect(await store.isEnabled('catalog.new-menu')).toBe(false);
    get.mockRejectedValueOnce(new Error('redis unavailable'));
    expect(await store.isEnabled('catalog.new-menu')).toBe(false);
    expect(await store.isEnabled('Bad key' as FeatureFlagKey)).toBe(false);
  });

  it('reflects runtime changes and only exposes presentation allowlist keys', async () => {
    let value: string | null = 'false';
    const store = new RedisFeatureFlagStore({
      get: vi.fn(async (key: string): Promise<string | null> =>
        key === 'feature-flag:catalog.new-menu' ? value : null,
      ),
      set: vi.fn(async (_key: string, next: string): Promise<unknown> => {
        value = next;
        return undefined;
      }),
    });
    expect(await store.isEnabled('catalog.new-menu')).toBe(false);
    await store.set('catalog.new-menu', true);
    expect(await store.isEnabled('catalog.new-menu')).toBe(true);
    const flags = await getPresentationFlags(store);
    expect(Object.keys(flags)).toEqual(['catalog.new-menu', 'promotions.campaign-banner']);
    expect(flags['catalog.new-menu']).toBe(true);
  });

  it('rejects writes using invalid keys', async () => {
    const store = new RedisFeatureFlagStore({
      get: vi.fn(async (): Promise<string | null> => null),
      set: vi.fn(async () => undefined),
    });
    await expect(store.set('bad key' as FeatureFlagKey, true)).rejects.toThrow(/module.flag/);
  });
});
