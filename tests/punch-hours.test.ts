import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PunchSession } from '../src/types';
import {
  splitPunchByLocalDay, punchHoursOnDay, punchHoursInMonth,
  totalHoursOnDay, punchDayKeys
} from '../src/punchHours';

const EDMONTON = 'America/Edmonton';

function punch(overrides: Partial<PunchSession>): PunchSession {
  return {
    id: 'p1', employeeId: 'e1', employeeName: 'Mathieu',
    projectId: 'c1', projectName: 'Chantier', payMode: 'horaire', rate: 40,
    startTime: '2026-07-22T08:00:00-06:00', endTime: '2026-07-22T16:00:00-06:00',
    pausedAt: null, totalPauseMinutes: 0, withinGeofence: true, revenue: 0,
    ...overrides
  };
}

const arrondi = (valeur: number) => Number(valeur.toFixed(6));

test('une journée normale reste sur une seule journée', () => {
  const tranches = splitPunchByLocalDay(punch({}), EDMONTON);
  assert.equal(tranches.length, 1);
  assert.equal(tranches[0].dayKey, '2026-07-22');
  assert.equal(arrondi(tranches[0].hours), 8);
});

test('un pointage de nuit se répartit sur les deux journées', () => {
  const nuit = punch({
    startTime: '2026-07-22T22:00:00-06:00',
    endTime: '2026-07-23T02:00:00-06:00'
  });
  const tranches = splitPunchByLocalDay(nuit, EDMONTON);
  assert.deepEqual(tranches.map(t => t.dayKey), ['2026-07-22', '2026-07-23']);
  assert.equal(arrondi(tranches[0].hours), 2, 'deux heures avant minuit');
  assert.equal(arrondi(tranches[1].hours), 2, 'deux heures après minuit');
});

test('le total réparti égale toujours le temps travaillé', () => {
  const nuit = punch({
    startTime: '2026-07-22T20:00:00-06:00',
    endTime: '2026-07-23T06:00:00-06:00',
    totalPauseMinutes: 60
  });
  const tranches = splitPunchByLocalDay(nuit, EDMONTON);
  const somme = tranches.reduce((s, t) => s + t.hours, 0);
  assert.equal(arrondi(somme), 9, '10 h écoulées moins 1 h de pause');
});

test('les pauses sont réparties au prorata, pas imputées à une seule journée', () => {
  const nuit = punch({
    startTime: '2026-07-22T22:00:00-06:00',
    endTime: '2026-07-23T02:00:00-06:00',
    totalPauseMinutes: 60
  });
  const tranches = splitPunchByLocalDay(nuit, EDMONTON);
  // 4 h écoulées, 1 h de pause → 3 h travaillées, moitié-moitié.
  assert.equal(arrondi(tranches[0].hours), 1.5);
  assert.equal(arrondi(tranches[1].hours), 1.5);
});

test('un pointage sur trois journées produit trois tranches', () => {
  const long = punch({
    startTime: '2026-07-22T23:00:00-06:00',
    endTime: '2026-07-24T01:00:00-06:00'
  });
  assert.deepEqual(punchDayKeys(long, EDMONTON), ['2026-07-22', '2026-07-23', '2026-07-24']);
  assert.equal(arrondi(punchHoursOnDay(long, '2026-07-23', EDMONTON)), 24);
});

test('les heures de l’après-midi ne disparaissent plus le soir venu', () => {
  // Le bug d'origine : à 23 h 35 locale, le filtre « aujourd'hui » basculait au
  // lendemain en UTC et le pointage de 14 h n'était plus compté.
  const apresMidi = punch({
    id: 'apresmidi',
    startTime: '2026-07-22T14:00:00-06:00',
    endTime: '2026-07-22T17:00:00-06:00'
  });
  const soir = punch({
    id: 'soir',
    startTime: '2026-07-22T22:00:00-06:00',
    endTime: '2026-07-22T23:30:00-06:00'
  });
  const total = totalHoursOnDay([apresMidi, soir], '2026-07-22', EDMONTON);
  assert.equal(arrondi(total), 4.5, 'les deux pointages comptent sur la même journée');
});

test('un pointage ouvert compte jusqu’à maintenant', () => {
  const ouvert = punch({
    startTime: '2026-07-22T08:00:00-06:00',
    endTime: null
  });
  const maintenant = new Date('2026-07-22T11:00:00-06:00');
  assert.equal(arrondi(punchHoursOnDay(ouvert, '2026-07-22', EDMONTON, maintenant)), 3);
});

test('le mois local agrège correctement une nuit de fin de mois', () => {
  const finDeMois = punch({
    startTime: '2026-07-31T22:00:00-06:00',
    endTime: '2026-08-01T02:00:00-06:00'
  });
  assert.equal(arrondi(punchHoursInMonth(finDeMois, '2026-07', EDMONTON)), 2);
  assert.equal(arrondi(punchHoursInMonth(finDeMois, '2026-08', EDMONTON)), 2);
});

test('les pointages incohérents ne cassent rien', () => {
  assert.deepEqual(splitPunchByLocalDay(punch({ startTime: 'invalide' }), EDMONTON), []);
  const inverse = punch({ startTime: '2026-07-22T16:00:00-06:00', endTime: '2026-07-22T08:00:00-06:00' });
  assert.deepEqual(splitPunchByLocalDay(inverse, EDMONTON), [], 'fin avant début : aucune heure');
});
