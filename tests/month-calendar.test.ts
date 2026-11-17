import test from 'node:test';
import assert from 'node:assert/strict';
import { monthDays, shiftMonth } from '../src/month-calendar.ts';

test('calendar grid respects leap years and weekday alignment', () => {
  const cells = monthDays('2028-02');
  assert.deepEqual(cells.slice(0, 3), [null, null, '2028-02-01']);
  assert.equal(cells.filter(Boolean).length, 29);
  assert.equal(cells.length % 7, 0);
  assert.equal(monthDays('2027-02').filter(Boolean).length, 28);
});

test('calendar navigation crosses year boundaries', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
});
