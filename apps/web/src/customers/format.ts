import type { StaticTranslationKey } from '../i18n/schema';
import { locale } from '../i18n/language';
import type { AccountEntry } from '@awesomejm/contracts';

export function money(value: string): string {
  const negative = value.startsWith('-');
  const [integer = '0', fraction = ''] = value.replace(/^-/, '').split('.');
  return `${negative ? '-' : ''}${new Intl.NumberFormat(locale()).format(BigInt(integer))}.${fraction.padEnd(2, '0')}`;
}
export function balance(value: string): {
  label: StaticTranslationKey;
  className: string;
  amount: string;
} {
  if (/^-?0(?:\.0+)?$/.test(value))
    return {
      label: 'customers.labels.settled',
      className: 'settled',
      amount: '0.00',
    };
  return value.startsWith('-')
    ? {
        label: 'customers.labels.advanceHeld',
        className: 'advance',
        amount: money(value.slice(1)),
      }
    : {
        label: 'customers.labels.customerOwes',
        className: 'due',
        amount: money(value),
      };
}
export const entryTitle: Record<AccountEntry['kind'], StaticTranslationKey> = {
  OPENING_DUE: 'customers.format.openingDues',
  OPENING_ADVANCE: 'customers.format.openingAdvance',
  PAYMENT: 'customers.format.paymentReceived',
  ADVANCE_REFUND: 'customers.format.advanceRefunded',
  REVERSAL: 'customers.format.entryReversed',
  SALE_CHARGE: 'customers.format.saleCharged',
  METAL_PURCHASE: 'customers.format.oldMetalPurchased',
  PURCHASE_PAYOUT: 'customers.format.purchasePaidOut',
};
export const methodTitle = {
  CASH: 'common.labels.cash',
  BANK: 'common.labels.bank',
  DIGITAL_WALLET: 'common.labels.digitalWallet',
} as const;
