import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { RedisFeatureFlagStore, type FeatureFlagKey } from '@cafeteria/feature-flags';
import { createClient } from 'redis';

@Injectable()
export class FeatureFlagsService implements OnModuleDestroy {
  private readonly client = createClient({
    ...(process.env.REDIS_URL ? { url: process.env.REDIS_URL } : {}),
    socket: { reconnectStrategy: false },
  });
  private readonly store = new RedisFeatureFlagStore(this.client);

  constructor() {
    this.client.on('error', () => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.isOpen) await this.client.quit();
  }

  async isEnabled(key: FeatureFlagKey): Promise<boolean> {
    if (!(await this.connectIfNeeded())) return false;
    return this.store.isEnabled(key);
  }

  private async connectIfNeeded(): Promise<boolean> {
    if (this.client.isReady) return true;
    try {
      if (!this.client.isOpen) await this.client.connect();
      return this.client.isReady;
    } catch {
      return false;
    }
  }
}
