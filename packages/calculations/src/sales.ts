import { Decimal } from 'decimal.js';

const Money = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
const maximum = new Money('999999999.99');
function number(value: string, signed = false) {
  if (
    !(
      signed
        ? /^-?(0|[1-9]\d{0,29})(\.\d{1,5})?$/
        : /^(0|[1-9]\d{0,8})(\.\d{1,5})?$/
    ).test(value)
  )
    throw new RangeError('Enter a valid decimal amount.');
  return new Money(value);
}
function amount(value: Decimal) {
  const rounded = value.toDecimalPlaces(2);
  if (rounded.lt(0) || rounded.gt(maximum))
    throw new RangeError(
      'Sale amounts must be between NPR 0.00 and 999,999,999.99.',
    );
  return rounded;
}
export interface SalePricingLine {
  netWeightGrams: string;
  wastageGrams: string;
  sellRatePerTola: string;
  gramsPerTola: string;
  makingNpr: string;
  stonesNpr: string;
}
export function priceSale(input: {
  lines: SalePricingLine[];
  discountNpr: string;
  taxNpr: string;
  paymentNpr: string;
  balanceBeforeNpr: string;
}) {
  if (input.lines.length < 1 || input.lines.length > 20)
    throw new RangeError('Choose between 1 and 20 pieces.');
  const lines = input.lines.map((line) => {
    const net = number(line.netWeightGrams),
      rate = number(line.sellRatePerTola),
      factor = number(line.gramsPerTola);
    if (net.lte(0) || rate.lte(0) || factor.lte(0))
      throw new RangeError('Weight, rate and conversion must be positive.');
    const metal = amount(net.mul(rate).div(factor));
    const wastage = amount(number(line.wastageGrams).mul(rate).div(factor));
    const making = amount(number(line.makingNpr)),
      stones = amount(number(line.stonesNpr));
    return {
      metalNpr: metal.toFixed(2),
      wastageNpr: wastage.toFixed(2),
      makingNpr: making.toFixed(2),
      stonesNpr: stones.toFixed(2),
      lineTotalNpr: amount(metal.add(wastage).add(making).add(stones)).toFixed(
        2,
      ),
    };
  });
  const subtotal = amount(
    lines.reduce((sum, line) => sum.add(line.lineTotalNpr), new Money(0)),
  );
  const discount = amount(number(input.discountNpr)),
    tax = amount(number(input.taxNpr)),
    payment = amount(number(input.paymentNpr));
  if (discount.gt(subtotal))
    throw new RangeError('Discount cannot exceed the subtotal.');
  const total = amount(subtotal.minus(discount).add(tax));
  if (total.lte(0))
    throw new RangeError('A posted sale must have a positive total.');
  if (payment.gt(total))
    throw new RangeError(
      'Payment received for this sale cannot exceed its total.',
    );
  const before = number(input.balanceBeforeNpr, true);
  const advance = Money.min(
    Money.max(before.negated(), 0),
    total.minus(payment),
  );
  return {
    lines,
    subtotalNpr: subtotal.toFixed(2),
    discountNpr: discount.toFixed(2),
    taxNpr: tax.toFixed(2),
    totalNpr: total.toFixed(2),
    paymentNpr: payment.toFixed(2),
    advanceAppliedNpr: advance.toFixed(2),
    dueAtPostingNpr: total.minus(payment).minus(advance).toFixed(2),
    balanceBeforeNpr: before.toFixed(2),
    balanceAfterNpr: before.add(total).minus(payment).toFixed(2),
  };
}
