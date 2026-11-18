import { createHash, randomBytes } from 'node:crypto';

export type TokenPurpose = 'verify_email' | 'reset_password' | 'invite' | 'change_email';

/** Time to live per purpose, in milliseconds. Password reset is 30 minutes (FR-003). */
export const TOKEN_TTL_MS: Readonly<Record<TokenPurpose, number>> = {
  verify_email: 24 * 60 * 60 * 1000,
  reset_password: 30 * 60 * 1000,
  invite: 72 * 60 * 60 * 1000,
  change_email: 60 * 60 * 1000,
};

export interface IssuedToken {
  /** Sent to the user. Never stored. */
  readonly token: string;
  /** Stored in the database. */
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function issueToken(purpose: TokenPurpose, now: Date = new Date()): IssuedToken {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + TOKEN_TTL_MS[purpose]),
  };
}

export interface StoredToken {
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
}

export type TokenState = 'valid' | 'expired' | 'used';

export function tokenState(stored: StoredToken, now: Date = new Date()): TokenState {
  if (stored.usedAt) return 'used';
  return stored.expiresAt.getTime() <= now.getTime() ? 'expired' : 'valid';
}
