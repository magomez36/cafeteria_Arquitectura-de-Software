import { CustomerValidationError, ReauthenticationRequiredError } from '../domain/errors';
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
  SessionReader,
} from '../domain/ports';
import { validateProfileChanges } from '../domain/validation';

export const OPTIONAL_PURPOSES: readonly ConsentPurpose[] = ['marketing_email', 'analytics'];
const LEGAL_RESPONSE_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface CustomersDeps {
  readonly customers: CustomerRepository;
  readonly consents: ConsentRepository;
  readonly requests: RightsRequestRepository;
  readonly inventory: DataInventoryRepository;
  readonly sessions: SessionReader;
  readonly orders: OrdersHistoryPort;
  readonly erasure: ErasureQueue;
  readonly now?: () => Date;
}

export interface ConsentState {
  readonly purpose: ConsentPurpose;
  readonly granted: boolean;
  readonly changedAt: string | null;
}

export interface DataExport {
  readonly generatedAt: string;
  readonly format: 'cafeteria-data-export/v1';
  readonly profile: {
    fullName: string;
    phone: string | null;
    preferences: Record<string, unknown>;
  };
  readonly consents: readonly { purpose: string; granted: boolean; changedAt: string }[];
  readonly rightsRequests: readonly { type: string; status: string; createdAt: string }[];
  readonly orders: { available: boolean; items: readonly OrderSummary[] };
}

export type DeletionResult = { status: 'completed' } | { status: 'deferred'; reason: string };

/** Customer profile, consents and data-protection rights (FR-010..FR-015). */
export class CustomersService {
  constructor(private readonly deps: CustomersDeps) {}

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  resolveSession(sessionId: string | null): Promise<CustomerSession | null> {
    return sessionId ? this.deps.sessions.read(sessionId) : Promise.resolve(null);
  }

  /** The profile is created lazily from the name given at registration. */
  getProfile(session: CustomerSession): Promise<CustomerProfile> {
    return this.deps.customers.ensure(session.accountId, session.displayName);
  }

  async updateProfile(
    session: CustomerSession,
    changes: { fullName?: unknown; phone?: unknown; preferences?: unknown },
  ): Promise<CustomerProfile> {
    const errors = validateProfileChanges(changes);
    if (errors.length > 0) throw new CustomerValidationError(errors);
    await this.getProfile(session);
    const patch: {
      fullName?: string;
      phone?: string | null;
      preferences?: Record<string, unknown>;
    } = {};
    if (typeof changes.fullName === 'string') patch.fullName = changes.fullName.trim();
    if (changes.phone !== undefined) {
      patch.phone =
        typeof changes.phone === 'string' && changes.phone.trim() ? changes.phone.trim() : null;
    }
    if (changes.preferences !== undefined)
      patch.preferences = changes.preferences as Record<string, unknown>;
    const updated = await this.deps.customers.update(session.accountId, patch);
    return updated ?? this.getProfile(session);
  }

  async listOrders(
    session: CustomerSession,
  ): Promise<{ available: boolean; orders: readonly OrderSummary[] }> {
    if (!this.deps.orders.isAvailable()) return { available: false, orders: [] };
    const orders = [...(await this.deps.orders.listFor(session.accountId))].sort((a, b) =>
      b.placedAt.localeCompare(a.placedAt),
    );
    return { available: true, orders };
  }

  dataInventory(): Promise<readonly DataInventoryItem[]> {
    return this.deps.inventory.list();
  }

  async consentStates(session: CustomerSession): Promise<ConsentState[]> {
    const history = await this.deps.consents.history(session.accountId);
    return OPTIONAL_PURPOSES.map((purpose) => {
      const latest = [...history].reverse().find((c) => c.purpose === purpose);
      return {
        purpose,
        granted: latest?.granted ?? false,
        changedAt: latest ? latest.changedAt.toISOString() : null,
      };
    });
  }

  /** FR-013: every real change is recorded with its date; unchanged values are ignored. */
  async setConsents(
    session: CustomerSession,
    desired: Partial<Record<string, unknown>>,
  ): Promise<ConsentState[]> {
    const unknown = Object.keys(desired).filter(
      (p) => !OPTIONAL_PURPOSES.includes(p as ConsentPurpose),
    );
    const invalid = Object.entries(desired).filter(([, v]) => typeof v !== 'boolean');
    if (unknown.length > 0 || invalid.length > 0) {
      throw new CustomerValidationError([
        {
          field: 'consents',
          message: 'Solo puedes cambiar consentimientos opcionales con valores sí o no.',
        },
      ]);
    }
    const current = await this.consentStates(session);
    for (const state of current) {
      const next = desired[state.purpose];
      if (typeof next === 'boolean' && next !== state.granted) {
        await this.deps.consents.append(session.accountId, state.purpose, next);
      }
    }
    return this.consentStates(session);
  }

  /** FR-014: structured, machine-readable copy of the personal data held by this module. */
  async exportData(session: CustomerSession): Promise<DataExport> {
    const profile = await this.getProfile(session);
    const [history, requests, orders] = await Promise.all([
      this.deps.consents.history(session.accountId),
      this.deps.requests.list(session.accountId),
      this.listOrders(session),
    ]);
    const generatedAt = this.now();
    await this.deps.requests.create(session.accountId, 'portability', 'completed', generatedAt);
    return {
      generatedAt: generatedAt.toISOString(),
      format: 'cafeteria-data-export/v1',
      profile: {
        fullName: profile.fullName,
        phone: profile.phone,
        preferences: { ...profile.preferences },
      },
      consents: history.map((c: ConsentChange) => ({
        purpose: c.purpose,
        granted: c.granted,
        changedAt: c.changedAt.toISOString(),
      })),
      rightsRequests: requests.map((r: RightsRequest) => ({
        type: r.type,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
      orders: { available: orders.available, items: orders.orders },
    };
  }

  /** FR-015: needs a fresh password check; open orders defer the erasure (US4 scenario 4). */
  async requestDeletion(session: CustomerSession): Promise<DeletionResult> {
    if (!(await this.deps.sessions.consumeReauthentication(session.accountId))) {
      throw new ReauthenticationRequiredError();
    }
    const dueAt = new Date(this.now().getTime() + LEGAL_RESPONSE_DAYS * DAY_MS);
    if (await this.deps.orders.hasOpenOrders(session.accountId)) {
      await this.deps.requests.create(session.accountId, 'erasure', 'deferred', dueAt);
      return {
        status: 'deferred',
        reason: 'Tienes un pedido en curso. Eliminaremos tu cuenta cuando termine.',
      };
    }
    await this.deps.requests.create(session.accountId, 'erasure', 'completed', dueAt);
    await this.deps.customers.anonymise(session.accountId);
    await this.deps.erasure.enqueue(session.accountId);
    return { status: 'completed' };
  }
}
