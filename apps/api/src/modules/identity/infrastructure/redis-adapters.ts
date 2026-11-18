import { randomBytes } from 'node:crypto';
import type { RateLimiter, SessionData, SessionStore } from '../domain/ports';
import type { IdentityConnections } from './connections';

const newId = (): string => randomBytes(32).toString('base64url');

export class RedisSessionStore implements SessionStore {
  constructor(private readonly connections: IdentityConnections) {}

  async create(data: SessionData, ttlSeconds: number): Promise<string> {
    const redis = await this.connections.redisClient();
    const id = newId();
    await redis
      .multi()
      .set(`identity:session:${id}`, JSON.stringify(data), { EX: ttlSeconds })
      .sAdd(`identity:account-sessions:${data.accountId}`, id)
      .expire(`identity:account-sessions:${data.accountId}`, ttlSeconds)
      .exec();
    return id;
  }

  async get(sessionId: string): Promise<SessionData | null> {
    const redis = await this.connections.redisClient();
    const raw = await redis.get(`identity:session:${sessionId}`);
    return raw ? (JSON.parse(raw) as SessionData) : null;
  }

  async revoke(sessionId: string): Promise<void> {
    const redis = await this.connections.redisClient();
    const raw = await redis.get(`identity:session:${sessionId}`);
    await redis.del(`identity:session:${sessionId}`);
    if (raw) {
      const { accountId } = JSON.parse(raw) as SessionData;
      await redis.sRem(`identity:account-sessions:${accountId}`, sessionId);
    }
  }

  async revokeAllForAccount(accountId: string): Promise<void> {
    const redis = await this.connections.redisClient();
    const key = `identity:account-sessions:${accountId}`;
    const ids = await redis.sMembers(key);
    if (ids.length > 0) await redis.del(ids.map((id) => `identity:session:${id}`));
    await redis.del(key);
  }

  async createChallenge(accountId: string, ttlSeconds: number): Promise<string> {
    const redis = await this.connections.redisClient();
    const id = newId();
    await redis.set(`identity:challenge:${id}`, accountId, { EX: ttlSeconds });
    return id;
  }

  async readChallenge(challengeId: string): Promise<string | null> {
    const redis = await this.connections.redisClient();
    return redis.get(`identity:challenge:${challengeId}`);
  }

  async deleteChallenge(challengeId: string): Promise<void> {
    const redis = await this.connections.redisClient();
    await redis.del(`identity:challenge:${challengeId}`);
  }
}

export class RedisRateLimiter implements RateLimiter {
  constructor(private readonly connections: IdentityConnections) {}

  async hit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; count: number; retryAfterSeconds: number }> {
    const redis = await this.connections.redisClient();
    const redisKey = `identity:rate:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) await redis.expire(redisKey, windowSeconds);
    const ttl = await redis.ttl(redisKey);
    return { allowed: count <= limit, count, retryAfterSeconds: ttl > 0 ? ttl : windowSeconds };
  }
}
