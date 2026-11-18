import {
  parseAvailabilityPatch,
  parseItems,
  parseMenuUpdate,
  parseProductInput,
  parseUuid,
} from './input';

const valid = {
  name: ' Café ',
  description: 'Espresso',
  priceMinor: 250,
  imageUrl: 'https://cdn.example/c.jpg',
  imageAlt: 'Taza de café',
  allergens: ['leche'],
  allergensDeclared: true,
};
const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
};

describe('parseProductInput', () => {
  it('normaliza una entrada válida', () => {
    expect(parseProductInput(valid)).toMatchObject({ name: 'Café', priceMinor: 250 });
  });
  it('un borrador puede estar incompleto (el bloqueo ocurre al publicar)', () => {
    const draft = parseProductInput({ name: 'X', description: '', priceMinor: 100 });
    expect(draft).toMatchObject({ imageAlt: null, allergensDeclared: false, allergens: [] });
  });
  it.each([
    [{ ...valid, priceMinor: 2.5 }],
    [{ ...valid, priceMinor: -1 }],
    [{ ...valid, priceMinor: '250' }],
    [{ ...valid, imageUrl: 'javascript:alert(1)' }],
    [{ ...valid, imageUrl: '//evil.example/x.png' }],
    [{ ...valid, allergens: ['chocolate'] }],
    [{ ...valid, allergensDeclared: false }],
    [{ ...valid, name: '' }],
    [{ ...valid, role: 'admin' }],
    [null],
    [[]],
  ])('rechaza %j', (body) => {
    expect(code(() => parseProductInput(body))).toBe('validation_failed');
  });
  it('acepta rutas relativas de imagen', () => {
    expect(parseProductInput({ ...valid, imageUrl: '/img/c.jpg' }).imageUrl).toBe('/img/c.jpg');
  });
});

describe('parseAvailabilityPatch (US4.3)', () => {
  it('acepta disponibilidad y existencias', () => {
    expect(parseAvailabilityPatch({ availability: 'sold_out' })).toEqual({
      availability: 'sold_out',
    });
    expect(parseAvailabilityPatch({ stockQuantity: null })).toEqual({ stockQuantity: null });
  });
  it.each([
    [{ priceMinor: 1 }],
    [{ availability: 'available', priceMinor: 1 }],
    [{ name: 'x' }],
    [{}],
    [{ availability: 'maybe' }],
    [{ stockQuantity: -1 }],
    [{ stockQuantity: 1.5 }],
  ])('rechaza %j', (body) => {
    expect(code(() => parseAvailabilityPatch(body))).toBe('validation_failed');
  });
});

describe('otros parsers', () => {
  it('valida UUID', () => {
    expect(parseUuid('3F2504E0-4F89-41D3-9A0C-0305E82C3301')).toBe(
      '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    );
    expect(code(() => parseUuid("1' OR '1'='1"))).toBe('validation_failed');
  });
  it('valida horario del menú', () => {
    expect(
      parseMenuUpdate({
        name: 'D',
        schedule: [{ dayOfWeek: 1, startsAt: '07:00', endsAt: '11:00' }],
      }),
    ).toMatchObject({ name: 'D' });
    expect(
      code(() =>
        parseMenuUpdate({
          name: 'D',
          schedule: [{ dayOfWeek: 1, startsAt: '11:00', endsAt: '07:00' }],
        }),
      ),
    ).toBe('validation_failed');
  });
  it('rechaza ítems repetidos', () => {
    const id = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    expect(code(() => parseItems({ productIds: [id, id] }))).toBe('validation_failed');
  });
});
