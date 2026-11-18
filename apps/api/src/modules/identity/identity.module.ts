import { Module } from '@nestjs/common';
import { IdentityService } from './application/identity-service';
import { IdentityController } from './controllers/identity.controller';
import { IdentityConnections } from './infrastructure/connections';
import {
  PgAccountRepository,
  PgSecurityEventLog,
  PgTokenRepository,
} from './infrastructure/pg-repositories';
import { RedisRateLimiter, RedisSessionStore } from './infrastructure/redis-adapters';
import { SmtpEmail } from './infrastructure/smtp-email';

const DEV_PII_KEY = Buffer.alloc(32, 'identity-dev-only-key').toString('base64');

function piiKey(): string {
  const key = process.env.IDENTITY_PII_KEY;
  if (key) return key;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('IDENTITY_PII_KEY is required in production.');
  }
  return DEV_PII_KEY;
}

@Module({
  controllers: [IdentityController],
  providers: [
    IdentityConnections,
    {
      provide: IdentityService,
      inject: [IdentityConnections],
      useFactory: (connections: IdentityConnections): IdentityService =>
        new IdentityService({
          accounts: new PgAccountRepository(connections.pool),
          tokens: new PgTokenRepository(connections.pool),
          events: new PgSecurityEventLog(connections.pool),
          sessions: new RedisSessionStore(connections),
          limiter: new RedisRateLimiter(connections),
          email: new SmtpEmail({
            host: process.env.IDENTITY_SMTP_HOST ?? 'localhost',
            port: Number(process.env.IDENTITY_SMTP_PORT ?? 1025),
            from: process.env.IDENTITY_MAIL_FROM ?? 'no-reply@cafeteria.local',
          }),
          config: {
            piiKey: piiKey(),
            webBaseUrl: process.env.WEB_BASE_URL ?? 'http://localhost:3000',
            sessionTtlSeconds: 8 * 60 * 60,
          },
        }),
    },
  ],
  exports: [],
})
export class IdentityModule {}
