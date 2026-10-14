import { Decimal } from 'decimal.js';

// Initial conversion supplied by the first shop. Callers may supply another
// agreed conversion without changing previously recorded transactions.
export const DEFAULT_GRAMS_PER_TOLA = '11.664';

function weight(value: string): Decimal {
  if (!/^\d+(?:\.\d+)?$/.test(value)) {
    throw new RangeError('Weight must be a non-negative decimal string.');
  }
  return new Decimal(value);
}

function conversion(value: string): Decimal {
  const factor = weight(value);
  if (factor.isZero()) {
    throw new RangeError('Grams per tola must be greater than zero.');
  }
  return factor;
}

export function tolaToGrams(
  tola: string,
  gramsPerTola = DEFAULT_GRAMS_PER_TOLA,
): string {
  return weight(tola)
    .mul(conversion(gramsPerTola))
    .toFixed(3, Decimal.ROUND_HALF_UP);
}

export function gramsToTola(
  grams: string,
  gramsPerTola = DEFAULT_GRAMS_PER_TOLA,
): string {
  return weight(grams)
    .div(conversion(gramsPerTola))
    .toFixed(6, Decimal.ROUND_HALF_UP);
}
