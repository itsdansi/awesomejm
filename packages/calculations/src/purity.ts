import { Decimal } from 'decimal.js';

// Shop-approved commercial grades, not theoretical karat / 24 ratios.
export const GOLD_PURITY_PRESETS = [
  { karat: '24K', fineness: '999' },
  { karat: '22K', fineness: '916' },
  { karat: '18K', fineness: '750' },
  { karat: '14K', fineness: '585' },
  { karat: '10K', fineness: '417' },
] as const;
export const DEFAULT_GOLD_FINENESS = '916';
export const DEFAULT_SILVER_FINENESS = '925';

function finenessValue(value: string) {
  if (!/^\d{1,4}(\.\d{1,3})?$/.test(value))
    throw new RangeError(
      'Enter purity in parts per thousand, up to 3 decimal places.',
    );
  const fineness = new Decimal(value);
  if (fineness.lte(0) || fineness.gt(1000))
    throw new RangeError('Purity must be greater than 0 and at most 1000.');
  return fineness;
}
export function finenessToPercentage(value: string): string {
  const percentage = finenessValue(value).div(10);
  return percentage.toFixed(Math.max(1, percentage.decimalPlaces()));
}
export function goldPurityPreset(value: string) {
  try {
    const fineness = finenessValue(value);
    return GOLD_PURITY_PRESETS.find((preset) => fineness.eq(preset.fineness));
  } catch {
    return undefined;
  }
}
