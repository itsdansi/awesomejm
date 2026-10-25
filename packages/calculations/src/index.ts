import { Decimal } from 'decimal.js';
export * from './sales.js';

// Initial conversion supplied by the first shop. Callers may supply another
// agreed conversion without changing previously recorded transactions.
export const DEFAULT_GRAMS_PER_TOLA = '11.664';

// Display only: future transaction amounts must use the original per-tola rate,
// avoiding another rounding step through this per-gram preview.
export function ratePerGram(
  ratePerTola: string,
  gramsPerTola = DEFAULT_GRAMS_PER_TOLA,
): string {
  const rate = weight(ratePerTola);
  if (rate.lte(0)) throw new RangeError('Rate must be greater than zero.');
  return rate.div(conversion(gramsPerTola)).toFixed(6, Decimal.ROUND_HALF_UP);
}

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

// The first shop confirmed 100 lal per tola. Normalize once to the existing
// milligram storage precision before pricing; never price a rounded display.
export const LAL_PER_TOLA = 100;
export function tolaLalToGrams(
  tola: string,
  lal: string,
  gramsPerTola = DEFAULT_GRAMS_PER_TOLA,
): string {
  if (!/^(0|[1-9]\d*)$/.test(tola))
    throw new RangeError('Tola must be a non-negative whole number.');
  if (!/^(0|[1-9]\d?)(\.\d{1,2})?$/.test(lal))
    throw new RangeError(
      'Lal must be from 0 to 99.99 with up to 2 decimal places.',
    );
  return weight(tola)
    .plus(weight(lal).div(LAL_PER_TOLA))
    .mul(conversion(gramsPerTola))
    .toFixed(3, Decimal.ROUND_HALF_UP);
}

export function gramsToTolaLal(
  grams: string,
  gramsPerTola = DEFAULT_GRAMS_PER_TOLA,
): { tola: string; lal: string; negative: boolean; approximate: boolean } {
  if (!/^-?\d+(?:\.\d+)?$/.test(grams))
    throw new RangeError('Weight must be a decimal string.');
  const value = new Decimal(grams),
    factor = conversion(gramsPerTola),
    totalLal = value
      .abs()
      .div(factor)
      .mul(LAL_PER_TOLA)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    tola = totalLal.div(LAL_PER_TOLA).floor().toFixed(0),
    lal = totalLal.mod(LAL_PER_TOLA).toFixed(2);
  return {
    tola,
    lal,
    negative: value.isNegative() && !value.isZero(),
    approximate: !totalLal.div(LAL_PER_TOLA).mul(factor).eq(value.abs()),
  };
}

export * from './purchases.js';

export * from './purity.js';
