import { randomBytes } from 'node:crypto';
import {
  EmailNotConfirmedError,
  InvalidCredentialsError,
  InvalidTokenError,
  TooManyAttemptsError,
  ValidationError,
} from '../domain/errors';
import {
  FakeEmail,
  FakeEvents,
  InMemoryAccounts,
  InMemoryLimiter,
  InMemorySessions,
  InMemoryTokens,
} from '../tests/in-memory';
import { IdentityService } from './identity-service';

const PASSWORD = 'azul-cafe-montana-2026';

function setup(now = new Date('2026-11-18T10:00:00Z')) {
  const clock = { current: now };
  const parts = {
    accounts: new InMemoryAccounts(),
    tokens: new InMemoryTokens(),
    sessions: new InMemorySessions(),
    limiter: new InMemoryLimiter(),
    email: new FakeEmail(),
    events: new FakeEvents(),
  };
  const service = new IdentityService({
    ...parts,
    config: {
      piiKey: randomBytes(32).toString('base64'),
      webBaseUrl: 'http://web.test',
      sessionTtlSeconds: 3600,
    },
    now: () => clock.current,
  });
  return { service, clock, ...parts };
}

const registration = {
  fullName: 'Ana Pérez',
  email: 'Ana@Example.com',
  password: PASSWORD,
  acceptedPolicy: true,
  ip: '203.0.113.5',
};

async function activeAccount(s: ReturnType<typeof setup>) {
  await s.service.register(registration);
  await s.service.verifyEmail(s.email.lastToken(), registration.ip);
}

describe('IdentityService - registration (US1 scenario 1, 2, 6)', () => {
  it('creates a pending account and sends a confirmation email', async () => {
    const s = setup();
    await s.service.register(registration);
    expect(s.accounts.items.size).toBe(1);
    const [account] = [...s.accounts.items.values()];
    expect(account?.status).toBe('pending');
    expect(account?.passwordHash.startsWith('argon2id$')).toBe(true);
    expect(s.email.sent).toHaveLength(1);
    expect(s.email.sent[0]?.to).toBe('ana@example.com');
    expect(s.events.types()).toContain('register');
  });

  it('stores no email or name in clear text', async () => {
    const s = setup();
    await s.service.register(registration);
    const [account] = [...s.accounts.items.values()];
    expect(JSON.stringify(account)).not.toContain('ana@example.com');
    expect(JSON.stringify(account)).not.toContain('Ana');
  });

  it('answers the same for an existing email and warns the owner instead', async () => {
    const s = setup();
    await s.service.register(registration);
    await expect(
      s.service.register({ ...registration, ip: '203.0.113.9' }),
    ).resolves.toBeUndefined();
    expect(s.accounts.items.size).toBe(1);
    expect(s.email.sent).toHaveLength(2);
    expect(s.email.sent[1]?.subject).toContain('Intento de registro');
    expect(s.email.sent[1]?.to).toBe('ana@example.com');
  });

  it('reports each invalid field so the form can focus the first error', async () => {
    const s = setup();
    const error = await s.service
      .register({ fullName: ' ', email: 'nope', password: 'short', acceptedPolicy: false, ip: 'x' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    const fields = (error as ValidationError).errors.map((e) => e.field);
    expect(fields).toEqual(['fullName', 'email', 'password', 'acceptedPolicy']);
  });

  it('rejects breached passwords', async () => {
    const s = setup();
    await expect(
      s.service.register({ ...registration, password: 'Password1234' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('still completes registration when email delivery fails and records it', async () => {
    const s = setup();
    s.email.fail = true;
    await expect(s.service.register(registration)).resolves.toBeUndefined();
    expect(s.accounts.items.size).toBe(1);
    expect(s.events.types()).toContain('email_delivery_failed');
  });

  it('limits registration attempts per IP (FR-005)', async () => {
    const s = setup();
    for (let i = 0; i < 10; i += 1) {
      await s.service.register({ ...registration, email: `u${i}@example.com` });
    }
    await expect(
      s.service.register({ ...registration, email: 'extra@example.com' }),
    ).rejects.toBeInstanceOf(TooManyAttemptsError);
  });
});

describe('IdentityService - email confirmation (FR-002)', () => {
  it('activates the account once and reports used or invalid links', async () => {
    const s = setup();
    await s.service.register(registration);
    const token = s.email.lastToken();
    await s.service.verifyEmail(token, registration.ip);
    expect([...s.accounts.items.values()][0]?.status).toBe('active');
    await expect(s.service.verifyEmail(token, registration.ip)).rejects.toMatchObject({
      reason: 'used',
    });
    await expect(s.service.verifyEmail('bogus', registration.ip)).rejects.toMatchObject({
      reason: 'invalid',
    });
  });

  it('reports expired links', async () => {
    const s = setup();
    await s.service.register(registration);
    s.clock.current = new Date('2026-11-20T10:00:00Z');
    await expect(
      s.service.verifyEmail(s.email.lastToken(), registration.ip),
    ).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('resends confirmation silently, never revealing whether the email exists', async () => {
    const s = setup();
    await s.service.register(registration);
    await expect(s.service.resendVerification('ghost@example.com', 'ip')).resolves.toBeUndefined();
    expect(s.email.sent).toHaveLength(1);
    await s.service.resendVerification('ana@example.com', 'ip');
    expect(s.email.sent).toHaveLength(2);
  });
});

describe('IdentityService - login and logout (FR-003, FR-005, FR-006)', () => {
  it('logs in a confirmed customer and logs out', async () => {
    const s = setup();
    await activeAccount(s);
    const result = await s.service.login({
      email: 'ana@example.com',
      password: PASSWORD,
      ip: '1.1.1.1',
    });
    expect(result.status).toBe('authenticated');
    if (result.status !== 'authenticated') throw new Error('unexpected');
    expect(result.session.displayName).toBe('Ana Pérez');
    expect(await s.service.getSession(result.sessionId)).not.toBeNull();
    await s.service.logout(result.sessionId, '1.1.1.1');
    expect(await s.service.getSession(result.sessionId)).toBeNull();
    expect(s.events.types()).toEqual(expect.arrayContaining(['login_success', 'logout']));
  });

  it('gives the same error for unknown email and wrong password', async () => {
    const s = setup();
    await activeAccount(s);
    const wrong = await s.service
      .login({ email: 'ana@example.com', password: 'wrong-password-123', ip: 'a' })
      .catch((e: unknown) => e);
    const unknown = await s.service
      .login({ email: 'ghost@example.com', password: 'wrong-password-123', ip: 'a' })
      .catch((e: unknown) => e);
    expect(wrong).toBeInstanceOf(InvalidCredentialsError);
    expect(unknown).toBeInstanceOf(InvalidCredentialsError);
    expect((wrong as Error).message).toBe((unknown as Error).message);
  });

  it('asks the customer to confirm the email only after a correct password', async () => {
    const s = setup();
    await s.service.register(registration);
    await expect(
      s.service.login({ email: 'ana@example.com', password: PASSWORD, ip: 'a' }),
    ).rejects.toBeInstanceOf(EmailNotConfirmedError);
    await expect(
      s.service.login({ email: 'ana@example.com', password: 'wrong-password-123', ip: 'a' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('pauses after repeated failures and warns the owner once', async () => {
    const s = setup();
    await activeAccount(s);
    const before = s.email.sent.length;
    for (let i = 0; i < 5; i += 1) {
      await s.service
        .login({ email: 'ana@example.com', password: 'wrong-password-123', ip: 'a' })
        .catch(() => undefined);
    }
    for (let i = 0; i < 3; i += 1) {
      await expect(
        s.service.login({ email: 'ana@example.com', password: PASSWORD, ip: 'a' }),
      ).rejects.toBeInstanceOf(TooManyAttemptsError);
    }
    expect(s.email.sent.length - before).toBe(1);
    expect(s.events.types()).toContain('login_rate_limited');
  });

  it('does not log in disabled accounts', async () => {
    const s = setup();
    await activeAccount(s);
    const [account] = [...s.accounts.items.values()];
    await s.accounts.setStatus(account?.id ?? '', 'disabled');
    await expect(
      s.service.login({ email: 'ana@example.com', password: PASSWORD, ip: 'a' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('never records passwords or emails in security events', async () => {
    const s = setup();
    await activeAccount(s);
    await s.service.login({ email: 'ana@example.com', password: PASSWORD, ip: '9.9.9.9' });
    const dump = JSON.stringify(s.events.recorded);
    expect(dump).not.toContain(PASSWORD);
    expect(dump).not.toContain('ana@example.com');
    expect(dump).not.toContain('9.9.9.9');
  });
});

describe('IdentityService - password recovery (US1 scenario 5)', () => {
  it('answers the same for unknown emails and sends no mail', async () => {
    const s = setup();
    await expect(s.service.forgotPassword('ghost@example.com', 'ip')).resolves.toBeUndefined();
    expect(s.email.sent).toHaveLength(0);
  });

  it('resets the password with a one-use link and revokes sessions', async () => {
    const s = setup();
    await activeAccount(s);
    const login = await s.service.login({ email: 'ana@example.com', password: PASSWORD, ip: 'a' });
    if (login.status !== 'authenticated') throw new Error('unexpected');
    await s.service.forgotPassword('ana@example.com', 'ip');
    const token = s.email.lastToken();
    await s.service.resetPassword(token, 'nueva-clave-segura-2026', 'ip');
    expect(await s.service.getSession(login.sessionId)).toBeNull();
    await expect(
      s.service.resetPassword(token, 'otra-clave-segura-2026', 'ip'),
    ).rejects.toMatchObject({
      reason: 'used',
    });
    const again = await s.service.login({
      email: 'ana@example.com',
      password: 'nueva-clave-segura-2026',
      ip: 'b',
    });
    expect(again.status).toBe('authenticated');
  });

  it('expires the link after 30 minutes', async () => {
    const s = setup();
    await activeAccount(s);
    await s.service.forgotPassword('ana@example.com', 'ip');
    s.clock.current = new Date('2026-11-18T10:31:00Z');
    await expect(
      s.service.resetPassword(s.email.lastToken(), 'nueva-clave-segura-2026', 'ip'),
    ).rejects.toMatchObject({ reason: 'expired' });
  });

  it('rejects weak new passwords without consuming the link', async () => {
    const s = setup();
    await activeAccount(s);
    await s.service.forgotPassword('ana@example.com', 'ip');
    const token = s.email.lastToken();
    await expect(s.service.resetPassword(token, 'corta', 'ip')).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      s.service.resetPassword(token, 'nueva-clave-segura-2026', 'ip'),
    ).resolves.toBeUndefined();
  });
});
