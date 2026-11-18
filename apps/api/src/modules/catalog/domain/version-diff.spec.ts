import { buildSnapshot } from './menu-snapshot';
import type { DraftMenu, DraftProduct } from './publish-validation';
import { diffSnapshots } from './version-diff';

const product = (over: Partial<DraftProduct> = {}): DraftProduct => ({
  productId: 'p1',
  name: 'Café',
  description: 'Espresso',
  priceMinor: 250,
  imageUrl: null,
  imageAlt: 'Taza',
  allergens: ['leche'],
  allergensDeclared: true,
  ...over,
});

const draft = (products: DraftProduct[], name = 'Desayunos'): DraftMenu => ({
  name,
  schedule: [{ dayOfWeek: 1, startsAt: '07:00', endsAt: '11:00' }],
  categories: [{ categoryId: 'c1', name: 'Bebidas', products }],
});

describe('buildSnapshot', () => {
  it('es una copia profunda: editar el borrador no altera la versión', () => {
    const d = draft([product()]);
    const snap = buildSnapshot('m1', d);
    (d.categories[0]?.products[0] as { priceMinor: number }).priceMinor = 999;
    (d.schedule[0] as { startsAt: string }).startsAt = '09:00';
    expect(snap.categories[0]?.products[0]?.priceMinor).toBe(250);
    expect(snap.menu.schedule[0]?.startsAt).toBe('07:00');
  });

  it('recorta espacios y conserva el orden', () => {
    const snap = buildSnapshot('m1', draft([product({ name: '  Café  ' })]));
    expect(snap.categories[0]).toMatchObject({ position: 0 });
    expect(snap.categories[0]?.products[0]?.name).toBe('Café');
  });
});

describe('diffSnapshots', () => {
  const v1 = buildSnapshot('m1', draft([product()]));

  it('la primera publicación lista todo como añadido', () => {
    expect(diffSnapshots(null, v1).map((c) => c.type)).toEqual(['category_added', 'product_added']);
  });

  it('detecta el cambio de precio con valor anterior y nuevo (US3.1/US3.4)', () => {
    const v2 = buildSnapshot('m1', draft([product({ priceMinor: 300 })]));
    expect(diffSnapshots(v1, v2)).toEqual([
      {
        type: 'product_changed',
        productId: 'p1',
        name: 'Café',
        field: 'priceMinor',
        from: 250,
        to: 300,
      },
    ]);
  });

  it('detecta altas, bajas, renombrados y horario', () => {
    const v2 = buildSnapshot('m1', {
      ...draft([product({ productId: 'p2', name: 'Té' })], 'Desayuno'),
      schedule: [],
    });
    const types = diffSnapshots(v1, v2).map((c) => c.type);
    expect(types).toEqual(
      expect.arrayContaining([
        'menu_renamed',
        'schedule_changed',
        'product_added',
        'product_removed',
      ]),
    );
  });

  it('no reporta cambios si el orden de alérgenos es distinto', () => {
    const a = buildSnapshot('m1', draft([product({ allergens: ['leche', 'gluten'] })]));
    const b = buildSnapshot('m1', draft([product({ allergens: ['gluten', 'leche'] })]));
    expect(diffSnapshots(a, b)).toEqual([]);
  });

  it('restaurar una versión idéntica no produce cambios', () => {
    expect(diffSnapshots(v1, buildSnapshot('m1', draft([product()])))).toEqual([]);
  });
});
