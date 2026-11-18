import { CustomerValidationError, ReauthenticationRequiredError } from '../domain/errors';
import type { CustomerSession } from '../domain/ports';
import {
  FakeErasureQueue,
  FakeOrders,
  FakeSessions,
  InMemoryConsents,
  InMemoryCustomers,
  InMemoryRequests,
  inventoryStub,
} from '../tests/in-memory';
import { CustomersService } from './customers-service';

const ana: CustomerSession = { accountId: 'acc-ana', role: 'customer', displayName: 'Ana Pérez' };
const luis: CustomerSession = {
  accountId: 'acc-luis',
  role: 'customer',
  displayName: 'Luis Gómez',
};

function setup() {
  const parts = {
    customers: new InMemoryCustomers(),
    consents: new InMemoryConsents(),
    requests: new InMemoryRequests(),
    inventory: inventoryStub,
    sessions: new FakeSessions(),
    orders: new FakeOrders(),
    erasure: new FakeErasureQueue(),
  };
  return { service: new CustomersService(parts), ...parts };
}

describe('US3 - profile (FR-010)', () => {
  it('creates the profile from the registered name on first access', async () => {
    const s = setup();
    expect((await s.service.getProfile(ana)).fullName).toBe('Ana Pérez');
  });

  it('edits name, phone and preferences', async () => {
    const s = setup();
    const updated = await s.service.updateProfile(ana, {
      fullName: ' Ana María Pérez ',
      phone: '+593 99 123 4567',
      preferences: { language: 'es' },
    });
    expect(updated).toMatchObject({
      fullName: 'Ana María Pérez',
      phone: '+593 99 123 4567',
      preferences: { language: 'es' },
    });
  });

  it('clears the phone with an empty value', async () => {
    const s = setup();
    await s.service.updateProfile(ana, { phone: '+593 99 123 4567' });
    expect((await s.service.updateProfile(ana, { phone: '' })).phone).toBeNull();
  });

  it('reports invalid fields without changing anything', async () => {
    const s = setup();
    await s.service.getProfile(ana);
    const error = await s.service
      .updateProfile(ana, { fullName: '', phone: 'abc', preferences: [] })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CustomerValidationError);
    expect((error as CustomerValidationError).errors.map((e) => e.field)).toEqual([
      'fullName',
      'phone',
      'preferences',
    ]);
    expect((await s.service.getProfile(ana)).fullName).toBe('Ana Pérez');
  });

  it("never exposes another customer's profile", async () => {
    const s = setup();
    await s.service.updateProfile(ana, { phone: '+593 99 123 4567' });
    expect((await s.service.getProfile(luis)).phone).toBeNull();
  });
});

describe('US3 - order history (FR-011)', () => {
  it('is explicitly unavailable until Orders exists, never faking data', async () => {
    const s = setup();
    s.orders.available = false;
    expect(await s.service.listOrders(ana)).toEqual({ available: false, orders: [] });
  });

  it('lists orders newest first', async () => {
    const s = setup();
    const money = { amountMinor: 500, currency: 'USD' };
    s.orders.orders = [
      { orderId: 'a', placedAt: '2026-11-01T10:00:00Z', total: money, status: 'delivered' },
      { orderId: 'b', placedAt: '2026-11-10T10:00:00Z', total: money, status: 'preparing' },
    ];
    const { orders } = await s.service.listOrders(ana);
    expect(orders.map((o) => o.orderId)).toEqual(['b', 'a']);
  });
});

describe('US4 - consents (FR-012, FR-013)', () => {
  it('shows the data inventory with purposes and retention', async () => {
    const s = setup();
    expect(await s.service.dataInventory()).toEqual([
      expect.objectContaining({ dataItem: 'Nombre', retention: expect.any(String) }),
    ]);
  });

  it('defaults optional consents to not granted', async () => {
    const s = setup();
    expect(await s.service.consentStates(ana)).toEqual([
      { purpose: 'marketing_email', granted: false, changedAt: null },
      { purpose: 'analytics', granted: false, changedAt: null },
    ]);
  });

  it('records each real change with a date and ignores no-ops', async () => {
    const s = setup();
    await s.service.setConsents(ana, { marketing_email: true });
    await s.service.setConsents(ana, { marketing_email: true });
    const states = await s.service.setConsents(ana, { marketing_email: false });
    expect(s.consents.rows.map((r) => [r.purpose, r.granted])).toEqual([
      ['marketing_email', true],
      ['marketing_email', false],
    ]);
    expect(states.find((c) => c.purpose === 'marketing_email')).toMatchObject({ granted: false });
    expect(states.find((c) => c.purpose === 'marketing_email')?.changedAt).not.toBeNull();
  });

  it('rejects unknown purposes and non-boolean values', async () => {
    const s = setup();
    await expect(s.service.setConsents(ana, { essential: false })).rejects.toBeInstanceOf(
      CustomerValidationError,
    );
    await expect(s.service.setConsents(ana, { analytics: 'yes' })).rejects.toBeInstanceOf(
      CustomerValidationError,
    );
    expect(s.consents.rows).toHaveLength(0);
  });
});

describe('US4 - export (FR-014)', () => {
  it('returns every personal datum in a structured document and records the request', async () => {
    const s = setup();
    await s.service.updateProfile(ana, { phone: '+593 99 123 4567' });
    await s.service.setConsents(ana, { analytics: true });
    const data = await s.service.exportData(ana);
    expect(data.format).toBe('cafeteria-data-export/v1');
    expect(data.profile).toMatchObject({ fullName: 'Ana Pérez', phone: '+593 99 123 4567' });
    expect(data.consents).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
    expect(s.requests.rows.map((r) => [r.type, r.status])).toEqual([['portability', 'completed']]);
  });

  it("does not include another customer's data", async () => {
    const s = setup();
    await s.service.updateProfile(luis, { phone: '+593 98 765 4321' });
    await s.service.setConsents(luis, { analytics: true });
    const data = await s.service.exportData(ana);
    expect(JSON.stringify(data)).not.toContain('Luis');
    expect(data.consents).toHaveLength(0);
  });
});

describe('US4 - account deletion (FR-015, SC-006)', () => {
  it('requires a fresh password confirmation', async () => {
    const s = setup();
    await expect(s.service.requestDeletion(ana)).rejects.toBeInstanceOf(
      ReauthenticationRequiredError,
    );
    expect(s.erasure.queued).toHaveLength(0);
  });

  it('anonymises the profile, queues identity erasure and logs the request', async () => {
    const s = setup();
    await s.service.updateProfile(ana, { phone: '+593 99 123 4567', preferences: { a: 1 } });
    s.sessions.reauth.add(ana.accountId);
    expect(await s.service.requestDeletion(ana)).toEqual({ status: 'completed' });
    const profile = await s.customers.find(ana.accountId);
    expect(profile).toMatchObject({ fullName: '', phone: null, preferences: {} });
    expect(profile?.anonymisedAt).not.toBeNull();
    expect(s.erasure.queued).toEqual([ana.accountId]);
    expect(s.requests.rows.map((r) => [r.type, r.status])).toEqual([['erasure', 'completed']]);
  });

  it('uses the reauthentication proof only once', async () => {
    const s = setup();
    s.sessions.reauth.add(ana.accountId);
    await s.service.requestDeletion(ana);
    await expect(s.service.requestDeletion(ana)).rejects.toBeInstanceOf(
      ReauthenticationRequiredError,
    );
  });

  it('defers deletion while an order is open and keeps the data', async () => {
    const s = setup();
    await s.service.getProfile(ana);
    s.orders.open = true;
    s.sessions.reauth.add(ana.accountId);
    const result = await s.service.requestDeletion(ana);
    expect(result).toMatchObject({ status: 'deferred' });
    expect((await s.customers.find(ana.accountId))?.fullName).toBe('Ana Pérez');
    expect(s.erasure.queued).toHaveLength(0);
    expect(s.requests.rows.map((r) => r.status)).toEqual(['deferred']);
  });

  it('sets the legal due date within 15 days', async () => {
    const now = new Date('2026-11-18T10:00:00Z');
    const s = setup();
    const service = new CustomersService({ ...s, now: () => now });
    s.sessions.reauth.add(ana.accountId);
    await service.requestDeletion(ana);
    expect(s.requests.rows[0]?.dueAt.toISOString()).toBe('2026-12-03T10:00:00.000Z');
  });
});
