import { Decimal } from 'decimal.js';
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
const max = new D('999999999.99');
function decimal(value: string, signed = false) {
  if (
    !(
      signed
        ? /^-?(0|[1-9]\d{0,29})(\.\d{1,5})?$/
        : /^(0|[1-9]\d{0,8})(\.\d{1,5})?$/
    ).test(value)
  )
    throw new RangeError('Enter a valid decimal.');
  return new D(value);
}
function money(value: Decimal) {
  const rounded = value.toDecimalPlaces(2);
  if (rounded.lt(0) || rounded.gt(max))
    throw new RangeError(
      'Purchase amounts must be between NPR 0.00 and 999,999,999.99.',
    );
  return rounded;
}
export interface PurchasePricingLine {
  grossWeightGrams: string;
  nonMetalWeightGrams: string;
  deductedWeightGrams: string;
  fineness: string;
  buyRatePerTola: string;
  gramsPerTola: string;
  deductionNpr: string;
}
export function pricePurchase(lines: PurchasePricingLine[]) {
  if (!lines.length || lines.length > 20)
    throw new RangeError('Choose between 1 and 20 incoming lots.');
  const priced = lines.map((line) => {
    const gross = decimal(line.grossWeightGrams),
      nonMetal = decimal(line.nonMetalWeightGrams),
      net = gross.minus(nonMetal),
      deducted = decimal(line.deductedWeightGrams),
      purity = decimal(line.fineness),
      rate = decimal(line.buyRatePerTola),
      factor = decimal(line.gramsPerTola);
    if (
      net.lte(0) ||
      nonMetal.gte(gross) ||
      deducted.gte(net) ||
      purity.lte(0) ||
      purity.gt(1000) ||
      rate.lte(0) ||
      factor.lte(0)
    )
      throw new RangeError(
        'Check physical weights, payable weight, purity and rate.',
      );
    const payable = net.minus(deducted),
      metal = money(payable.mul(rate).div(factor)),
      deduction = money(decimal(line.deductionNpr));
    if (deduction.gte(metal))
      throw new RangeError(
        'The monetary deduction must be less than the metal value.',
      );
    return {
      netWeightGrams: net.toFixed(3),
      fineWeightGrams: net.mul(purity).div(1000).toFixed(6),
      payableWeightGrams: payable.toFixed(3),
      metalNpr: metal.toFixed(2),
      deductionNpr: deduction.toFixed(2),
      totalNpr: money(metal.minus(deduction)).toFixed(2),
    };
  });
  return {
    lines: priced,
    totalNpr: money(
      priced.reduce((sum, line) => sum.add(line.totalNpr), new D(0)),
    ).toFixed(2),
  };
}
export function purchaseSettlement(input: {
  purchaseNpr: string;
  saleNpr: string;
  receivedNpr: string;
  payoutNpr: string;
  balanceBeforeNpr: string;
}) {
  const purchase = decimal(input.purchaseNpr),
    sale = decimal(input.saleNpr),
    received = decimal(input.receivedNpr),
    payout = decimal(input.payoutNpr),
    before = decimal(input.balanceBeforeNpr, true);
  if (received.gt(sale) || (received.gt(0) && payout.gt(0)))
    throw new RangeError(
      'Record money received or money paid out, not both. Received money cannot exceed the sale total.',
    );
  const available = D.min(
    purchase,
    D.max(purchase.minus(sale).minus(before), 0),
  );
  if (payout.gt(available))
    throw new RangeError(
      `Payout cannot exceed NPR ${available.toFixed(2)} after the sale and earlier customer dues.`,
    );
  return {
    balanceBeforeNpr: before.toFixed(2),
    balanceAfterCreditNpr: before.minus(purchase).toFixed(2),
    balanceAfterNpr: before
      .minus(purchase)
      .add(sale)
      .minus(received)
      .add(payout)
      .toFixed(2),
    maximumPayoutNpr: available.toFixed(2),
  };
}
