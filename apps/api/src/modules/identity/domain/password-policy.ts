export const MIN_PASSWORD_LENGTH = 12;

export type PasswordProblem = 'too_short' | 'known_breached';

// Local denylist of very common leaked passwords (no external service). Compared in lowercase.
const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  'password1234',
  'password12345',
  'passw0rd1234',
  '123456789012',
  '1234567890123',
  'qwertyuiop12',
  'qwerty123456',
  'qwertyuiop123',
  'iloveyou1234',
  'welcome12345',
  'administrator',
  'letmein12345',
  'monkey123456',
  'dragon123456',
  'football1234',
  'baseball1234',
  'abc123456789',
  'changeme1234',
  'trustno11234',
  'cafeteria1234',
  'contrasena123',
  'contrasena1234',
  'micontrasena1',
  'bienvenido123',
  '111111111111',
  'aaaaaaaaaaaa',
  '000000000000',
  'password!2345',
  'p@ssw0rd1234',
]);

/** Returns the list of problems; empty when the password is acceptable (FR-004). */
export function checkPassword(password: string): PasswordProblem[] {
  const problems: PasswordProblem[] = [];
  if ([...password].length < MIN_PASSWORD_LENGTH) problems.push('too_short');
  if (COMMON_PASSWORDS.has(password.toLowerCase())) problems.push('known_breached');
  return problems;
}
