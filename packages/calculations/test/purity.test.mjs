import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GOLD_PURITY_PRESETS,
  DEFAULT_GOLD_FINENESS,
  DEFAULT_SILVER_FINENESS,
  finenessToPercentage,
  goldPurityPreset,
  inventoryWeights,
  pricePurchase,
  priceSale,
} from '../dist/index.js';

test('shop-approved gold presets produce the agreed percentages and fine weights', () => {
  const expected = [
    ['24K', '999', '99.9', '9.990000'],
    ['22K', '916', '91.6', '9.160000'],
    ['18K', '750', '75.0', '7.500000'],
    ['14K', '585', '58.5', '5.850000'],
    ['10K', '417', '41.7', '4.170000'],
  ];
  assert.deepEqual(
    GOLD_PURITY_PRESETS.map(({ karat, fineness }) => [karat, fineness]),
    expected.map(([karat, fineness]) => [karat, fineness]),
  );
  for (const [karat, fineness, percentage, fineWeight] of expected) {
    assert.equal(goldPurityPreset(`${fineness}.000`).karat, karat);
    assert.equal(finenessToPercentage(fineness), percentage);
    assert.equal(
      inventoryWeights('10', '0', fineness).fineWeightGrams,
      fineWeight,
    );
  }
  assert.equal(DEFAULT_GOLD_FINENESS, '916');
  assert.equal(DEFAULT_SILVER_FINENESS, '925');
});

test('custom and historical purities retain their exact fineness rather than rounding into a grade', () => {
  for (const [fineness, percent] of [
    ['916.667', '91.6667'],
    ['999.9', '99.99'],
    ['958.5', '95.85'],
    ['925', '92.5'],
    ['1000', '100.0'],
    ['0.001', '0.0001'],
  ]) {
    assert.equal(goldPurityPreset(fineness), undefined);
    assert.equal(finenessToPercentage(fineness), percent);
  }
  assert.equal(
    inventoryWeights('10', '0', '916.667').fineWeightGrams,
    '9.166670',
  );
});

test('invalid and incomplete fineness cannot produce a believable percentage or preset', () => {
  for (const value of [
    '',
    '0',
    '-1',
    '1000.001',
    '1001',
    '916.6667',
    '22K',
    '91.6%',
    'NaN',
    'Infinity',
    '1e3',
    ' 916',
  ]) {
    assert.throws(() => finenessToPercentage(value), RangeError);
    assert.equal(goldPurityPreset(value), undefined);
  }
});

test('purity-specific quotes are priced once for every preset and legacy fineness', () => {
  for (const fineness of [
    ...GOLD_PURITY_PRESETS.map((entry) => entry.fineness),
    '916.667',
  ]) {
    const purchase = pricePurchase([
      {
        grossWeightGrams: '11.664',
        nonMetalWeightGrams: '0',
        deductedWeightGrams: '0',
        fineness,
        buyRatePerTola: '100000',
        gramsPerTola: '11.664',
        deductionNpr: '0',
      },
    ]);
    assert.equal(purchase.lines[0].metalNpr, '100000.00');
    const sale = priceSale({
      lines: [
        {
          netWeightGrams: '11.664',
          wastageGrams: '0',
          sellRatePerTola: '150000',
          gramsPerTola: '11.664',
          makingNpr: '0',
          stonesNpr: '0',
        },
      ],
      discountNpr: '0',
      taxNpr: '0',
      paymentNpr: '0',
      balanceBeforeNpr: '0',
    });
    assert.equal(sale.lines[0].metalNpr, '150000.00');
  }
});
