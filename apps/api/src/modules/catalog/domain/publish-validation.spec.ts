import { validateForPublish, type DraftMenu, type DraftProduct } from './publish-validation';

const product = (over: Partial<DraftProduct> = {}): DraftProduct => ({
  productId: 'p1',
  name: 'Café americano',
  description: 'Espresso largo',
  priceMinor: 250,
  imageUrl: 'https://cdn.example/cafe.jpg',
  imageAlt: 'Taza de café negro humeante',
  allergens: [],
  allergensDeclared: true,
  ...over,
});

const menu = (products: DraftProduct[]): DraftMenu => ({
  name: 'Desayunos',
  schedule: [{ dayOfWeek: 1, startsAt: '07:00', endsAt: '11:00' }],
  categories: [{ categoryId: 'c1', name: 'Bebidas', products }],
});

describe('validateForPublish', () => {
  it('un menú completo es publicable; «sin alérgenos» declarado es válido', () => {
    expect(validateForPublish(menu([product()]))).toEqual([]);
  });

  it('bloquea sin texto alternativo e indica el producto (US2.2)', () => {
    const issues = validateForPublish(menu([product({ imageAlt: '  ' })]));
    expect(issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'product:p1' })]),
    );
    expect(issues.map((i) => i.message).join(' ')).toMatch(/texto alternativo/);
  });

  it('bloquea sin información de alérgenos (distinta de lista vacía declarada)', () => {
    const issues = validateForPublish(menu([product({ allergensDeclared: false })]));
    expect(issues.map((i) => i.message).join(' ')).toMatch(/alérgenos/);
  });

  it('bloquea alérgenos desconocidos, precios inválidos y menús vacíos', () => {
    expect(validateForPublish(menu([product({ allergens: ['chocolate'] })]))).not.toHaveLength(0);
    expect(validateForPublish(menu([product({ priceMinor: 2.5 })]))).not.toHaveLength(0);
    expect(validateForPublish(menu([]))).toEqual([
      { path: 'menu.categories', message: 'El menú debe tener al menos un producto.' },
    ]);
  });

  it('bloquea horarios inválidos', () => {
    const bad: DraftMenu = {
      ...menu([product()]),
      schedule: [{ dayOfWeek: 1, startsAt: '11:00', endsAt: '07:00' }],
    };
    expect(validateForPublish(bad).some((i) => i.path === 'menu.schedule')).toBe(true);
  });
});
