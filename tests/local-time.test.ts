import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  localDayKey, localMonthKey, isOnLocalDay, isInLocalMonth,
  startOfLocalDay, endOfLocalDay, setAppTimeZone, appTimeZone
} from '../src/localTime';

const EDMONTON = 'America/Edmonton';

test('la journée locale ne bascule pas le soir comme le faisait toISOString', () => {
  // 23 h 30 le 22 juillet en Alberta = 05 h 30 UTC le 23 juillet.
  const soir = '2026-07-22T23:30:00-06:00';
  assert.equal(new Date(soir).toISOString().split('T')[0], '2026-07-23', 'témoin : l’ancien calcul UTC');
  assert.equal(localDayKey(soir, EDMONTON), '2026-07-22', 'la journée locale reste le 22');
});

test('deux pointages de la même journée de travail tombent sur la même journée', () => {
  const apresMidi = '2026-07-22T14:00:00-06:00';
  const soir = '2026-07-22T23:30:00-06:00';
  assert.equal(localDayKey(apresMidi, EDMONTON), localDayKey(soir, EDMONTON));
});

test('le mois local suit la même règle', () => {
  // 31 juillet 23 h locale = 1er août en UTC.
  assert.equal(localMonthKey('2026-07-31T23:00:00-06:00', EDMONTON), '2026-07');
  assert.equal(localMonthKey('2026-08-01T01:00:00-06:00', EDMONTON), '2026-08');
});

test('isOnLocalDay et isInLocalMonth', () => {
  assert.equal(isOnLocalDay('2026-07-22T23:30:00-06:00', '2026-07-22', EDMONTON), true);
  assert.equal(isOnLocalDay('2026-07-22T23:30:00-06:00', '2026-07-23', EDMONTON), false);
  assert.equal(isInLocalMonth('2026-07-31T23:00:00-06:00', '2026-07', EDMONTON), true);
  assert.equal(isOnLocalDay(null, '2026-07-22', EDMONTON), false);
  assert.equal(isInLocalMonth(undefined, '2026-07', EDMONTON), false);
});

test('les bornes de journée encadrent exactement 24 h en temps normal', () => {
  const debut = startOfLocalDay('2026-07-22', EDMONTON);
  const fin = endOfLocalDay('2026-07-22', EDMONTON);
  assert.equal(debut.toISOString(), '2026-07-22T06:00:00.000Z');
  assert.equal(fin.toISOString(), '2026-07-23T06:00:00.000Z');
  assert.equal((fin.getTime() - debut.getTime()) / 3600000, 24);
});

test('la nuit du passage à l’heure avancée ne dure que 23 h', () => {
  // 8 mars 2026 : l’Alberta avance d’une heure.
  const debut = startOfLocalDay('2026-03-08', EDMONTON);
  const fin = endOfLocalDay('2026-03-08', EDMONTON);
  assert.equal((fin.getTime() - debut.getTime()) / 3600000, 23);
});

test('la nuit du retour à l’heure normale dure 25 h', () => {
  // 1er novembre 2026 : l’Alberta recule d’une heure.
  const debut = startOfLocalDay('2026-11-01', EDMONTON);
  const fin = endOfLocalDay('2026-11-01', EDMONTON);
  assert.equal((fin.getTime() - debut.getTime()) / 3600000, 25);
});

test('une date invalide ne fait pas planter le calcul', () => {
  assert.equal(localDayKey('pas une date', EDMONTON), '');
  assert.equal(localMonthKey('', EDMONTON), '');
});

test('le fuseau par défaut est configurable et réversible', () => {
  const parDefaut = appTimeZone();
  setAppTimeZone('Europe/Paris');
  assert.equal(appTimeZone(), 'Europe/Paris');
  // 22 juillet 00 h 30 à Paris = 21 juillet 22 h 30 UTC.
  assert.equal(localDayKey('2026-07-21T22:30:00Z'), '2026-07-22');
  setAppTimeZone(null);
  assert.equal(appTimeZone(), parDefaut);
});
