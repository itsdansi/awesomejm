import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceSale } from '../dist/index.js';

const line = {
  netWeightGrams: '11.664',
  wastageGrams: '0.116',
  sellRatePerTola: '150000.25',
  gramsPerTola: '11.66400',
  makingNpr: '3000.10',
  stonesNpr: '500.25',
};
const input = {
  lines: [line],
  discountNpr: '500',
  taxNpr: '25',
  paymentNpr: '100000',
  balanceBeforeNpr: '-1000.50',
};

test('sales price uses the quoted purity rate once, bills wastage separately and applies advances', () => {
  const sale = priceSale(input);
  assert.deepEqual(sale.lines[0], {
    metalNpr: '150000.25',
    wastageNpr: '1491.77',
    makingNpr: '3000.10',
    stonesNpr: '500.25',
    lineTotalNpr: '154992.37',
  });
  assert.equal(sale.subtotalNpr, '154992.37');
  assert.equal(sale.totalNpr, '154517.37');
  assert.equal(sale.advanceAppliedNpr, '1000.50');
  assert.equal(sale.dueAtPostingNpr, '53516.87');
  assert.equal(sale.balanceAfterNpr, '53516.87');
});
test('displayed component rounding sums exactly across lines', () => {
  const halfCent = {
    ...line,
    netWeightGrams: '1',
    wastageGrams: '1',
    sellRatePerTola: '0.01',
    gramsPerTola: '2',
    makingNpr: '0',
    stonesNpr: '0',
  };
  const sale = priceSale({
    ...input,
    lines: [halfCent, halfCent],
    discountNpr: '0',
    taxNpr: '0',
    paymentNpr: '0',
    balanceBeforeNpr: '0',
  });
  assert.equal(sale.lines[0].metalNpr, '0.01');
  assert.equal(sale.lines[0].wastageNpr, '0.01');
  assert.equal(sale.totalNpr, '0.04');
});
test('earlier dues are retained and surplus advances remain on the account', () => {
  const due = priceSale({ ...input, balanceBeforeNpr: '20000' });
  assert.equal(due.advanceAppliedNpr, '0.00');
  assert.equal(due.dueAtPostingNpr, '54517.37');
  assert.equal(due.balanceAfterNpr, '74517.37');
  const advance = priceSale({ ...input, balanceBeforeNpr: '-200000' });
  assert.equal(advance.advanceAppliedNpr, '54517.37');
  assert.equal(advance.dueAtPostingNpr, '0.00');
  assert.equal(advance.balanceAfterNpr, '-145482.63');
});
test('invalid, excessive and nonpositive amounts cannot become posted sales', () => {
  for (const invalid of [
    { lines: [] },
    { lines: Array(21).fill(line) },
    { discountNpr: '999999999' },
    { paymentNpr: '999999999' },
    { taxNpr: '-1' },
    { discountNpr: '1e2' },
    { lines: [{ ...line, gramsPerTola: '0' }] },
    { lines: [{ ...line, netWeightGrams: '0' }] },
    { lines: [{ ...line, wastageGrams: '-1' }] },
    { lines: [{ ...line, sellRatePerTola: '999999999' }] },
    {
      lines: [
        {
          ...line,
          netWeightGrams: '0.001',
          wastageGrams: '0',
          makingNpr: '0',
          stonesNpr: '0',
          sellRatePerTola: '0.01',
        },
      ],
      paymentNpr: '0',
      discountNpr: '0',
      taxNpr: '0',
    },
  ])
    assert.throws(
      () => priceSale({ ...input, ...invalid }),
      RangeError,
      JSON.stringify(invalid),
    );
});
