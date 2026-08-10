import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isInLocalMonth,
  isOnLocalDate,
  localDateKey,
  localMonthKey,
  monthOptions,
  offsetMonthKey
} from '../src/dateKeys';

test('un pointage UTC de fin août reste en août en Alberta', () => {
  const instant = '2026-09-01T02:00:00.000Z';
  assert.equal(localMonthKey(instant, 'America/Edmonton'), '2026-08');
  assert.equal(localDateKey(instant, 'America/Edmonton'), '2026-08-31');
  assert.equal(isInLocalMonth(instant, '2026-08', 'America/Edmonton'), true);
  assert.equal(isOnLocalDate(instant, '2026-08-31', 'America/Edmonton'), true);
});

test('une date civile sans heure ne change jamais de jour', () => {
  assert.equal(localDateKey('2026-01-01', 'America/Edmonton'), '2026-01-01');
  assert.equal(localMonthKey('2026-01-01', 'Pacific/Auckland'), '2026-01');
});

test('la navigation des mois continue après décembre 2026', () => {
  assert.equal(offsetMonthKey('2026-12', 1), '2027-01');
  assert.equal(offsetMonthKey('2027-01', -1), '2026-12');
  const options = monthOptions('2027-01');
  assert.ok(options.includes('2027-01'));
  assert.ok(options.includes('2028-01'));
  assert.ok(options.includes('2022-01'));
});
