import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  displayDate,
  displayTime,
  displayPeriod,
} from '../src/settings/dates.mjs';
const ad = { calendar: 'AD', timeZone: 'Asia/Kathmandu', hourCycle: 'h23' };
const bs = { ...ad, calendar: 'BS' };

test('civil dates preserve their day independently of the display timezone and machine timezone', () => {
  const previous = process.env.TZ;
  try {
    for (const machine of ['UTC', 'Pacific/Honolulu', 'Pacific/Kiritimati']) {
      process.env.TZ = machine;
      assert.equal(
        displayDate('2026-10-20', { ...ad, timeZone: 'America/New_York' }),
        '2026-10-20 AD',
      );
      assert.equal(displayDate('2026-10-20', bs), '2083-07-03 BS');
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('BS conversion handles new year, lookup boundaries, leap days and localized calendar labels', () => {
  assert.equal(displayDate('2024-04-12', bs), '2080-12-30 BS');
  assert.equal(displayDate('2024-04-13', bs), '2081-01-01 BS');
  assert.equal(displayDate('2024-02-29', bs), '2080-11-17 BS');
  assert.equal(displayDate('1943-04-14', bs), '2000-01-01 BS');
  assert.equal(displayDate('1943-04-13', bs), '1943-04-13 AD');
  assert.equal(displayDate('2099-12-31', bs), '2099-12-31 AD');
  assert.equal(
    displayDate('2026-10-20', bs, 'ne'),
    '2083-07-03 \u0935\u093f.\u0938\u0902.',
  );
  assert.equal(displayDate(null, bs), '\u2014');
});

test('timestamp formatting applies timezone midnight, daylight saving, and 12/24-hour selection', () => {
  assert.equal(
    displayTime('2026-10-19T20:00:00Z', bs),
    '2083-07-03 BS \u00b7 01:45 \u00b7 Asia/Kathmandu',
  );
  assert.equal(
    displayTime('2026-10-19T20:00:00Z', { ...ad, timeZone: 'UTC' }),
    '2026-10-19 AD \u00b7 20:00 \u00b7 UTC',
  );
  assert.match(
    displayTime('2026-10-19T20:00:00Z', {
      ...ad,
      timeZone: 'UTC',
      hourCycle: 'h12',
    }),
    /08:00 pm/i,
  );
  const ny = { ...ad, timeZone: 'America/New_York' };
  assert.match(displayTime('2026-03-08T06:59:00Z', ny), /01:59/);
  assert.match(displayTime('2026-03-08T07:00:00Z', ny), /03:00/);
  assert.equal(displayTime('not-an-instant', ad), '\u2014');
});

test('monthly accounting periods show their actual boundaries in BS', () => {
  assert.equal(displayPeriod('2024-04', ad), '2024-04 AD');
  assert.equal(
    displayPeriod('2024-04', bs),
    '2080-12-19 BS \u2014 2081-01-18 BS',
  );
  assert.equal(
    displayPeriod('2024-04', bs, 'en', {
      from: '2024-04-13',
      to: '2024-04-20',
    }),
    '2081-01-01 BS \u2014 2081-01-08 BS',
  );
  assert.equal(displayPeriod('2024-04-13', bs), '2081-01-01 BS');
});
