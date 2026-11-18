import {
  composePublicView,
  type LiveAvailability,
  type PublishedMenu,
  type SnapshotProduct,
} from './public-view';
import type { ScheduleSlot } from './schedule';

const TZ = 'America/Guayaquil';
const MONDAY_8AM = new Date('2026-11-16T13:00:00Z'); // 08:00 local
const MONDAY_NOON = new Date('2026-11-16T17:00:00Z'); // 12:00 local

const prod = (id: string, over: Partial<SnapshotProduct> = {}): SnapshotProduct => ({
  productId: id,
  name: `Producto ${id}`,
  description: 'Descripción',
  priceMinor: 300,
  currency: 'USD',
  imageUrl: null,
  imageAlt: 'Foto',
  allergens: [],
  ...over,
});

const menu = (
  id: string,
  name: string,
  schedule: ScheduleSlot[],
  products: SnapshotProduct[],
  categoryName = 'Bebidas',
): PublishedMenu => ({
  menuId: id,
  versionId: `v-${id}`,
  versionNumber: 1,
  snapshot: {
    menu: { id, name, schedule },
    categories: [{ id: `c-${id}`, name: categoryName, position: 0, products }],
  },
});

const breakfastSlot: ScheduleSlot = { dayOfWeek: 1, startsAt: '07:00', endsAt: '11:00' };
const live = (entries: Record<string, LiveAvailability>): Map<string, LiveAvailability> =>
  new Map(Object.entries(entries));
const ok: LiveAvailability = { availability: 'available', stockQuantity: null };

describe('composePublicView', () => {
  it('muestra precio en centavos, alt y alérgenos con etiqueta (US1.1)', () => {
    const [view] = composePublicView(
      [
        menu(
          'm1',
          'Todo el día',
          [],
          [prod('p1', { allergens: ['leche'], imageAlt: 'Capuchino' })],
        ),
      ],
      live({ p1: ok }),
      { now: MONDAY_8AM, timeZone: TZ },
    );
    expect(view?.categories[0]?.products[0]).toMatchObject({
      unitPrice: { amountMinor: 300, currency: 'USD' },
      imageAlt: 'Capuchino',
      allergens: [{ code: 'leche', label: 'Leche y lácteos' }],
      purchasable: true,
    });
  });

  it('marca agotado y no comprable, también con existencias en cero (US1.2)', () => {
    const [view] = composePublicView(
      [menu('m1', 'M', [], [prod('p1'), prod('p2'), prod('p3')])],
      live({
        p1: { availability: 'sold_out', stockQuantity: null },
        p2: { availability: 'available', stockQuantity: 0 },
        p3: { availability: 'available', stockQuantity: 5 },
      }),
      { now: MONDAY_8AM, timeZone: TZ },
    );
    const items = view?.categories[0]?.products ?? [];
    expect(items.map((p) => [p.availability, p.purchasable])).toEqual([
      ['sold_out', false],
      ['sold_out', false],
      ['available', true],
    ]);
  });

  it('un producto sin estado vivo se trata como no disponible', () => {
    const [view] = composePublicView([menu('m1', 'M', [], [prod('p1')])], live({}), {
      now: MONDAY_8AM,
      timeZone: TZ,
    });
    expect(view?.categories[0]?.products[0]?.purchasable).toBe(false);
  });

  it('fuera de horario no es comprable e indica cuándo abre (US1.3)', () => {
    const [view] = composePublicView(
      [menu('m1', 'Desayuno', [breakfastSlot], [prod('p1')])],
      live({ p1: ok }),
      { now: MONDAY_NOON, timeZone: TZ },
    );
    expect(view?.availability).toMatchObject({
      availableNow: false,
      // la franja es solo lunes 07:00 local → lunes siguiente
      nextAvailableAt: '2026-11-23T12:00:00.000Z',
    });
    expect(view?.categories[0]?.products[0]?.purchasable).toBe(false);
  });

  it('filtra por alérgenos a excluir (US1.4)', () => {
    const [view] = composePublicView(
      [
        menu(
          'm1',
          'M',
          [],
          [prod('p1', { allergens: ['leche'] }), prod('p2', { allergens: ['gluten'] }), prod('p3')],
        ),
      ],
      live({ p1: ok, p2: ok, p3: ok }),
      { now: MONDAY_8AM, timeZone: TZ, excludeAllergens: ['leche', 'gluten'] },
    );
    expect(view?.categories[0]?.products.map((p) => p.productId)).toEqual(['p3']);
  });

  it('filtra por categoría', () => {
    const views = composePublicView([menu('m1', 'M', [], [prod('p1')])], live({ p1: ok }), {
      now: MONDAY_8AM,
      timeZone: TZ,
      categoryId: 'otra',
    });
    expect(views[0]?.categories).toEqual([]);
  });

  it('menús solapados: el producto repetido aparece una vez por categoría', () => {
    const views = composePublicView(
      [
        menu('m1', 'Desayuno', [breakfastSlot], [prod('p1'), prod('p2')]),
        menu('m2', 'Todo el día', [], [prod('p1'), prod('p3')], ' bebidas '),
      ],
      live({ p1: ok, p2: ok, p3: ok }),
      { now: MONDAY_8AM, timeZone: TZ },
    );
    const ids = views.flatMap((v) =>
      v.categories.flatMap((c) => c.products.map((p) => p.productId)),
    );
    expect(ids.filter((id) => id === 'p1')).toHaveLength(1);
    expect(ids.sort()).toEqual(['p1', 'p2', 'p3']);
  });

  it('un menú sin productos disponibles lleva un aviso claro, no queda vacío', () => {
    const [view] = composePublicView(
      [menu('m1', 'M', [], [prod('p1')])],
      live({ p1: { availability: 'sold_out', stockQuantity: null } }),
      { now: MONDAY_8AM, timeZone: TZ },
    );
    expect(view?.notice).toBe('No hay productos disponibles en este momento.');
  });

  it('no expone campos internos', () => {
    const [view] = composePublicView([menu('m1', 'M', [], [prod('p1')])], live({ p1: ok }), {
      now: MONDAY_8AM,
      timeZone: TZ,
    });
    const json = JSON.stringify(view);
    expect(json).not.toMatch(/revision|createdBy|stockQuantity/);
  });
});
