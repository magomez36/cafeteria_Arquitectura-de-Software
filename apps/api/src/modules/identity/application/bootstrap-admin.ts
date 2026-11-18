import { ValidationError } from '../domain/errors';
import type { AccountRepository } from '../domain/ports';
import { normalizeEmail, validateEmail, validateNewPassword } from '../domain/validation';
import { hashPassword } from '../infrastructure/password-hasher';
import { blindIndex, encryptPii } from '../infrastructure/pii-cipher';

/** Creates the first administrator out of band; MFA is enrolled on their first login. */
export async function bootstrapAdmin(
  accounts: AccountRepository,
  piiKey: string,
  input: { email: string; fullName: string; password: string },
): Promise<void> {
  const email = normalizeEmail(input.email);
  const errors = [...validateEmail(email), ...validateNewPassword(input.password)];
  if (errors.length > 0) throw new ValidationError(errors);
  const created = await accounts.create({
    emailBlind: blindIndex(email, piiKey),
    emailEnc: encryptPii(email, piiKey),
    displayNameEnc: encryptPii(input.fullName.trim() || 'Administrador', piiKey),
    passwordHash: await hashPassword(input.password),
    role: 'admin',
    status: 'active',
    policyAcceptedAt: null,
  });
  if (!created) throw new Error('An account with that email already exists.');
}
