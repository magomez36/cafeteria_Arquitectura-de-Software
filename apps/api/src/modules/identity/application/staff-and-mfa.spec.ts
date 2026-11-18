import { randomBytes } from 'node:crypto';
import {
  ForbiddenError,
  InvalidCredentialsError,
  TooManyAttemptsError,
  UnauthenticatedError,
  ValidationError,
} from '../domain/errors';
import type { SessionData } from '../domain/ports';
import { totpCode } from '../domain/totp';
import { hashPassword } from '../infrastructure/password-hasher';
import { blindIndex, decryptPii, encryptPii } from '../infrastructure/pii-cipher';
import {
  FakeEmail,
  FakeEvents,
  InMemoryAccounts,
  InMemoryLimiter,
  InMemorySessions,
  InMemoryTokens,
} from '../tests/in-memory';
import { IdentityService, type IdentityDeps } from './identity-service';
import { MfaService } from './mfa-service';
import { StaffService } from './staff-service';

const ADMIN_PASSWORD = 'admin-clave-segura-2026';
const STAFF_PASSWORD = 'personal-clave-segura-2026';

async function setup() {
  const clock = { current: new Date('2026-11-18T10:00:00Z') };
  const piiKey = randomBytes(32).toString('base64');
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
    config: { piiKey, webBaseUrl: 'http://web.test', sessionTtlSeconds: 3600 },
    now: () => clock.current,
  };
  const identity = new IdentityService(deps);
  const mfa = new MfaService(deps, identity);
  const staff = new StaffService(deps, identity);
  const admin = await parts.accounts.create({
    emailBlind: blindIndex('admin@example.com', piiKey),
    emailEnc: encryptPii('admin@example.com', piiKey),
    displayNameEnc: encryptPii('Admin', piiKey),
    passwordHash: await hashPassword(ADMIN_PASSWORD),
    role: 'admin',
    status: 'active',
    policyAcceptedAt: null,
  });
  if (!admin) throw new Error('admin not created');
  const adminSession: SessionData = {
    accountId: admin.id,
    role: 'admin',
    displayName: 'Admin',
    mfaVerified: true,
  };
  return { ...parts, clock, piiKey, identity, mfa, staff, admin, adminSession };
}

async function onboardStaff(s: Awaited<ReturnType<typeof setup>>) {
  await s.staff.invite(
    s.adminSession,
    { fullName: 'Luis Mesero', email: 'Luis@Example.com' },
    'ip',
  );
  const token = s.email.lastToken();
  await s.staff.acceptInvite(token, STAFF_PASSWORD, 'ip');
  const login = await s.identity.login({
    email: 'luis@example.com',
    password: STAFF_PASSWORD,
    ip: 'ip',
  });
  if (login.status !== 'mfa_enrollment_required') throw new Error(`unexpected ${login.status}`);
  const enrollment = await s.mfa.startEnrollment(login.session);
  const confirmed = await s.mfa.confirmEnrollment(
    login.sessionId,
    login.session,
    totpCode(enrollment.secret, s.clock.current.getTime()),
    'ip',
  );
  return { enrollment, confirmed, login };
}

describe('US2 scenario 1: admin invites staff', () => {
  it('creates a pending staff account and emails an invitation', async () => {
    const s = await setup();
    await s.staff.invite(
      s.adminSession,
      { fullName: 'Luis Mesero', email: 'luis@example.com' },
      'ip',
    );
    const [account] = (await s.accounts.listStaff()).filter((a) => a.role === 'staff');
    expect(account?.status).toBe('pending');
    expect(s.email.sent.at(-1)?.subject).toContain('Invitación');
    expect(s.email.sent.at(-1)?.text).toContain('segundo factor');
  });

  it('forces MFA enrollment on first access and enables the second factor', async () => {
    const s = await setup();
    const { confirmed } = await onboardStaff(s);
    expect(confirmed.session.mfaVerified).toBe(true);
    const staffAccount = [...s.accounts.items.values()].find((a) => a.role === 'staff');
    expect(staffAccount?.mfaEnabled).toBe(true);
    expect(staffAccount?.mfaSecretEnc).not.toContain('=');
  });

  it('requires the second factor on later logins', async () => {
    const s = await setup();
    const { enrollment } = await onboardStaff(s);
    const login = await s.identity.login({
      email: 'luis@example.com',
      password: STAFF_PASSWORD,
      ip: 'ip2',
    });
    expect(login.status).toBe('mfa_required');
    if (login.status !== 'mfa_required') return;
    await expect(s.mfa.verifyLogin(login.challengeId, '000000', 'ip2')).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
    const ok = await s.mfa.verifyLogin(
      login.challengeId,
      totpCode(enrollment.secret, s.clock.current.getTime()),
      'ip2',
    );
    expect(ok.status).toBe('authenticated');
    expect(s.events.types()).toContain('mfa_failed');
  });

  it('limits second-factor attempts', async () => {
    const s = await setup();
    await onboardStaff(s);
    const login = await s.identity.login({
      email: 'luis@example.com',
      password: STAFF_PASSWORD,
      ip: 'ip3',
    });
    if (login.status !== 'mfa_required') throw new Error('unexpected');
    const results: unknown[] = [];
    for (let i = 0; i < 7; i += 1) {
      results.push(
        await s.mfa.verifyLogin(login.challengeId, '000000', 'ip3').catch((e: unknown) => e),
      );
    }
    expect(results.slice(-1)[0]).toBeInstanceOf(TooManyAttemptsError);
  });

  it('rejects an existing email with a field error', async () => {
    const s = await setup();
    await s.staff.invite(s.adminSession, { fullName: 'Luis', email: 'luis@example.com' }, 'ip');
    await expect(
      s.staff.invite(s.adminSession, { fullName: 'Luis', email: 'luis@example.com' }, 'ip'),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('US2 scenario 3: role is enforced on the server', () => {
  it('denies staff and unverified admins and records the attempt', async () => {
    const s = await setup();
    const staffSession: SessionData = {
      accountId: 'x',
      role: 'staff',
      displayName: 'Luis',
      mfaVerified: true,
    };
    await expect(
      s.staff.invite(staffSession, { fullName: 'Otro', email: 'otro@example.com' }, 'ip'),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      s.staff.list({ ...s.adminSession, mfaVerified: false }, 'ip'),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      s.staff.invite(
        { ...staffSession, role: 'customer' },
        { fullName: 'A', email: 'a@example.com' },
        'ip',
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(s.events.types().filter((t) => t === 'access_denied')).toHaveLength(3);
  });

  it('refuses to act on non-staff accounts', async () => {
    const s = await setup();
    await expect(s.staff.deactivate(s.adminSession, s.admin.id, 'ip')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('lists staff and admins with decrypted contact data only for admins', async () => {
    const s = await setup();
    await onboardStaff(s);
    const list = await s.staff.list(s.adminSession, 'ip');
    expect(list).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: 'luis@example.com',
          displayName: 'Luis Mesero',
          mfaEnabled: true,
        }),
        expect.objectContaining({ email: 'admin@example.com', role: 'admin' }),
      ]),
    );
  });
});

describe('US2 scenario 4 and edge case: deactivation and MFA reset', () => {
  it('ends active sessions immediately when deactivating', async () => {
    const s = await setup();
    const { confirmed } = await onboardStaff(s);
    const staffAccount = [...s.accounts.items.values()].find((a) => a.role === 'staff');
    await s.staff.deactivate(s.adminSession, staffAccount?.id ?? '', 'ip');
    expect(await s.identity.getSession(confirmed.sessionId)).toBeNull();
    await expect(
      s.identity.login({ email: 'luis@example.com', password: STAFF_PASSWORD, ip: 'ip' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(s.events.types()).toContain('account_disabled');
    await s.staff.reactivate(s.adminSession, staffAccount?.id ?? '', 'ip');
    expect(s.events.types()).toContain('account_reactivated');
  });

  it('resets a lost second factor, revokes sessions and logs it', async () => {
    const s = await setup();
    const { confirmed } = await onboardStaff(s);
    const staffAccount = [...s.accounts.items.values()].find((a) => a.role === 'staff');
    await s.staff.resetMfa(s.adminSession, staffAccount?.id ?? '', 'ip');
    expect(await s.identity.getSession(confirmed.sessionId)).toBeNull();
    const relogin = await s.identity.login({
      email: 'luis@example.com',
      password: STAFF_PASSWORD,
      ip: 'ip',
    });
    expect(relogin.status).toBe('mfa_enrollment_required');
    expect(s.events.types()).toContain('mfa_reset');
  });

  it('does not log personal data in security events', async () => {
    const s = await setup();
    await onboardStaff(s);
    const dump = JSON.stringify(s.events.recorded);
    expect(dump).not.toContain('luis@example.com');
    expect(dump).not.toContain(STAFF_PASSWORD);
  });
});

describe('MFA enrollment guards', () => {
  it('requires a session', async () => {
    const s = await setup();
    await expect(s.mfa.startEnrollment(null)).rejects.toBeInstanceOf(UnauthenticatedError);
    await expect(s.mfa.confirmEnrollment('id', null, '123456', 'ip')).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  it('stores the secret encrypted and rejects a wrong confirmation code', async () => {
    const s = await setup();
    const enrollment = await s.mfa.startEnrollment(s.adminSession);
    const stored = (await s.accounts.findById(s.admin.id))?.mfaSecretEnc ?? '';
    expect(stored).not.toContain(enrollment.secret);
    expect(decryptPii(stored, s.piiKey)).toBe(enrollment.secret);
    await expect(
      s.mfa.confirmEnrollment('sid', s.adminSession, '000000', 'ip'),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect((await s.accounts.findById(s.admin.id))?.mfaEnabled).toBe(false);
  });

  it('does not allow re-enrolling once enabled', async () => {
    const s = await setup();
    const enrollment = await s.mfa.startEnrollment(s.adminSession);
    await s.mfa.confirmEnrollment(
      'sid',
      s.adminSession,
      totpCode(enrollment.secret, s.clock.current.getTime()),
      'ip',
    );
    await expect(s.mfa.startEnrollment(s.adminSession)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
