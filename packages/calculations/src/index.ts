import { Decimal } from 'decimal.js';

// Initial conversion supplied by the first shop. Callers may supply another
// agreed conversion without changing previously recorded transactions.
export const DEFAULT_GRAMS_PER_TOLA = '11.664';

export function inventoryWeights(
  grossGrams: string,
  nonMetalGrams: string,
  fineness: string,
): { netWeightGrams: string; fineWeightGrams: string } {
  const net = weight(grossGrams).minus(weight(nonMetalGrams));
  const purity = weight(fineness);
  if (net.lte(0) || purity.lte(0) || purity.gt(1000))
    throw new RangeError('Invalid stock weight or fineness.');
  return {
    netWeightGrams: net.toFixed(3),
    fineWeightGrams: net
      .mul(purity)
      .div(1000)
      .toFixed(6, Decimal.ROUND_HALF_UP),
  };
}

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
