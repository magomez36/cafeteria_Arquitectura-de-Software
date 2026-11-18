import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { createClient } from 'redis';
import type {
  ConsentChange,
  ConsentPurpose,
  ConsentRepository,
  CustomerProfile,
  CustomerRepository,
  CustomerSession,
  DataInventoryItem,
  DataInventoryRepository,
  ErasureQueue,
  OrderSummary,
  OrdersHistoryPort,
  RightsRequest,
  RightsRequestRepository,
  RightsRequestStatus,
  RightsRequestType,
  SessionReader,
} from '../domain/ports';
import { decrypt, encrypt } from './crypto';

@Injectable()
export class CustomersConnections implements OnModuleDestroy {
  readonly pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  private readonly redis = createClient({
    ...(process.env.REDIS_URL ? { url: process.env.REDIS_URL } : {}),
    socket: { reconnectStrategy: false },
  });
  private connecting: Promise<unknown> | undefined;

  constructor() {
    this.redis.on('error', () => undefined);
  }

  async redisClient(): Promise<typeof this.redis> {
    if (this.redis.isReady) return this.redis;
    this.connecting ??= this.redis.connect().finally(() => {
      this.connecting = undefined;
    });
    await this.connecting;
    return this.redis;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis.isOpen) await this.redis.quit();
    await this.pool.end();
  }
}

interface CustomerRow {
  account_id: string;
  full_name_enc: string;
  phone_enc: string | null;
  preferences: Record<string, unknown>;
  anonymised_at: Date | null;
}

export class PgCustomerRepository implements CustomerRepository {
  constructor(
    private readonly pool: Pool,
    private readonly key: string,
  ) {}

  private toProfile(row: CustomerRow): CustomerProfile {
    return {
      accountId: row.account_id,
      fullName: row.anonymised_at ? '' : decrypt(row.full_name_enc, this.key),
      phone: row.phone_enc && !row.anonymised_at ? decrypt(row.phone_enc, this.key) : null,
      preferences: row.preferences,
      anonymisedAt: row.anonymised_at,
    };
  }

  async find(accountId: string): Promise<CustomerProfile | null> {
    const result = await this.pool.query<CustomerRow>(
      'SELECT * FROM customers.customers WHERE account_id = $1',
      [accountId],
    );
    const row = result.rows[0];
    return row ? this.toProfile(row) : null;
  }

  async ensure(accountId: string, fullName: string): Promise<CustomerProfile> {
    await this.pool.query(
      `INSERT INTO customers.customers (account_id, full_name_enc) VALUES ($1, $2)
       ON CONFLICT (account_id) DO NOTHING`,
      [accountId, encrypt(fullName, this.key)],
    );
    const profile = await this.find(accountId);
    if (!profile) throw new Error('Customer profile could not be created.');
    return profile;
  }

  async update(
    accountId: string,
    changes: { fullName?: string; phone?: string | null; preferences?: Record<string, unknown> },
  ): Promise<CustomerProfile | null> {
    const sets: string[] = ['updated_at = now()'];
    const values: unknown[] = [accountId];
    if (changes.fullName !== undefined) {
      values.push(encrypt(changes.fullName, this.key));
      sets.push(`full_name_enc = $${values.length}`);
    }
    if (changes.phone !== undefined) {
      values.push(changes.phone === null ? null : encrypt(changes.phone, this.key));
      sets.push(`phone_enc = $${values.length}`);
    }
    if (changes.preferences !== undefined) {
      values.push(JSON.stringify(changes.preferences));
      sets.push(`preferences = $${values.length}::jsonb`);
    }
    await this.pool.query(
      `UPDATE customers.customers SET ${sets.join(', ')} WHERE account_id = $1 AND anonymised_at IS NULL`,
      values,
    );
    return this.find(accountId);
  }

  async anonymise(accountId: string): Promise<void> {
    await this.pool.query(
      `UPDATE customers.customers
          SET full_name_enc = 'erased', phone_enc = NULL, preferences = '{}'::jsonb,
              anonymised_at = now(), updated_at = now()
        WHERE account_id = $1`,
      [accountId],
    );
  }
}

export class PgConsentRepository implements ConsentRepository {
  constructor(private readonly pool: Pool) {}

  async append(accountId: string, purpose: ConsentPurpose, granted: boolean): Promise<void> {
    await this.pool.query(
      'INSERT INTO customers.consents (account_id, purpose, granted) VALUES ($1, $2, $3)',
      [accountId, purpose, granted],
    );
  }

  async history(accountId: string): Promise<readonly ConsentChange[]> {
    const result = await this.pool.query<{
      purpose: ConsentPurpose;
      granted: boolean;
      changed_at: Date;
    }>(
      'SELECT purpose, granted, changed_at FROM customers.consents WHERE account_id = $1 ORDER BY id',
      [accountId],
    );
    return result.rows.map((r) => ({
      purpose: r.purpose,
      granted: r.granted,
      changedAt: r.changed_at,
    }));
  }
}

export class PgRightsRequestRepository implements RightsRequestRepository {
  constructor(private readonly pool: Pool) {}

  private map(row: {
    id: string;
    type: RightsRequestType;
    status: RightsRequestStatus;
    due_at: Date;
    created_at: Date;
    completed_at: Date | null;
  }): RightsRequest {
    return {
      id: row.id,
      type: row.type,
      status: row.status,
      dueAt: row.due_at,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    };
  }

  async create(
    accountId: string,
    type: RightsRequestType,
    status: RightsRequestStatus,
    dueAt: Date,
  ): Promise<RightsRequest> {
    const result = await this.pool.query(
      `INSERT INTO customers.rights_requests (account_id, type, status, due_at, completed_at)
       VALUES ($1, $2, $3, $4, CASE WHEN $3 = 'completed' THEN now() ELSE NULL END)
       RETURNING id, type, status, due_at, created_at, completed_at`,
      [accountId, type, status, dueAt],
    );
    return this.map(result.rows[0]);
  }

  async list(accountId: string): Promise<readonly RightsRequest[]> {
    const result = await this.pool.query(
      `SELECT id, type, status, due_at, created_at, completed_at
         FROM customers.rights_requests WHERE account_id = $1 ORDER BY created_at`,
      [accountId],
    );
    return result.rows.map((r) => this.map(r));
  }
}

export class PgDataInventoryRepository implements DataInventoryRepository {
  constructor(private readonly pool: Pool) {}

  async list(): Promise<readonly DataInventoryItem[]> {
    const result = await this.pool.query<{
      data_item: string;
      purpose: string;
      retention: string;
      optional: boolean;
    }>('SELECT data_item, purpose, retention, optional FROM customers.data_inventory ORDER BY id');
    return result.rows.map((r) => ({
      dataItem: r.data_item,
      purpose: r.purpose,
      retention: r.retention,
      optional: r.optional,
    }));
  }
}

/** Reads the shared platform session; the key format is documented in plan.md as a proposed contract. */
export class RedisSessionReader implements SessionReader {
  constructor(private readonly connections: CustomersConnections) {}

  async read(sessionId: string): Promise<CustomerSession | null> {
    const redis = await this.connections.redisClient();
    const raw = await redis.get(`identity:session:${sessionId}`);
    if (!raw) return null;
    const data = JSON.parse(raw) as { accountId: string; role: string; displayName: string };
    return { accountId: data.accountId, role: data.role, displayName: data.displayName };
  }

  async consumeReauthentication(accountId: string): Promise<boolean> {
    const redis = await this.connections.redisClient();
    return (await redis.getDel(`identity:reauth:${accountId}`)) !== null;
  }
}

export class RedisErasureQueue implements ErasureQueue {
  constructor(private readonly connections: CustomersConnections) {}

  async enqueue(accountId: string): Promise<void> {
    const redis = await this.connections.redisClient();
    await redis.rPush('platform:erasure-requests', JSON.stringify({ accountId }));
  }
}

/** Stub until the Orders module publishes its contract; never fabricates orders. */
export class PendingOrdersHistory implements OrdersHistoryPort {
  isAvailable(): boolean {
    return false;
  }
  listFor(): Promise<readonly OrderSummary[]> {
    return Promise.resolve([]);
  }
  hasOpenOrders(): Promise<boolean> {
    return Promise.resolve(false);
  }
}
