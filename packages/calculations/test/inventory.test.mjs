import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inventoryWeights } from '../dist/index.js';

test('stone weight is excluded before fine metal is calculated', () => {
  assert.deepEqual(inventoryWeights('12.664', '1', '916.667'), {
    netWeightGrams: '11.664',
    fineWeightGrams: '10.692004',
  });
  assert.deepEqual(inventoryWeights('0.001', '0', '333.333'), {
    netWeightGrams: '0.001',
    fineWeightGrams: '0.000333',
  });
});
test('invalid physical weights and purity cannot produce inventory totals', () => {
  for (const input of [
    ['1', '1', '925'],
    ['1', '2', '925'],
    ['1', '0', '1001'],
    ['1', '0', '0'],
  ]) {
    assert.throws(() => inventoryWeights(...input), RangeError);
  }
});
