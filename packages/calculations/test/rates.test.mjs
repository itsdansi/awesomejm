import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ratePerGram } from '../dist/index.js';

test('per-gram rate preview uses the recorded conversion and six-place rounding', () => {
  assert.equal(ratePerGram('116640.01'), '10000.000857');
  assert.equal(ratePerGram('100', '10'), '10.000000');
  assert.equal(ratePerGram('0.01', '3'), '0.003333');
});
test('rates and conversion factors must be positive decimal strings', () => {
  for (const value of ['0', '-1', 'NaN', '1e5'])
    assert.throws(() => ratePerGram(value), RangeError);
  assert.throws(() => ratePerGram('100', '0'), RangeError);
});
