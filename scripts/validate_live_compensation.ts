import assert from 'node:assert/strict';
import { calculateLiveCompensation } from '../src/components/LiveCompensationPanel';

const closeTo = (actual: number, expected: number, tolerance = 0.01) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} devrait être près de ${expected}`);
};

const hourlyOneSecond = calculateLiveCompensation({
  mode: 'horaire',
  rate: 40,
  elapsedSeconds: 1
});
closeTo(hourlyOneSecond.grossAmount, 40 / 3600, 0.00001);
assert.equal(hourlyOneSecond.primaryKind, 'gross');

const hourlyOneHour = calculateLiveCompensation({
  mode: 'horaire',
  rate: 40,
  elapsedSeconds: 3600
});
closeTo(hourlyOneHour.grossAmount, 40);
closeTo(hourlyOneHour.effectiveHourlyRate, 40);

const fixedBeforeOneHour = calculateLiveCompensation({
  mode: 'forfait',
  rate: 2000,
  elapsedSeconds: 3599
});
assert.equal(fixedBeforeOneHour.fixedRateUnlocked, false);
closeTo(fixedBeforeOneHour.primaryValue, 0);
closeTo(fixedBeforeOneHour.grossAmount, 2000);

const fixedAtOneHour = calculateLiveCompensation({
  mode: 'forfait',
  rate: 2000,
  elapsedSeconds: 3600
});
assert.equal(fixedAtOneHour.fixedRateUnlocked, true);
closeTo(fixedAtOneHour.effectiveHourlyRate, 2000);

const fixedAtTwoHours = calculateLiveCompensation({
  mode: 'forfait',
  rate: 2000,
  elapsedSeconds: 7200
});
closeTo(fixedAtTwoHours.effectiveHourlyRate, 1000);

const fixedAtTwentyFourHours = calculateLiveCompensation({
  mode: 'forfait',
  rate: 2000,
  elapsedSeconds: 24 * 3600
});
closeTo(fixedAtTwentyFourHours.effectiveHourlyRate, 83.33);

const surfacePending = calculateLiveCompensation({
  mode: 'surface',
  rate: 0,
  elapsedSeconds: 8 * 3600
});
assert.equal(surfacePending.primaryKind, 'pending-surface');
closeTo(surfacePending.grossAmount, 0);

const surfaceDeclared = calculateLiveCompensation({
  mode: 'surface',
  rate: 0,
  elapsedSeconds: 10 * 3600,
  surfaceTotal: 1500
});
assert.equal(surfaceDeclared.primaryKind, 'effective-hourly');
closeTo(surfaceDeclared.grossAmount, 1500);
closeTo(surfaceDeclared.effectiveHourlyRate, 150);

console.log('Calculs de rémunération en direct validés', {
  hourlyOneSecond: hourlyOneSecond.grossAmount,
  hourlyOneHour: hourlyOneHour.grossAmount,
  fixedAtOneHour: fixedAtOneHour.effectiveHourlyRate,
  fixedAtTwoHours: fixedAtTwoHours.effectiveHourlyRate,
  fixedAtTwentyFourHours: fixedAtTwentyFourHours.effectiveHourlyRate,
  surfaceDeclaredHourlyYield: surfaceDeclared.effectiveHourlyRate
});
