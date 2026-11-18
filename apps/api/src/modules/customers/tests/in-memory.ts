import { randomUUID } from 'node:crypto';
import type {
  ConsentChange,
  ConsentPurpose,
  ConsentRepository,
  CustomerProfile,
  CustomerRepository,
  CustomerSession,
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

export class InMemoryCustomers implements CustomerRepository {
  readonly items = new Map<string, CustomerProfile>();
  find(id: string): Promise<CustomerProfile | null> {
    return Promise.resolve(this.items.get(id) ?? null);
  }
  ensure(id: string, fullName: string): Promise<CustomerProfile> {
    const existing = this.items.get(id);
    if (existing) return Promise.resolve(existing);
    const profile: CustomerProfile = {
      accountId: id,
      fullName,
      phone: null,
      preferences: {},
      anonymisedAt: null,
    };
    this.items.set(id, profile);
    return Promise.resolve(profile);
  }
  update(
    id: string,
    changes: { fullName?: string; phone?: string | null; preferences?: Record<string, unknown> },
  ): Promise<CustomerProfile | null> {
    const current = this.items.get(id);
    if (!current || current.anonymisedAt) return Promise.resolve(current ?? null);
    const next: CustomerProfile = {
      ...current,
      ...(changes.fullName !== undefined ? { fullName: changes.fullName } : {}),
      ...(changes.phone !== undefined ? { phone: changes.phone } : {}),
      ...(changes.preferences !== undefined ? { preferences: changes.preferences } : {}),
    };
    this.items.set(id, next);
    return Promise.resolve(next);
  }
  anonymise(id: string): Promise<void> {
    const current = this.items.get(id);
    if (current) {
      this.items.set(id, {
        ...current,
        fullName: '',
        phone: null,
        preferences: {},
        anonymisedAt: new Date(),
      });
    }
    return Promise.resolve();
  }
}

export class InMemoryConsents implements ConsentRepository {
  readonly rows: (ConsentChange & { accountId: string })[] = [];
  clock = new Date('2026-11-18T10:00:00Z');
  append(accountId: string, purpose: ConsentPurpose, granted: boolean): Promise<void> {
    this.clock = new Date(this.clock.getTime() + 1000);
    this.rows.push({ accountId, purpose, granted, changedAt: this.clock });
    return Promise.resolve();
  }
  history(accountId: string): Promise<readonly ConsentChange[]> {
    return Promise.resolve(this.rows.filter((r) => r.accountId === accountId));
  }
}

export class InMemoryRequests implements RightsRequestRepository {
  readonly rows: (RightsRequest & { accountId: string })[] = [];
  create(
    accountId: string,
    type: RightsRequestType,
    status: RightsRequestStatus,
    dueAt: Date,
  ): Promise<RightsRequest> {
    const row = {
      accountId,
      id: randomUUID(),
      type,
      status,
      dueAt,
      createdAt: new Date(),
      completedAt: status === 'completed' ? new Date() : null,
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }
  list(accountId: string): Promise<readonly RightsRequest[]> {
    return Promise.resolve(this.rows.filter((r) => r.accountId === accountId));
  }
}

export const inventoryStub: DataInventoryRepository = {
  list: () =>
    Promise.resolve([
      {
        dataItem: 'Nombre',
        purpose: 'Identificar al cliente',
        retention: 'Mientras la cuenta esté activa',
        optional: false,
      },
    ]),
};

export class FakeSessions implements SessionReader {
  readonly sessions = new Map<string, CustomerSession>();
  readonly reauth = new Set<string>();
  read(id: string): Promise<CustomerSession | null> {
    return Promise.resolve(this.sessions.get(id) ?? null);
  }
  consumeReauthentication(accountId: string): Promise<boolean> {
    return Promise.resolve(this.reauth.delete(accountId));
  }
}

export class FakeOrders implements OrdersHistoryPort {
  available = true;
  open = false;
  orders: OrderSummary[] = [];
  isAvailable(): boolean {
    return this.available;
  }
  listFor(): Promise<readonly OrderSummary[]> {
    return Promise.resolve(this.orders);
  }
  hasOpenOrders(): Promise<boolean> {
    return Promise.resolve(this.open);
  }
}

export class FakeErasureQueue implements ErasureQueue {
  readonly queued: string[] = [];
  enqueue(accountId: string): Promise<void> {
    this.queued.push(accountId);
    return Promise.resolve();
  }
}
