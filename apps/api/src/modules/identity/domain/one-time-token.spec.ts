import { hashToken, issueToken, tokenState, TOKEN_TTL_MS } from './one-time-token';

describe('one-time tokens', () => {
  const now = new Date('2026-11-18T10:00:00Z');

  it('issues a random token and stores only its hash', () => {
    const a = issueToken('reset_password', now);
    const b = issueToken('reset_password', now);
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(43);
    expect(a.tokenHash).toBe(hashToken(a.token));
    expect(a.tokenHash).not.toContain(a.token);
  });

  it('expires password reset after 30 minutes', () => {
    const issued = issueToken('reset_password', now);
    expect(issued.expiresAt.getTime() - now.getTime()).toBe(30 * 60 * 1000);
    expect(TOKEN_TTL_MS.reset_password).toBe(30 * 60 * 1000);
  });

  it('reports valid, expired and used states', () => {
    const expiresAt = new Date(now.getTime() + 1000);
    expect(tokenState({ expiresAt, usedAt: null }, now)).toBe('valid');
    expect(tokenState({ expiresAt, usedAt: null }, new Date(now.getTime() + 1000))).toBe('expired');
    expect(tokenState({ expiresAt, usedAt: now }, now)).toBe('used');
  });
});
