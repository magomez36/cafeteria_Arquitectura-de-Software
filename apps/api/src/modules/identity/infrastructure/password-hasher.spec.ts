import { hashPassword, verifyPassword } from './password-hasher';

describe('password hasher (Argon2id)', () => {
  it('produces an argon2id hash that verifies the right password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('argon2id$')).toBe(true);
    expect(hash).not.toContain('correct horse');
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    await expect(verifyPassword('wrong password value', hash)).resolves.toBe(false);
  });

  it('uses a different salt each time', async () => {
    const a = await hashPassword('same password 123');
    const b = await hashPassword('same password 123');
    expect(a).not.toBe(b);
  });

  it('rejects malformed stored hashes without throwing', async () => {
    await expect(verifyPassword('x', 'not-a-hash')).resolves.toBe(false);
    await expect(verifyPassword('x', 'bcrypt$1$2$3$4$5')).resolves.toBe(false);
  });
});
