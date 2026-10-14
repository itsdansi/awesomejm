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
