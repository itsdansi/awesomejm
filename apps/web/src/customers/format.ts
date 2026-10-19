import type { AccountEntry } from '@awesomejm/contracts';

export function money(value: string): string {
  const negative = value.startsWith('-');
  const [integer = '0', fraction = ''] = value.replace(/^-/, '').split('.');
  return `${negative ? '-' : ''}${new Intl.NumberFormat('en-NP').format(BigInt(integer))}.${fraction.padEnd(2, '0')}`;
}
export function balance(value: string) {
  if (/^-?0(?:\.0+)?$/.test(value))
    return { label: 'Settled', className: 'settled', amount: '0.00' };
  return value.startsWith('-')
    ? {
        label: 'Advance held',
        className: 'advance',
        amount: money(value.slice(1)),
      }
    : { label: 'Customer owes', className: 'due', amount: money(value) };
}
export const entryTitle: Record<AccountEntry['kind'], string> = {
  OPENING_DUE: 'Opening dues',
  OPENING_ADVANCE: 'Opening advance',
  PAYMENT: 'Payment received',
  ADVANCE_REFUND: 'Advance refunded',
  REVERSAL: 'Entry reversed',
};
export const methodTitle = {
  CASH: 'Cash',
  BANK: 'Bank',
  DIGITAL_WALLET: 'Digital wallet',
};
