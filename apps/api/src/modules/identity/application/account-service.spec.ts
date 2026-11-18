import { randomBytes } from 'node:crypto';
import { InvalidCredentialsError, InvalidTokenError, ValidationError } from '../domain/errors';
import {
  FakeEmail,
  FakeEvents,
  InMemoryAccounts,
  InMemoryLimiter,
  InMemorySessions,
  InMemoryTokens,
} from '../tests/in-memory';
import { AccountService } from './account-service';
import { IdentityService, type IdentityDeps } from './identity-service';

const PASSWORD = 'azul-cafe-montana-2026';

async function setup() {
  const parts = {
    accounts: new InMemoryAccounts(),
    tokens: new InMemoryTokens(),
    sessions: new InMemorySessions(),
    limiter: new InMemoryLimiter(),
    email: new FakeEmail(),
    events: new FakeEvents(),
  };
  const deps: IdentityDeps = {
    ...parts,
    config: {
      piiKey: randomBytes(32).toString('base64'),
      webBaseUrl: 'http://web.test',
      sessionTtlSeconds: 3600,
    },
  };
  const identity = new IdentityService(deps);
  const accounts = new AccountService(deps, identity);
  await identity.register({
    fullName: 'Ana Pérez',
    email: 'ana@example.com',
    password: PASSWORD,
    acceptedPolicy: true,
    ip: 'ip',
  });
  await identity.verifyEmail(parts.email.lastToken(), 'ip');
  const login = await identity.login({ email: 'ana@example.com', password: PASSWORD, ip: 'ip' });
  if (login.status !== 'authenticated') throw new Error('unexpected');
  return { ...parts, accountsRepo: parts.accounts, identity, accounts, login };
}

describe('AccountService - password change (FR-010)', () => {
  it('requires the current password and a policy-compliant new one', async () => {
    const s = await setup();
    await expect(
      s.accounts.changePassword(
        s.login.sessionId,
        s.login.session,
        'wrong-password-123',
        'nueva-clave-segura-2026',
        'ip',
      ),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(
      s.accounts.changePassword(s.login.sessionId, s.login.session, PASSWORD, 'corta', 'ip'),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('changes the password, revokes older sessions and warns by email', async () => {
    const s = await setup();
    const result = await s.accounts.changePassword(
      s.login.sessionId,
      s.login.session,
      PASSWORD,
      'nueva-clave-segura-2026',
      'ip',
    );
    expect(await s.identity.getSession(s.login.sessionId)).toBeNull();
    expect(await s.identity.getSession(result.sessionId)).not.toBeNull();
    expect(s.email.sent.at(-1)?.subject).toContain('contraseña');
    expect(s.events.types()).toContain('password_changed');
    const again = await s.identity.login({
      email: 'ana@example.com',
      password: 'nueva-clave-segura-2026',
      ip: 'ip2',
    });
    expect(again.status).toBe('authenticated');
  });
});

describe('AccountService - email change (US3 scenario 2)', () => {
  it('warns the old address and requires confirming the new one', async () => {
    const s = await setup();
    await s.accounts.requestEmailChange(s.login.session, 'Nuevo@Example.com', PASSWORD, 'ip');
    const toOld = s.email.sent.filter(
      (m) => m.to === 'ana@example.com' && m.subject.includes('cambio de correo'),
    );
    expect(toOld).toHaveLength(1);
    const toNew = s.email.sent.at(-1);
    expect(toNew?.to).toBe('nuevo@example.com');
    // The old email still works until the new one is confirmed.
    expect(
      (await s.identity.login({ email: 'ana@example.com', password: PASSWORD, ip: 'a' })).status,
    ).toBe('authenticated');
    await s.accounts.confirmEmailChange(s.email.lastToken(), 'ip');
    await expect(
      s.identity.login({ email: 'ana@example.com', password: PASSWORD, ip: 'b' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(
      (await s.identity.login({ email: 'nuevo@example.com', password: PASSWORD, ip: 'c' })).status,
    ).toBe('authenticated');
    expect(s.events.types()).toEqual(
      expect.arrayContaining(['email_change_requested', 'email_changed']),
    );
  });

  it('requires the password and a valid address', async () => {
    const s = await setup();
    await expect(
      s.accounts.requestEmailChange(
        s.login.session,
        'nuevo@example.com',
        'wrong-password-123',
        'ip',
      ),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(
      s.accounts.requestEmailChange(s.login.session, 'no-email', PASSWORD, 'ip'),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('sends no link to an address that is already taken, answering the same way', async () => {
    const s = await setup();
    await s.identity.register({
      fullName: 'Luis',
      email: 'luis@example.com',
      password: PASSWORD,
      acceptedPolicy: true,
      ip: 'ip9',
    });
    const before = s.email.sent.length;
    await expect(
      s.accounts.requestEmailChange(s.login.session, 'luis@example.com', PASSWORD, 'ip'),
    ).resolves.toBeUndefined();
    const sentToLuisAfter = s.email.sent.slice(before).filter((m) => m.to === 'luis@example.com');
    expect(sentToLuisAfter).toHaveLength(0);
  });

  it('rejects used or invalid confirmation links', async () => {
    const s = await setup();
    await s.accounts.requestEmailChange(s.login.session, 'nuevo@example.com', PASSWORD, 'ip');
    const token = s.email.lastToken();
    await s.accounts.confirmEmailChange(token, 'ip');
    await expect(s.accounts.confirmEmailChange(token, 'ip')).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
    await expect(s.accounts.confirmEmailChange('bogus', 'ip')).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
  });
});

describe('AccountService - reauthentication and erasure (FR-015)', () => {
  it('leaves a reauthentication proof only after a correct password', async () => {
    const s = await setup();
    await expect(
      s.accounts.reauthenticate(s.login.session, 'wrong-password-123', 'ip'),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(s.sessions.reauth.size).toBe(0);
    await s.accounts.reauthenticate(s.login.session, PASSWORD, 'ip');
    expect(s.sessions.reauth.has(s.login.session.accountId)).toBe(true);
  });

  it('erases identity data, disables login, revokes sessions and confirms by email', async () => {
    const s = await setup();
    await s.accounts.eraseCustomerAccount(s.login.session.accountId);
    expect(await s.identity.getSession(s.login.sessionId)).toBeNull();
    const erased = await s.accounts.info(s.login.session).catch((e: unknown) => e);
    expect(erased).toBeDefined();
    const row = [...s.accountsRepo.items.values()][0];
    expect(JSON.stringify(row)).not.toContain('Ana');
    expect(s.email.sent.at(-1)?.to).toBe('ana@example.com');
    expect(s.email.sent.at(-1)?.subject).toContain('eliminada');
    await expect(
      s.identity.login({ email: 'ana@example.com', password: PASSWORD, ip: 'x' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(s.events.types()).toContain('account_erased');
  });

  it('is idempotent and ignores non-customers', async () => {
    const s = await setup();
    await s.accounts.eraseCustomerAccount(s.login.session.accountId);
    const sent = s.email.sent.length;
    await s.accounts.eraseCustomerAccount(s.login.session.accountId);
    expect(s.email.sent.length).toBe(sent);
    await expect(s.accounts.eraseCustomerAccount('does-not-exist')).resolves.toBeUndefined();
  });
});
