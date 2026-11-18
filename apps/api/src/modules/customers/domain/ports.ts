export interface CustomerProfile {
  readonly accountId: string;
  readonly fullName: string;
  readonly phone: string | null;
  readonly preferences: Readonly<Record<string, unknown>>;
  readonly anonymisedAt: Date | null;
}

export interface CustomerRepository {
  find(accountId: string): Promise<CustomerProfile | null>;
  /** Creates the profile if it does not exist and returns it. */
  ensure(accountId: string, fullName: string): Promise<CustomerProfile>;
  update(
    accountId: string,
    changes: { fullName?: string; phone?: string | null; preferences?: Record<string, unknown> },
  ): Promise<CustomerProfile | null>;
  anonymise(accountId: string): Promise<void>;
}

export type ConsentPurpose = 'marketing_email' | 'analytics';

export interface ConsentChange {
  readonly purpose: ConsentPurpose;
  readonly granted: boolean;
  readonly changedAt: Date;
}

export interface ConsentRepository {
  append(accountId: string, purpose: ConsentPurpose, granted: boolean): Promise<void>;
  history(accountId: string): Promise<readonly ConsentChange[]>;
}

export type RightsRequestType =
  'access' | 'rectification' | 'erasure' | 'objection' | 'portability';
export type RightsRequestStatus = 'pending' | 'deferred' | 'completed' | 'rejected';

export interface RightsRequest {
  readonly id: string;
  readonly type: RightsRequestType;
  readonly status: RightsRequestStatus;
  readonly dueAt: Date;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
}

export interface RightsRequestRepository {
  create(
    accountId: string,
    type: RightsRequestType,
    status: RightsRequestStatus,
    dueAt: Date,
  ): Promise<RightsRequest>;
  list(accountId: string): Promise<readonly RightsRequest[]>;
}

export interface DataInventoryItem {
  readonly dataItem: string;
  readonly purpose: string;
  readonly retention: string;
  readonly optional: boolean;
}

export interface DataInventoryRepository {
  list(): Promise<readonly DataInventoryItem[]>;
}

export interface CustomerSession {
  readonly accountId: string;
  readonly role: string;
  readonly displayName: string;
}

/** Reads the shared platform session written at login. The format is a proposed public contract. */
export interface SessionReader {
  read(sessionId: string): Promise<CustomerSession | null>;
  /** Consumes the one-time proof of a recent password re-check. */
  consumeReauthentication(accountId: string): Promise<boolean>;
}

/** Order history lives in the future Orders module; until then a stub answers (spec 005). */
export interface OrdersHistoryPort {
  isAvailable(): boolean;
  listFor(accountId: string): Promise<readonly OrderSummary[]>;
  hasOpenOrders(accountId: string): Promise<boolean>;
}

export interface OrderSummary {
  readonly orderId: string;
  readonly placedAt: string;
  readonly total: { readonly amountMinor: number; readonly currency: string };
  readonly status: string;
}

export interface ErasureQueue {
  enqueue(accountId: string): Promise<void>;
}
