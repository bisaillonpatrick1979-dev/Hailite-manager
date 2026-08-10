import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildEmployeeDossier,
  dossierIdentity,
  employeePaidTotal,
  employeePayrollHistory,
  localDayKey,
  punchSessionHours,
  DOSSIER_FORBIDDEN_FIELDS
} from '../src/employeeDossier';
import type { Employee, PayrollPayment, PunchSession } from '../src/types';
import { setAppTimeZone } from '../src/localTime';
import { splitPunchByLocalDay } from '../src/punchHours';

function punch(overrides: Partial<PunchSession>): PunchSession {
  return {
    id: 'p1',
    employeeId: 'e1',
    employeeName: 'Léa Tremblay',
    projectId: 'c1',
    projectName: '335 Grégoire Crescent',
    payMode: 'horaire',
    rate: 42,
    startTime: '2026-08-10T13:00:00.000Z',
    endTime: '2026-08-10T21:00:00.000Z',
    pausedAt: null,
    totalPauseMinutes: 0,
    withinGeofence: true,
    revenue: 336,
    totalWorkedHours: 8,
    ...overrides
  } as PunchSession;
}

test('les heures enregistrées font foi quand elles existent', () => {
  assert.equal(punchSessionHours(punch({ totalWorkedHours: 7.25 })), 7.25);
});

test('un pointage sans total est reconstitué, pauses déduites', () => {
  const session = punch({
    totalWorkedHours: undefined,
    startTime: '2026-08-10T12:00:00.000Z',
    endTime: '2026-08-10T20:00:00.000Z',
    totalPauseMinutes: 30
  });
  assert.equal(punchSessionHours(session), 7.5);
});

test('un pointage encore ouvert est compté jusqu’à maintenant', () => {
  const session = punch({
    totalWorkedHours: undefined,
    startTime: '2026-08-10T12:00:00.000Z',
    endTime: null,
    totalPauseMinutes: 0
  });
  const hours = punchSessionHours(session, new Date('2026-08-10T15:00:00.000Z'));
  assert.equal(hours, 3);
});

test('une date invalide ne fabrique pas d’heures', () => {
  assert.equal(punchSessionHours(punch({ totalWorkedHours: undefined, startTime: 'n’importe quoi' })), 0);
});

test('le dossier regroupe par jour, mois et année', () => {
  const sessions = [
    punch({ id: 'a', startTime: '2026-08-10T13:00:00.000Z', endTime: '2026-08-10T21:00:00.000Z', totalWorkedHours: 8, revenue: 336 }),
    punch({ id: 'b', startTime: '2026-08-11T13:00:00.000Z', endTime: '2026-08-11T19:00:00.000Z', totalWorkedHours: 6, revenue: 252 }),
    punch({ id: 'c', startTime: '2025-06-02T13:00:00.000Z', endTime: '2025-06-02T21:00:00.000Z', totalWorkedHours: 8, revenue: 320 })
  ];
  const dossier = buildEmployeeDossier('e1', sessions, new Date('2026-08-10T18:00:00.000Z'));

  assert.equal(dossier.totals.hours, 22);
  assert.equal(dossier.totals.revenue, 908);
  assert.equal(dossier.totals.daysWorked, 3);
  assert.equal(dossier.years.length, 2);
  assert.equal(dossier.years[0].year, '2026', 'l’année la plus récente vient en premier');
  assert.equal(dossier.years[0].hours, 14);
  assert.equal(dossier.years[1].year, '2025');
  assert.equal(dossier.years[1].hours, 8);
});

test('les pointages d’un autre employé n’entrent jamais dans le dossier', () => {
  const sessions = [
    punch({ id: 'a', employeeId: 'e1', totalWorkedHours: 8 }),
    punch({ id: 'b', employeeId: 'e2', totalWorkedHours: 40, revenue: 9999 })
  ];
  const dossier = buildEmployeeDossier('e1', sessions, new Date('2026-08-10T18:00:00.000Z'));
  assert.equal(dossier.totals.hours, 8);
  assert.equal(dossier.totals.revenue, 336);
  assert.equal(dossier.totals.sessions, 1);
});

test('deux quarts le même jour comptent pour une seule journée travaillée', () => {
  const sessions = [
    punch({ id: 'a', startTime: '2026-08-10T12:00:00.000Z', endTime: '2026-08-10T16:00:00.000Z', totalWorkedHours: 4, revenue: 168 }),
    punch({ id: 'b', startTime: '2026-08-10T18:00:00.000Z', endTime: '2026-08-10T22:00:00.000Z', totalWorkedHours: 4, revenue: 168 })
  ];
  const dossier = buildEmployeeDossier('e1', sessions, new Date('2026-08-10T23:00:00.000Z'));
  assert.equal(dossier.totals.daysWorked, 1);
  assert.equal(dossier.totals.sessions, 2);
  assert.equal(dossier.today?.hours, 8);
  assert.equal(dossier.today?.sessions, 2);
  assert.equal(dossier.projects[0].days, 1, 'la journée ne compte qu’une fois par chantier');
});

test('la journée en cours et le pointage actif sont repérés', () => {
  const sessions = [
    punch({ id: 'a', startTime: '2026-08-10T12:00:00.000Z', endTime: null, totalWorkedHours: undefined, totalPauseMinutes: 0, revenue: 0 })
  ];
  const dossier = buildEmployeeDossier('e1', sessions, new Date('2026-08-10T17:30:00.000Z'));
  assert.ok(dossier.today, 'la journée du jour doit exister');
  assert.equal(dossier.today?.inProgress, true);
  assert.equal(dossier.today?.hours, 5.5);
  assert.equal(dossier.activeSession?.id, 'a');
});

test('les chantiers sont classés par heures décroissantes', () => {
  const sessions = [
    punch({ id: 'a', projectId: 'c1', projectName: 'Petit', totalWorkedHours: 3, revenue: 100 }),
    punch({ id: 'b', projectId: 'c2', projectName: 'Gros', startTime: '2026-08-09T13:00:00.000Z', endTime: '2026-08-09T23:00:00.000Z', totalWorkedHours: 10, revenue: 400 })
  ];
  const dossier = buildEmployeeDossier('e1', sessions, new Date('2026-08-10T18:00:00.000Z'));
  assert.equal(dossier.projects[0].projectName, 'Gros');
  assert.equal(dossier.projects[0].hours, 10);
  assert.equal(dossier.projects[1].projectName, 'Petit');
});

test('un employé sans aucun pointage donne un dossier vide mais valide', () => {
  const dossier = buildEmployeeDossier('e1', [], new Date('2026-08-10T18:00:00.000Z'));
  assert.equal(dossier.totals.hours, 0);
  assert.equal(dossier.years.length, 0);
  assert.equal(dossier.today, null);
  assert.equal(dossier.activeSession, null);
  assert.equal(dossier.firstDay, null);
});

test('seuls les versements payés comptent dans le total versé', () => {
  const payments = [
    { id: '1', employeeId: 'e1', employeeName: 'Léa', period: '2026-07', amount: 1000, status: 'paid', date: '2026-07-31' },
    { id: '2', employeeId: 'e1', employeeName: 'Léa', period: '2026-08', amount: 900, status: 'draft', date: '2026-08-15' },
    { id: '3', employeeId: 'e2', employeeName: 'Marc', period: '2026-07', amount: 5000, status: 'paid', date: '2026-07-31' }
  ] as PayrollPayment[];
  assert.equal(employeePaidTotal('e1', payments), 1000);
  assert.equal(employeePayrollHistory('e1', payments).length, 2);
  assert.equal(employeePayrollHistory('e1', payments)[0].period, '2026-08', 'le plus récent en premier');
});

test('le dossier ne laisse jamais passer le NIP ni le numéro d’assurance sociale', () => {
  const employee = {
    id: 'e1', name: 'Léa Tremblay', nip: '4821', sin: '046 454 286', asNumber: 'CCQ-99887',
    gstNumber: '12345 6789 RT0001', role: 'employee', hourlyRate: 42, workerType: 'Compagnon',
    phone: '780-555-0134', address: '12 rue Principale', hireDate: '2023-04-01', avatar: '',
    level: 3, xp: 1200, email: 'lea@example.com'
  } as Employee;

  const identity = dossierIdentity(employee);
  const serialized = JSON.stringify(identity);

  for (const forbidden of DOSSIER_FORBIDDEN_FIELDS) {
    assert.ok(!(forbidden in identity), `${forbidden} ne doit pas figurer dans le dossier`);
  }
  assert.ok(!serialized.includes('4821'), 'le NIP ne doit apparaître sous aucune forme');
  assert.ok(!serialized.includes('046 454 286'), 'le NAS ne doit apparaître sous aucune forme');
  assert.equal(identity.name, 'Léa Tremblay');
  assert.equal(identity.hourlyRate, 42);
});

test('la clé de journée suit le fuseau de l’appareil', () => {
  const key = localDayKey(new Date(2026, 7, 10, 23, 30));
  assert.equal(key, '2026-08-10');
  assert.equal(localDayKey('pas une date'), '');
});

// ---------------------------------------------------------------------------
// Accord avec le reste de l'application
// ---------------------------------------------------------------------------
// Les heures d'un quart de nuit sont réparties de part et d'autre de minuit
// depuis la refonte des heures. Le dossier doit donner exactement le même
// résultat que le tableau de bord, sinon on rouvre l'incohérence qu'on venait
// de fermer : deux écrans, deux totaux, pour la même journée.

test('un quart de nuit est réparti sur les deux journées, comme ailleurs dans l’application', () => {
  setAppTimeZone('America/Edmonton');
  try {
    // 22 h le 10 août à Edmonton (UTC−6) → 04:00Z le 11 ; fin à 02 h le 11 local.
    const session = punch({
      id: 'nuit',
      startTime: '2026-08-11T04:00:00.000Z',
      endTime: '2026-08-11T08:00:00.000Z',
      totalWorkedHours: undefined,
      totalPauseMinutes: 0,
      revenue: 400
    });
    const now = new Date('2026-08-11T18:00:00.000Z');
    const dossier = buildEmployeeDossier('e1', [session], now);

    const veille = dossier.years[0].months[0];
    assert.equal(dossier.totals.hours, 4, 'le total reste de quatre heures');
    assert.equal(dossier.totals.daysWorked, 2, 'la nuit touche deux journées civiles');
    assert.ok(veille, 'le mois doit exister');

    // Le découpage partagé fait foi : le dossier ne recalcule rien de son côté.
    const parJour = new Map(splitPunchByLocalDay(session, undefined, now).map(s => [s.dayKey, s.hours]));
    for (const [dayKey, heures] of parJour) {
      const jour = dossier.years
        .flatMap(year => year.months)
        .find(month => month.month === dayKey.slice(0, 7));
      assert.ok(jour, `le mois de ${dayKey} doit figurer au dossier`);
    }
    assert.equal([...parJour.values()].reduce((a, b) => a + b, 0).toFixed(2), '4.00');

    // Le montant suit les heures, et rien ne se perd en route.
    assert.equal(dossier.totals.revenue, 400);
    // Le pointage ne compte qu'une fois, à la journée où le travailleur est arrivé.
    assert.equal(dossier.totals.sessions, 1);
  } finally {
    setAppTimeZone(null);
  }
});

test('le fuseau configuré pour la compagnie décide de la journée, pas celui du serveur', () => {
  const session = punch({
    id: 'soir',
    startTime: '2026-08-11T02:00:00.000Z',  // 10 août 20 h à Edmonton
    endTime: '2026-08-11T04:00:00.000Z',    // 10 août 22 h à Edmonton
    totalWorkedHours: 2,
    revenue: 84
  });

  setAppTimeZone('America/Edmonton');
  try {
    const dossier = buildEmployeeDossier('e1', [session], new Date('2026-08-11T18:00:00.000Z'));
    assert.equal(dossier.firstDay, '2026-08-10', 'à Edmonton, ce quart appartient au 10 août');
  } finally {
    setAppTimeZone(null);
  }

  setAppTimeZone('UTC');
  try {
    const dossier = buildEmployeeDossier('e1', [session], new Date('2026-08-11T18:00:00.000Z'));
    assert.equal(dossier.firstDay, '2026-08-11', 'en UTC, le même quart bascule au 11');
  } finally {
    setAppTimeZone(null);
  }
});
