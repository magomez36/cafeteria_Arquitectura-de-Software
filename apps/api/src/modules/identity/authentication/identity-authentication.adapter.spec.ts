import { InMemorySessions, FakeEvents } from '../tests/in-memory';
import { IdentityAuthenticationAdapter } from './identity-authentication.adapter';
import type { IdentityService } from '../application/identity-service';

function setup() {
  const sessions = new InMemorySessions();
  const events = new FakeEvents();
  const identity = {
    getSession: (t: string | null) => (t ? sessions.get(t) : Promise.resolve(null)),
    recordAccessDenied: (id: string) => events.record('access_denied', id, 'h'),
  } as unknown as IdentityService;
  return { sessions, events, adapter: new IdentityAuthenticationAdapter(identity) };
}

describe('IdentityAuthenticationAdapter', () => {
  it('rejects a missing or unknown session', async () => {
    const { adapter } = setup();
    expect(await adapter.authenticate(null, { allowedRoles: ['staff'] })).toEqual({
      ok: false,
      reason: 'unauthenticated',
    });
    expect((await adapter.authenticate('nope', { allowedRoles: ['staff'] })).ok).toBe(false);
  });

  it('returns a minimal identity without personal data', async () => {
    const { adapter, sessions } = setup();
    const t = await sessions.create({
      accountId: 'a1',
      role: 'staff',
      displayName: 'Ana',
      mfaVerified: true,
    });
    const r = await adapter.authenticate(t, { allowedRoles: ['staff', 'admin'] });
    expect(r).toEqual({
      ok: true,
      identity: { identityId: 'a1', roles: ['staff'], mfaVerified: true },
    });
  });

  it('denies and records a role that is not allowed', async () => {
    const { adapter, sessions, events } = setup();
    const t = await sessions.create({
      accountId: 'c1',
      role: 'customer',
      displayName: 'C',
      mfaVerified: false,
    });
    expect(await adapter.authenticate(t, { allowedRoles: ['admin'] })).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    expect(events.types()).toEqual(['access_denied']);
  });

  it('denies staff without MFA verified', async () => {
    const { adapter, sessions, events } = setup();
    const t = await sessions.create({
      accountId: 's1',
      role: 'staff',
      displayName: 'S',
      mfaVerified: false,
    });
    expect((await adapter.authenticate(t, { allowedRoles: ['staff'] })).ok).toBe(false);
    expect(events.types()).toEqual(['access_denied']);
  });

  it('denies everyone when allowedRoles is empty', async () => {
    const { adapter, sessions } = setup();
    const t = await sessions.create({
      accountId: 'a',
      role: 'admin',
      displayName: 'A',
      mfaVerified: true,
    });
    expect((await adapter.authenticate(t, { allowedRoles: [] })).ok).toBe(false);
  });
});
