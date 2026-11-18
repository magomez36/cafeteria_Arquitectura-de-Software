import { checkPassword } from './password-policy';

describe('password policy', () => {
  it('accepts a long, uncommon passphrase', () => {
    expect(checkPassword('azul-cafe-montana-2026')).toEqual([]);
  });

  it('rejects passwords shorter than 12 characters', () => {
    expect(checkPassword('short1!')).toContain('too_short');
  });

  it('counts characters, not bytes', () => {
    expect(checkPassword('ñññññññññññ')).toContain('too_short');
    expect(checkPassword('ññññññññññññ')).toEqual([]);
  });

  it('rejects known breached passwords case-insensitively', () => {
    expect(checkPassword('PassWord1234')).toContain('known_breached');
  });

  it('reports only the length problem for a short unknown password', () => {
    expect(checkPassword('123')).toEqual(['too_short']);
  });
});
