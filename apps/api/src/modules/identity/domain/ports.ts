import type { TokenPurpose } from './one-time-token';

export type Role = 'customer' | 'staff' | 'admin';
export type AccountStatus = 'pending' | 'active' | 'disabled';

export interface Account {
  readonly id: string;
  readonly emailBlind: string;
  readonly emailEnc: string;
  readonly displayNameEnc: string | null;
  readonly passwordHash: string;
  readonly role: Role;
  readonly status: AccountStatus;
  readonly mfaEnabled: boolean;
  readonly mfaSecretEnc: string | null;
}

export interface NewAccount {
  readonly emailBlind: string;
  readonly emailEnc: string;
  readonly displayNameEnc: string;
  readonly passwordHash: string;
  readonly role: Role;
  readonly status: AccountStatus;
  readonly policyAcceptedAt: Date | null;
}

export interface AccountRepository {
  /** Returns null when the email already exists. */
  create(account: NewAccount): Promise<Account | null>;
  findByEmailBlind(emailBlind: string): Promise<Account | null>;
  findById(id: string): Promise<Account | null>;
  setStatus(id: string, status: AccountStatus): Promise<void>;
  setPassword(id: string, passwordHash: string): Promise<void>;
  setMfa(id: string, secretEnc: string | null, enabled: boolean): Promise<void>;
  listStaff(): Promise<readonly Account[]>;
}

export interface StoredOneTimeToken {
  readonly accountId: string;
  readonly purpose: TokenPurpose;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
}

export interface TokenRepository {
  save(token: {
    tokenHash: string;
    accountId: string;
    purpose: TokenPurpose;
    expiresAt: Date;
  }): Promise<void>;
  find(tokenHash: string): Promise<StoredOneTimeToken | null>;
  /** Atomically marks the token as used; false when it was already used. */
  markUsed(tokenHash: string, now: Date): Promise<boolean>;
}

export interface SessionData {
  readonly accountId: string;
  readonly role: Role;
  readonly displayName: string;
  /** False for staff/admin until the second factor is enrolled and verified. */
  readonly mfaVerified: boolean;
}

export interface SessionStore {
  create(data: SessionData, ttlSeconds: number): Promise<string>;
  get(sessionId: string): Promise<SessionData | null>;
  revoke(sessionId: string): Promise<void>;
  revokeAllForAccount(accountId: string): Promise<void>;
  createChallenge(accountId: string, ttlSeconds: number): Promise<string>;
  readChallenge(challengeId: string): Promise<string | null>;
  deleteChallenge(challengeId: string): Promise<void>;
}

export interface RateLimiter {
  hit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; count: number; retryAfterSeconds: number }>;
}

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export interface EmailPort {
  send(message: EmailMessage): Promise<void>;
}

export type SecurityEventType =
  | 'register'
  | 'email_verified'
  | 'login_success'
  | 'login_failed'
  | 'login_rate_limited'
  | 'logout'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'access_denied'
  | 'role_changed'
  | 'account_disabled'
  | 'account_reactivated'
  | 'mfa_enrolled'
  | 'mfa_failed'
  | 'mfa_reset'
  | 'email_delivery_failed';

export interface SecurityEventLog {
  record(type: SecurityEventType, accountId: string | null, ipHash: string | null): Promise<void>;
}
