import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  otpauthUri,
  totpCode,
  verifyTotp,
} from './totp';

// RFC 6238 Appendix B test vectors (SHA-1, secret "12345678901234567890").
const rfcSecret = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP (RFC 6238)', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
  ])('matches the RFC vector at T=%d', (seconds, expected) => {
    expect(totpCode(rfcSecret, seconds * 1000, 8)).toBe(expected);
  });

  it('round-trips base32', () => {
    const bytes = Buffer.from('hello totp secret');
    expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
  });

  it('generates 160-bit secrets that differ each time', () => {
    const a = generateTotpSecret();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(a).not.toBe(generateTotpSecret());
  });

  it('accepts the current and adjacent steps only', () => {
    const now = 1_700_000_000_000;
    const code = totpCode(rfcSecret, now);
    expect(verifyTotp(rfcSecret, code, now)).toBe(true);
    expect(verifyTotp(rfcSecret, code, now + 30_000)).toBe(true);
    expect(verifyTotp(rfcSecret, code, now + 90_000)).toBe(false);
  });

  it('rejects malformed codes', () => {
    expect(verifyTotp(rfcSecret, '12345', 0)).toBe(false);
    expect(verifyTotp(rfcSecret, 'abcdef', 0)).toBe(false);
  });

  it('builds an otpauth URI', () => {
    const uri = otpauthUri('ABC234', 'ana@example.com');
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain('secret=ABC234');
  });
});
