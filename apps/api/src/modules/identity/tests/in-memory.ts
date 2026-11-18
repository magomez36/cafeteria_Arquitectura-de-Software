import { randomUUID } from 'node:crypto';
import type {
  Account,
  AccountRepository,
  AccountStatus,
  EmailMessage,
  EmailPort,
  NewAccount,
  RateLimiter,
  SecurityEventLog,
  SecurityEventType,
  SessionData,
  SessionStore,
  StoredOneTimeToken,
  TokenRepository,
} from '../domain/ports';
import type { TokenPurpose } from '../domain/one-time-token';

export class InMemoryAccounts implements AccountRepository {
  readonly items = new Map<string, Account>();
  create(a: NewAccount): Promise<Account | null> {
    if ([...this.items.values()].some((x) => x.emailBlind === a.emailBlind))
      return Promise.resolve(null);
    const account: Account = {
      id: randomUUID(),
      emailBlind: a.emailBlind,
      emailEnc: a.emailEnc,
      displayNameEnc: a.displayNameEnc,
      passwordHash: a.passwordHash,
      role: a.role,
      status: a.status,
      mfaEnabled: false,
      mfaSecretEnc: null,
    };
    this.items.set(account.id, account);
    return Promise.resolve(account);
  }
  findByEmailBlind(b: string): Promise<Account | null> {
    return Promise.resolve([...this.items.values()].find((x) => x.emailBlind === b) ?? null);
  }
  findById(id: string): Promise<Account | null> {
    return Promise.resolve(this.items.get(id) ?? null);
  }
  private patch(id: string, p: Partial<Account>): Promise<void> {
    const a = this.items.get(id);
    if (a) this.items.set(id, { ...a, ...p });
    return Promise.resolve();
  }
  setStatus(id: string, status: AccountStatus): Promise<void> {
    return this.patch(id, { status });
  }
  setPassword(id: string, passwordHash: string): Promise<void> {
    return this.patch(id, { passwordHash });
  }
  setMfa(id: string, mfaSecretEnc: string | null, mfaEnabled: boolean): Promise<void> {
    return this.patch(id, { mfaSecretEnc, mfaEnabled });
  }
  listStaff(): Promise<readonly Account[]> {
    return Promise.resolve([...this.items.values()].filter((x) => x.role !== 'customer'));
  }
}

export class InMemoryTokens implements TokenRepository {
  readonly items = new Map<string, StoredOneTimeToken>();
  save(t: {
    tokenHash: string;
    accountId: string;
    purpose: TokenPurpose;
    expiresAt: Date;
  }): Promise<void> {
    this.items.set(t.tokenHash, {
      accountId: t.accountId,
      purpose: t.purpose,
      expiresAt: t.expiresAt,
      usedAt: null,
    });
    return Promise.resolve();
  }
  find(h: string): Promise<StoredOneTimeToken | null> {
    return Promise.resolve(this.items.get(h) ?? null);
  }
  markUsed(h: string, now: Date): Promise<boolean> {
    const t = this.items.get(h);
    if (!t || t.usedAt) return Promise.resolve(false);
    this.items.set(h, { ...t, usedAt: now });
    return Promise.resolve(true);
  }
}

export class InMemorySessions implements SessionStore {
  readonly sessions = new Map<string, SessionData>();
  readonly challenges = new Map<string, string>();
  create(data: SessionData): Promise<string> {
    const id = randomUUID();
    this.sessions.set(id, data);
    return Promise.resolve(id);
  }
  get(id: string): Promise<SessionData | null> {
    return Promise.resolve(this.sessions.get(id) ?? null);
  }
  revoke(id: string): Promise<void> {
    this.sessions.delete(id);
    return Promise.resolve();
  }
  revokeAllForAccount(accountId: string): Promise<void> {
    for (const [id, s] of this.sessions) if (s.accountId === accountId) this.sessions.delete(id);
    return Promise.resolve();
  }
  createChallenge(accountId: string): Promise<string> {
    const id = randomUUID();
    this.challenges.set(id, accountId);
    return Promise.resolve(id);
  }
  readChallenge(id: string): Promise<string | null> {
    return Promise.resolve(this.challenges.get(id) ?? null);
  }
  deleteChallenge(id: string): Promise<void> {
    this.challenges.delete(id);
    return Promise.resolve();
  }
}

export class InMemoryLimiter implements RateLimiter {
  private readonly counts = new Map<string, number>();
  hit(
    key: string,
    limit: number,
  ): Promise<{ allowed: boolean; count: number; retryAfterSeconds: number }> {
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    return Promise.resolve({ allowed: count <= limit, count, retryAfterSeconds: 60 });
  }
}

export class FakeEmail implements EmailPort {
  readonly sent: EmailMessage[] = [];
  fail = false;
  send(message: EmailMessage): Promise<void> {
    if (this.fail) return Promise.reject(new Error('smtp down'));
    this.sent.push(message);
    return Promise.resolve();
  }
  lastToken(): string {
    const last = this.sent[this.sent.length - 1];
    const match = last ? /token=([^\s&]+)/.exec(last.text) : null;
    if (!match?.[1]) throw new Error('No token in last email');
    return decodeURIComponent(match[1]);
  }
}

export class FakeEvents implements SecurityEventLog {
  readonly recorded: {
    type: SecurityEventType;
    accountId: string | null;
    ipHash: string | null;
  }[] = [];
  record(type: SecurityEventType, accountId: string | null, ipHash: string | null): Promise<void> {
    this.recorded.push({ type, accountId, ipHash });
    return Promise.resolve();
  }
  types(): SecurityEventType[] {
    return this.recorded.map((e) => e.type);
  }
}
