import type { Money } from '@cafeteria/contracts';

export type { Money };

export const MAX_PRICE_MINOR = 10_000_000;

export function isValidPriceMinor(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_PRICE_MINOR
  );
}

export function toMoney(amountMinor: number): Money {
  if (!isValidPriceMinor(amountMinor)) {
    throw new RangeError('El precio debe ser un entero de centavos entre 0 y 10000000.');
  }
  return { amountMinor, currency: 'USD' };
}
