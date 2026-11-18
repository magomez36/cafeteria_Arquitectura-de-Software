import { Module } from '@nestjs/common';
import { IdentityService } from './application/identity-service';
import { AccountService } from './application/account-service';
import { AccountController } from './controllers/account.controller';
import { ErasureConsumer } from './infrastructure/erasure-consumer';
import { MfaService } from './application/mfa-service';
import { StaffService } from './application/staff-service';
import { AuthGuard } from './controllers/auth.guard';
import { IdentityController } from './controllers/identity.controller';
import { MfaController } from './controllers/mfa.controller';
import { StaffController } from './controllers/staff.controller';
import type { IdentityDeps } from './application/identity-service';
import { IdentityConnections } from './infrastructure/connections';
import {
  PgAccountRepository,
  PgSecurityEventLog,
  PgTokenRepository,
} from './infrastructure/pg-repositories';
import { RedisRateLimiter, RedisSessionStore } from './infrastructure/redis-adapters';
import { SmtpEmail } from './infrastructure/smtp-email';
import { AUTHENTICATION_PORT } from './authentication/authentication.port';
import { IdentityAuthenticationAdapter } from './authentication/identity-authentication.adapter';

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
  controllers: [IdentityController, MfaController, StaffController, AccountController],
  providers: [
    IdentityConnections,
    {
      provide: 'IDENTITY_DEPS',
      inject: [IdentityConnections],
      useFactory: (connections: IdentityConnections): IdentityDeps => ({
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
    {
      provide: IdentityService,
      inject: ['IDENTITY_DEPS'],
      useFactory: (deps: IdentityDeps): IdentityService => new IdentityService(deps),
    },
    {
      provide: MfaService,
      inject: ['IDENTITY_DEPS', IdentityService],
      useFactory: (deps: IdentityDeps, identity: IdentityService): MfaService =>
        new MfaService(deps, identity),
    },
    {
      provide: StaffService,
      inject: ['IDENTITY_DEPS', IdentityService],
      useFactory: (deps: IdentityDeps, identity: IdentityService): StaffService =>
        new StaffService(deps, identity),
    },
    {
      provide: AccountService,
      inject: ['IDENTITY_DEPS', IdentityService],
      useFactory: (deps: IdentityDeps, identity: IdentityService): AccountService =>
        new AccountService(deps, identity),
    },
    ErasureConsumer,
    AuthGuard,
    IdentityAuthenticationAdapter,
    { provide: AUTHENTICATION_PORT, useExisting: IdentityAuthenticationAdapter },
  ],
  exports: [AUTHENTICATION_PORT],
})
export class IdentityModule {}
