import { allergenLabel, isAllergenCode, parseAllergenList } from './allergens';

describe('allergens', () => {
  it('reconoce solo códigos de la lista cerrada', () => {
    expect(isAllergenCode('leche')).toBe(true);
    expect(isAllergenCode('chocolate')).toBe(false);
  });
  it('parsea listas, sin duplicados', () => {
    expect(parseAllergenList('leche, gluten,leche')).toEqual(['leche', 'gluten']);
    expect(parseAllergenList(undefined)).toEqual([]);
    expect(parseAllergenList('')).toEqual([]);
  });
  it('devuelve null con códigos desconocidos', () => {
    expect(parseAllergenList('leche,chocolate')).toBeNull();
  });
  it('da etiqueta en español', () => {
    expect(allergenLabel('leche')).toBe('Leche y lácteos');
  });
});
