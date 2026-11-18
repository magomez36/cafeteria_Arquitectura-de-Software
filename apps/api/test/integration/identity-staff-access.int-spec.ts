import 'reflect-metadata';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { bootstrapAdmin } from '../../src/modules/identity/application/bootstrap-admin';
import { totpCode } from '../../src/modules/identity/domain/totp';
import { PgAccountRepository } from '../../src/modules/identity/infrastructure/pg-repositories';

const ADMIN_PASSWORD = 'admin-clave-segura-2026';
const STAFF_PASSWORD = 'personal-clave-segura-2026';
const PII_KEY = Buffer.alloc(32, 'integration-test-key').toString('base64');

describe('staff access, MFA and role enforcement over HTTP', () => {
  let postgres: StartedTestContainer;
  let redis: StartedTestContainer;
  let mailpit: StartedTestContainer;
  let app: INestApplication;
  let base: string;
  let mailApi: string;

  beforeAll(async () => {
    [postgres, redis, mailpit] = await Promise.all([
      new GenericContainer('postgres:17-alpine')
        .withEnvironment({
          POSTGRES_USER: 'cafeteria',
          POSTGRES_PASSWORD: 'test-only',
          POSTGRES_DB: 'cafeteria_test',
        })
        .withExposedPorts(5432)
        .start(),
      new GenericContainer('redis:7-alpine').withExposedPorts(6379).start(),
      new GenericContainer('axllent/mailpit:v1.27').withExposedPorts(1025, 8025).start(),
    ]);
    const databaseUrl = `postgresql://cafeteria:test-only@${postgres.getHost()}:${postgres.getMappedPort(5432)}/cafeteria_test`;
    await new Promise((r) => setTimeout(r, 1500));
    await runner({
      databaseUrl,
      dir: path.resolve(__dirname, '../../src/modules/*/migrations/*.ts'),
      useGlob: true,
      direction: 'up',
      migrationsTable: 'cafeteria_migrations',
      log: () => undefined,
    });
    process.env.DATABASE_URL = databaseUrl;
    process.env.IDENTITY_PII_KEY = PII_KEY;
    process.env.REDIS_URL = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
    process.env.IDENTITY_SMTP_HOST = mailpit.getHost();
    process.env.IDENTITY_SMTP_PORT = String(mailpit.getMappedPort(1025));
    process.env.WEB_BASE_URL = 'http://web.test';
    mailApi = `http://${mailpit.getHost()}:${mailpit.getMappedPort(8025)}/api/v1`;

    const pool = new Pool({ connectionString: databaseUrl });
    await bootstrapAdmin(new PgAccountRepository(pool), PII_KEY, {
      email: 'admin@example.com',
      fullName: 'Admin',
      password: ADMIN_PASSWORD,
    });
    await pool.end();

    const { IdentityModule } = await import('../../src/modules/identity/identity.module');
    const moduleRef = await Test.createTestingModule({ imports: [IdentityModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.listen(0);
    base = `${await app.getUrl()}/api/v1/identity`.replace('[::1]', 'localhost');
  }, 180000);

  afterAll(async () => {
    await app?.close();
    await Promise.all([postgres?.stop(), redis?.stop(), mailpit?.stop()]);
  });

  const call = (method: string, route: string, body?: unknown, cookie?: string) =>
    fetch(`${base}/${route}`, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const cookieOf = (res: Response): string =>
    (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

  async function mailTokenTo(address: string): Promise<string> {
    for (let i = 0; i < 20; i += 1) {
      const list = (await (await fetch(`${mailApi}/messages`)).json()) as {
        messages: { ID: string; To: { Address: string }[] }[];
      };
      const found = list.messages.find((m) => m.To.some((t) => t.Address === address));
      if (found) {
        const full = (await (await fetch(`${mailApi}/message/${found.ID}`)).json()) as {
          Text: string;
        };
        return decodeURIComponent(/token=([^\s&]+)/.exec(full.Text)?.[1] ?? '');
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error('mail not found');
  }

  async function adminCookie(): Promise<string> {
    const login = await call('POST', 'login', {
      email: 'admin@example.com',
      password: ADMIN_PASSWORD,
    });
    expect((await login.clone().json()).status).toBe('mfa_enrollment_required');
    let cookie = cookieOf(login);
    const enroll = await call('POST', 'mfa/enroll', undefined, cookie);
    const { secret } = (await enroll.json()) as { secret: string };
    const confirm = await call(
      'POST',
      'mfa/confirm',
      { code: totpCode(secret, Date.now()) },
      cookie,
    );
    expect(confirm.status).toBe(200);
    cookie = cookieOf(confirm);
    adminSecret = secret;
    return cookie;
  }
  let adminSecret = '';

  it('denies anonymous and non-admin callers with 401 and 403, and unverified admins with 403', async () => {
    expect((await call('GET', 'staff')).status).toBe(401);
    expect((await call('GET', 'session')).status).toBe(401);

    const login = await call('POST', 'login', {
      email: 'admin@example.com',
      password: ADMIN_PASSWORD,
    });
    const unverified = cookieOf(login);
    expect((await call('GET', 'staff', undefined, unverified)).status).toBe(403);
    expect((await call('GET', 'session', undefined, unverified)).status).toBe(200);
  });

  it('runs the full staff lifecycle and blocks staff from admin functions', async () => {
    const admin = await adminCookie();
    expect((await call('GET', 'staff', undefined, admin)).status).toBe(200);

    const invite = await call(
      'POST',
      'staff',
      { fullName: 'Luis Mesero', email: 'luis@example.com' },
      admin,
    );
    expect(invite.status).toBe(201);
    const token = await mailTokenTo('luis@example.com');
    expect(
      (await call('POST', 'staff/invitation/accept', { token, newPassword: STAFF_PASSWORD }))
        .status,
    ).toBe(204);

    const login = await call('POST', 'login', {
      email: 'luis@example.com',
      password: STAFF_PASSWORD,
    });
    expect((await login.clone().json()).status).toBe('mfa_enrollment_required');
    let staffCookie = cookieOf(login);
    expect((await call('GET', 'staff', undefined, staffCookie)).status).toBe(403);
    const enroll = (await (await call('POST', 'mfa/enroll', undefined, staffCookie)).json()) as {
      secret: string;
    };
    const confirm = await call(
      'POST',
      'mfa/confirm',
      { code: totpCode(enroll.secret, Date.now()) },
      staffCookie,
    );
    staffCookie = cookieOf(confirm);

    // Staff with MFA still cannot use administrator functions (US2 scenario 3).
    expect((await call('GET', 'staff', undefined, staffCookie)).status).toBe(403);
    expect(
      (await call('POST', 'staff', { fullName: 'X', email: 'x@example.com' }, staffCookie)).status,
    ).toBe(403);

    // Deactivation ends sessions immediately (US2 scenario 4).
    const list = (await (await call('GET', 'staff', undefined, admin)).json()) as {
      id: string;
      email: string;
    }[];
    const luis = list.find((s) => s.email === 'luis@example.com');
    expect((await call('POST', `staff/${luis?.id}/deactivate`, undefined, admin)).status).toBe(204);
    expect((await call('GET', 'session', undefined, staffCookie)).status).toBe(401);
    expect(
      (await call('POST', 'login', { email: 'luis@example.com', password: STAFF_PASSWORD })).status,
    ).toBe(401);

    // Admin cannot target themselves or customers through staff endpoints.
    const adminRow = list.find((s) => s.email === 'admin@example.com');
    expect((await call('POST', `staff/${adminRow?.id}/deactivate`, undefined, admin)).status).toBe(
      403,
    );

    // The admin's second factor is required on the next login.
    const again = await call('POST', 'login', {
      email: 'admin@example.com',
      password: ADMIN_PASSWORD,
    });
    const body = (await again.json()) as { status: string; challengeId: string };
    expect(body.status).toBe('mfa_required');
    const done = await call('POST', 'login/mfa', {
      challengeId: body.challengeId,
      code: totpCode(adminSecret, Date.now()),
    });
    expect(done.status).toBe(200);
  });
});
