import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AccountService } from '../application/account-service';
import { IdentityConnections } from './connections';

/** Redis list written by the customers module when an erasure request is accepted. */
export const ERASURE_QUEUE = 'platform:erasure-requests';

/** Consumes erasure requests published by other modules (no cross-module imports). */
@Injectable()
export class ErasureConsumer implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly connections: IdentityConnections,
    private readonly accounts: AccountService,
  ) {}

  onModuleInit(): void {
    if (process.env.IDENTITY_ERASURE_POLL === 'off') return;
    this.timer = setInterval(() => void this.drain().catch(() => undefined), 3000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async drain(): Promise<number> {
    const redis = await this.connections.redisClient();
    let processed = 0;
    for (;;) {
      const raw = await redis.lPop(ERASURE_QUEUE);
      if (!raw) return processed;
      try {
        const { accountId } = JSON.parse(raw) as { accountId?: string };
        if (accountId) await this.accounts.eraseCustomerAccount(accountId);
        processed += 1;
      } catch {
        await redis.rPush(`${ERASURE_QUEUE}:failed`, raw);
      }
    }
  }
}
