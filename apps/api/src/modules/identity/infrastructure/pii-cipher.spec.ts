import { randomBytes } from 'node:crypto';
import { blindIndex, decryptPii, encryptPii } from './pii-cipher';

const key = randomBytes(32).toString('base64');
const otherKey = randomBytes(32).toString('base64');

describe('PII cipher', () => {
  it('round-trips and never exposes the plaintext', () => {
    const payload = encryptPii('ana@example.com', key);
    expect(payload).not.toContain('ana');
    expect(decryptPii(payload, key)).toBe('ana@example.com');
  });

  it('uses a fresh IV so equal inputs encrypt differently', () => {
    expect(encryptPii('same', key)).not.toBe(encryptPii('same', key));
  });

  it('fails with the wrong key or tampered data', () => {
    const payload = encryptPii('secret', key);
    expect(() => decryptPii(payload, otherKey)).toThrow();
    const parts = payload.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptPii(parts.join('.'), key)).toThrow();
  });

  it('rejects keys that are not 32 bytes', () => {
    expect(() => encryptPii('x', Buffer.from('short').toString('base64'))).toThrow('32 bytes');
  });

  it('blind index is stable and case-insensitive', () => {
    expect(blindIndex(' Ana@Example.com ', key)).toBe(blindIndex('ana@example.com', key));
    expect(blindIndex('ana@example.com', key)).not.toBe(blindIndex('ana@example.com', otherKey));
  });
});
