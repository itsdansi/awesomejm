import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pricePurchase, purchaseSettlement } from '../dist/index.js';
const line = {
  grossWeightGrams: '12.664',
  nonMetalWeightGrams: '1',
  deductedWeightGrams: '0.164',
  fineness: '916.667',
  buyRatePerTola: '116640',
  gramsPerTola: '11.664',
  deductionNpr: '100',
};
test('old metal retains full net stock while commercial deductions change payable value', () => {
  const price = pricePurchase([line]);
  assert.equal(price.totalNpr, '114900.00');
  assert.deepEqual(price.lines[0], {
    netWeightGrams: '11.664',
    fineWeightGrams: '10.692004',
    payableWeightGrams: '11.500',
    metalNpr: '115000.00',
    deductionNpr: '100.00',
    totalNpr: '114900.00',
  });
});
test('buying quote is applied once, with half-up rounding before summing lots', () => {
  const tiny = {
    ...line,
    grossWeightGrams: '1',
    nonMetalWeightGrams: '0',
    deductedWeightGrams: '0',
    buyRatePerTola: '0.01',
    gramsPerTola: '2',
    deductionNpr: '0',
  };
  assert.equal(pricePurchase([tiny, tiny]).totalNpr, '0.02');
});
test('exchange settlement includes earlier dues and only pays out remaining credit', () => {
  assert.deepEqual(
    purchaseSettlement({
      purchaseNpr: '114900',
      saleNpr: '150000',
      receivedNpr: '20000',
      payoutNpr: '0',
      balanceBeforeNpr: '1000',
    }),
    {
      balanceBeforeNpr: '1000.00',
      balanceAfterCreditNpr: '-113900.00',
      balanceAfterNpr: '16100.00',
      maximumPayoutNpr: '0.00',
    },
  );
  const paid = purchaseSettlement({
    purchaseNpr: '233280',
    saleNpr: '150000',
    receivedNpr: '0',
    payoutNpr: '50000',
    balanceBeforeNpr: '0',
  });
  assert.equal(paid.maximumPayoutNpr, '83280.00');
  assert.equal(paid.balanceAfterNpr, '-33280.00');
});
test('invalid physical weights, zero or excessive values and contradictory settlements are rejected', () => {
  for (const fields of [
    { nonMetalWeightGrams: '12.664' },
    { deductedWeightGrams: '11.664' },
    { fineness: '1001' },
    { fineness: '0' },
    { deductionNpr: '115000' },
    { buyRatePerTola: '999999999', grossWeightGrams: '24' },
    { grossWeightGrams: '-1' },
  ])
    assert.throws(() => pricePurchase([{ ...line, ...fields }]), RangeError);
  assert.throws(() => pricePurchase([]), RangeError);
  for (const fields of [
    { payoutNpr: '83280.01' },
    { receivedNpr: '1', payoutNpr: '1' },
    { receivedNpr: '150001' },
  ])
    assert.throws(
      () =>
        purchaseSettlement({
          purchaseNpr: '233280',
          saleNpr: '150000',
          receivedNpr: '0',
          payoutNpr: '0',
          balanceBeforeNpr: '0',
          ...fields,
        }),
      RangeError,
    );
});
