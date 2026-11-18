import { isValidPriceMinor, toMoney } from './money';

describe('money', () => {
  it.each([0, 1, 350, 10_000_000])('acepta enteros de centavos %p', (value) => {
    expect(isValidPriceMinor(value)).toBe(true);
    expect(toMoney(value)).toEqual({ amountMinor: value, currency: 'USD' });
  });

  it.each([-1, 3.5, 0.1 + 0.2, NaN, Infinity, 10_000_001, '350', null, undefined])(
    'rechaza %p',
    (value) => {
      expect(isValidPriceMinor(value)).toBe(false);
    },
  );

  it('toMoney lanza ante un valor inválido', () => {
    expect(() => toMoney(3.5)).toThrow(RangeError);
  });
});
