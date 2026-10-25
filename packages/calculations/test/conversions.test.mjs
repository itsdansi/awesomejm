import assert from 'node:assert/strict';
import test from 'node:test';
import { gramsToTola, tolaToGrams } from '../dist/index.js';

test('converts fractional weights with decimal arithmetic', () => {
  assert.equal(tolaToGrams('0.1'), '1.166');
  assert.equal(gramsToTola('11.664'), '1.000000');
  assert.equal(tolaToGrams('0'), '0.000');
});

test('allows a shop-specific conversion', () => {
  assert.equal(tolaToGrams('1', '11.6638'), '11.664');
  assert.equal(gramsToTola('11.6638', '11.6638'), '1.000000');
});

test('rejects invalid weights and zero conversion factors', () => {
  for (const value of ['-1', 'NaN', 'Infinity', '', ' 1', '1e3']) {
    assert.throws(() => tolaToGrams(value), RangeError);
  }
  assert.throws(() => gramsToTola('1', '0'), RangeError);
});

test('combines whole tola and fractional lal before rounding once to stored grams', async () => {
  const { tolaLalToGrams } = await import('../dist/index.js');
  assert.equal(tolaLalToGrams('1', '0'), '11.664');
  assert.equal(tolaLalToGrams('0', '1'), '0.117');
  assert.equal(tolaLalToGrams('0', '50'), '5.832');
  assert.equal(tolaLalToGrams('1', '25.50'), '14.638');
  assert.equal(tolaLalToGrams('0', '0.01'), '0.001');
  assert.equal(tolaLalToGrams('0', '0'), '0.000');
  assert.equal(tolaLalToGrams('0', '0.01', '5'), '0.001');
  assert.equal(tolaLalToGrams('1', '0', '11.6638'), '11.664');
  assert.equal(tolaLalToGrams('1', '25.50', '10'), '12.550');
});

test('local display splits at 100 lal, carries rounding, and preserves correction signs', async () => {
  const { gramsToTolaLal } = await import('../dist/index.js');
  assert.deepEqual(gramsToTolaLal('11.664'), {
    tola: '1',
    lal: '0.00',
    negative: false,
    approximate: false,
  });
  assert.deepEqual(gramsToTolaLal('5.832'), {
    tola: '0',
    lal: '50.00',
    negative: false,
    approximate: false,
  });
  assert.deepEqual(gramsToTolaLal('0.117'), {
    tola: '0',
    lal: '1.00',
    negative: false,
    approximate: true,
  });
  assert.deepEqual(gramsToTolaLal('-5.832'), {
    tola: '0',
    lal: '50.00',
    negative: true,
    approximate: false,
  });
  assert.deepEqual(gramsToTolaLal('-0.000'), {
    tola: '0',
    lal: '0.00',
    negative: false,
    approximate: false,
  });
  assert.deepEqual(gramsToTolaLal('11.663999'), {
    tola: '1',
    lal: '0.00',
    negative: false,
    approximate: true,
  });
  assert.deepEqual(gramsToTolaLal('25', '10'), {
    tola: '2',
    lal: '50.00',
    negative: false,
    approximate: false,
  });
});

test('local entry rejects ambiguous notation, invalid lal, fractional tola and invalid factors', async () => {
  const { tolaLalToGrams, gramsToTolaLal } = await import('../dist/index.js');
  for (const tola of ['', '-1', '1.5', '1e3', ' 1', '01'])
    assert.throws(() => tolaLalToGrams(tola, '0'), RangeError);
  for (const lal of [
    '',
    '-1',
    '100',
    '100.00',
    '0.001',
    'NaN',
    'Infinity',
    ' 1',
    '1e2',
    '01',
  ])
    assert.throws(() => tolaLalToGrams('0', lal), RangeError);
  for (const factor of ['0', '-1', '', 'NaN']) {
    assert.throws(() => tolaLalToGrams('1', '0', factor), RangeError);
    assert.throws(() => gramsToTolaLal('1', factor), RangeError);
  }
  for (const grams of ['', 'NaN', 'Infinity', '1e3', ' 1'])
    assert.throws(() => gramsToTolaLal(grams), RangeError);
});

test('display rounding never changes canonical grams or quoted selling values', async () => {
  const { gramsToTolaLal, priceSale } = await import('../dist/index.js');
  const original = '11.663';
  gramsToTolaLal(original);
  assert.equal(original, '11.663');
  const input = {
    lines: [
      {
        netWeightGrams: '0.117',
        wastageGrams: '0',
        gramsPerTola: '11.664',
        sellRatePerTola: '116640',
        makingNpr: '0',
        stonesNpr: '0',
      },
    ],
    discountNpr: '0',
    taxNpr: '0',
    paymentNpr: '0',
    balanceBeforeNpr: '0',
  };
  const before = priceSale(input);
  assert.equal(before.lines[0].metalNpr, '1170.00');
  gramsToTolaLal(input.lines[0].netWeightGrams);
  assert.deepEqual(priceSale(input), before);
});
