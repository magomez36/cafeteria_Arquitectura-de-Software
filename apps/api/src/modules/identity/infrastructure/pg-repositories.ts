import type { Pool } from 'pg';
import type { TokenPurpose } from '../domain/one-time-token';
import type {
  Account,
  AccountRepository,
  AccountStatus,
  NewAccount,
  Role,
  SecurityEventLog,
  SecurityEventType,
  StoredOneTimeToken,
  TokenRepository,
} from '../domain/ports';

interface AccountRow {
  id: string;
  email_blind: string;
  email_enc: string;
  display_name_enc: string | null;
  password_hash: string;
  role: Role;
  status: AccountStatus;
  mfa_enabled: boolean;
  mfa_secret_enc: string | null;
}

const COLUMNS =
  'id, email_blind, email_enc, display_name_enc, password_hash, role, status, mfa_enabled, mfa_secret_enc';

function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    emailBlind: row.email_blind,
    emailEnc: row.email_enc,
    displayNameEnc: row.display_name_enc,
    passwordHash: row.password_hash,
    role: row.role,
    status: row.status,
    mfaEnabled: row.mfa_enabled,
    mfaSecretEnc: row.mfa_secret_enc,
  };
}

export class PgAccountRepository implements AccountRepository {
  constructor(private readonly pool: Pool) {}

  async create(a: NewAccount): Promise<Account | null> {
    const result = await this.pool.query<AccountRow>(
      `INSERT INTO identity.accounts
         (email_blind, email_enc, display_name_enc, password_hash, role, status, policy_accepted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (email_blind) DO NOTHING
       RETURNING ${COLUMNS}`,
      [
        a.emailBlind,
        a.emailEnc,
        a.displayNameEnc,
        a.passwordHash,
        a.role,
        a.status,
        a.policyAcceptedAt,
      ],
    );
    const row = result.rows[0];
    return row ? toAccount(row) : null;
  }

  async findByEmailBlind(emailBlind: string): Promise<Account | null> {
    const result = await this.pool.query<AccountRow>(
      `SELECT ${COLUMNS} FROM identity.accounts WHERE email_blind = $1`,
      [emailBlind],
    );
    const row = result.rows[0];
    return row ? toAccount(row) : null;
  }

  async findById(id: string): Promise<Account | null> {
    const result = await this.pool.query<AccountRow>(
      `SELECT ${COLUMNS} FROM identity.accounts WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    return row ? toAccount(row) : null;
  }

  async setStatus(id: string, status: AccountStatus): Promise<void> {
    await this.pool.query(
      'UPDATE identity.accounts SET status = $2, updated_at = now() WHERE id = $1',
      [id, status],
    );
  }

  async setPassword(id: string, passwordHash: string): Promise<void> {
    await this.pool.query(
      'UPDATE identity.accounts SET password_hash = $2, updated_at = now() WHERE id = $1',
      [id, passwordHash],
    );
  }

  async setMfa(id: string, secretEnc: string | null, enabled: boolean): Promise<void> {
    await this.pool.query(
      'UPDATE identity.accounts SET mfa_secret_enc = $2, mfa_enabled = $3, updated_at = now() WHERE id = $1',
      [id, secretEnc, enabled],
    );
  }

  async setEmail(id: string, emailBlind: string, emailEnc: string): Promise<void> {
    await this.pool.query(
      'UPDATE identity.accounts SET email_blind = $2, email_enc = $3, updated_at = now() WHERE id = $1',
      [id, emailBlind, emailEnc],
    );
  }

  async erase(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE identity.accounts
          SET email_blind = 'erased:' || id::text, email_enc = 'erased', display_name_enc = NULL,
              password_hash = 'erased', status = 'disabled', mfa_secret_enc = NULL, mfa_enabled = false,
              updated_at = now()
        WHERE id = $1`,
      [id],
    );
    await this.pool.query('DELETE FROM identity.one_time_tokens WHERE account_id = $1', [id]);
  }

  async listStaff(): Promise<readonly Account[]> {
    const result = await this.pool.query<AccountRow>(
      `SELECT ${COLUMNS} FROM identity.accounts WHERE role IN ('staff', 'admin') ORDER BY created_at`,
    );
    return result.rows.map(toAccount);
  }
}

export class PgTokenRepository implements TokenRepository {
  constructor(private readonly pool: Pool) {}

  async save(t: {
    tokenHash: string;
    accountId: string;
    purpose: TokenPurpose;
    expiresAt: Date;
    payloadEnc?: string;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO identity.one_time_tokens (token_hash, account_id, purpose, expires_at, payload_enc)
       VALUES ($1, $2, $3, $4, $5)`,
      [t.tokenHash, t.accountId, t.purpose, t.expiresAt, t.payloadEnc ?? null],
    );
  }

  async find(tokenHash: string): Promise<StoredOneTimeToken | null> {
    const result = await this.pool.query<{
      account_id: string;
      purpose: TokenPurpose;
      expires_at: Date;
      used_at: Date | null;
      payload_enc: string | null;
    }>(
      'SELECT account_id, purpose, expires_at, used_at, payload_enc FROM identity.one_time_tokens WHERE token_hash = $1',
      [tokenHash],
    );
    const row = result.rows[0];
    return row
      ? {
          accountId: row.account_id,
          purpose: row.purpose,
          expiresAt: row.expires_at,
          usedAt: row.used_at,
          payloadEnc: row.payload_enc,
        }
      : null;
  }

  async markUsed(tokenHash: string, now: Date): Promise<boolean> {
    const result = await this.pool.query(
      'UPDATE identity.one_time_tokens SET used_at = $2 WHERE token_hash = $1 AND used_at IS NULL',
      [tokenHash, now],
    );
    return (result.rowCount ?? 0) === 1;
  }
}

export class PgSecurityEventLog implements SecurityEventLog {
  constructor(private readonly pool: Pool) {}

  async record(
    type: SecurityEventType,
    accountId: string | null,
    ipHash: string | null,
  ): Promise<void> {
    await this.pool.query(
      'INSERT INTO identity.security_events (type, account_id, ip_hash) VALUES ($1, $2, $3)',
      [type, accountId, ipHash],
    );
  }
}
