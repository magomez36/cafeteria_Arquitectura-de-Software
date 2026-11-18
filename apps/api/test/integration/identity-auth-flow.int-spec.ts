import 'reflect-metadata';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { runner } from 'node-pg-migrate';
import { Client } from 'pg';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';

const PASSWORD = 'azul-cafe-montana-2026';

describe('identity authentication flow against real Postgres, Redis and Mailpit', () => {
  let postgres: StartedTestContainer;
  let redis: StartedTestContainer;
  let mailpit: StartedTestContainer;
  let app: INestApplication;
  let base: string;
  let mailApi: string;
  let databaseUrl: string;

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
    databaseUrl = `postgresql://cafeteria:test-only@${postgres.getHost()}:${postgres.getMappedPort(5432)}/cafeteria_test`;
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
    process.env.REDIS_URL = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
    process.env.IDENTITY_SMTP_HOST = mailpit.getHost();
    process.env.IDENTITY_SMTP_PORT = String(mailpit.getMappedPort(1025));
    process.env.WEB_BASE_URL = 'http://web.test';
    mailApi = `http://${mailpit.getHost()}:${mailpit.getMappedPort(8025)}/api/v1`;

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

  const post = (route: string, body: unknown, cookie?: string) =>
    fetch(`${base}/${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });

  async function lastMailTo(address: string): Promise<{ text: string; subject: string }> {
    for (let i = 0; i < 20; i += 1) {
      const list = (await (await fetch(`${mailApi}/messages`)).json()) as {
        messages: { ID: string; Subject: string; To: { Address: string }[] }[];
      };
      const found = list.messages.find((m) => m.To.some((t) => t.Address === address));
      if (found) {
        const full = (await (await fetch(`${mailApi}/message/${found.ID}`)).json()) as {
          Text: string;
        };
        return { text: full.Text, subject: found.Subject };
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`No mail for ${address}`);
  }

  const tokenFrom = (text: string): string =>
    decodeURIComponent(/token=([^\s&]+)/.exec(text)?.[1] ?? '');

  it('register -> confirm -> login -> logout -> recover password', async () => {
    const email = 'ana@example.com';
    const register = await post('register', {
      fullName: 'Ana Pérez',
      email,
      password: PASSWORD,
      acceptedPolicy: true,
    });
    expect(register.status).toBe(202);

    const unconfirmed = await post('login', { email, password: PASSWORD });
    expect(unconfirmed.status).toBe(403);
    expect((await unconfirmed.json()).code).toBe('email_not_confirmed');

    const confirmation = await lastMailTo(email);
    const verify = await post('verify-email', { token: tokenFrom(confirmation.text) });
    expect(verify.status).toBe(204);
    expect((await post('verify-email', { token: tokenFrom(confirmation.text) })).status).toBe(400);

    const login = await post('login', { email, password: PASSWORD });
    expect(login.status).toBe(200);
    const setCookie = login.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('cafeteria_session=');
    expect(setCookie.toLowerCase()).toContain('httponly');
    const cookie = setCookie.split(';')[0] ?? '';
    expect((await login.json()).user).toEqual({ displayName: 'Ana Pérez', role: 'customer' });

    expect((await post('logout', {}, cookie)).status).toBe(204);

    await post('password/forgot', { email });
    const reset = await lastMailTo(email);
    expect(reset.subject).toContain('Recupera');
    const newPassword = 'nueva-clave-segura-2026';
    expect(
      (await post('password/reset', { token: tokenFrom(reset.text), newPassword })).status,
    ).toBe(204);
    expect((await post('login', { email, password: PASSWORD })).status).toBe(401);
    expect((await post('login', { email, password: newPassword })).status).toBe(200);
  });

  it('returns identical responses for registered and unknown emails on recovery and register', async () => {
    const known = await post('password/forgot', { email: 'ana@example.com' });
    const unknown = await post('password/forgot', { email: 'nobody@example.com' });
    expect(known.status).toBe(unknown.status);
    expect(await known.json()).toEqual(await unknown.json());

    const dup = await post('register', {
      fullName: 'Ana',
      email: 'ana@example.com',
      password: PASSWORD,
      acceptedPolicy: true,
    });
    expect(dup.status).toBe(202);
  });

  it('stores no clear-text email or password and records security events without PII', async () => {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const accounts = JSON.stringify((await client.query('SELECT * FROM identity.accounts')).rows);
      expect(accounts).not.toContain('ana@example.com');
      expect(accounts).not.toContain(PASSWORD);
      const events = JSON.stringify(
        (await client.query('SELECT * FROM identity.security_events')).rows,
      );
      expect(events).not.toContain('ana@example.com');
      expect(events).toContain('login_success');
    } finally {
      await client.end();
    }
  });

  it('answers 422 with per-field errors for invalid registration', async () => {
    const res = await post('register', {
      fullName: '',
      email: 'x',
      password: 'short',
      acceptedPolicy: false,
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.errors.map((e: { field: string }) => e.field)).toEqual([
      'fullName',
      'email',
      'password',
      'acceptedPolicy',
    ]);
  });
});
