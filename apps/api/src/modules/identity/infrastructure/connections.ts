import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { createClient } from 'redis';

/** Identity-owned connections. Redis failures surface as errors so authentication fails closed. */
@Injectable()
export class IdentityConnections implements OnModuleDestroy {
  readonly pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  private readonly redis = createClient({
    ...(process.env.REDIS_URL ? { url: process.env.REDIS_URL } : {}),
    socket: { reconnectStrategy: false },
  });
  private connecting: Promise<unknown> | undefined;

  constructor() {
    this.redis.on('error', () => undefined);
  }

  async redisClient(): Promise<typeof this.redis> {
    if (this.redis.isReady) return this.redis;
    this.connecting ??= this.redis.connect().finally(() => {
      this.connecting = undefined;
    });
    await this.connecting;
    return this.redis;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis.isOpen) await this.redis.quit();
    await this.pool.end();
  }
}
