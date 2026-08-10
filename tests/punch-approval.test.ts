import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { PunchSession } from '../src/types';
import { recomputePunchTotals } from '../src/punchHours';

function punch(overrides: Partial<PunchSession> = {}): PunchSession {
  return {
    id: 'p1', employeeId: 'e1', employeeName: 'Mathieu',
    projectId: 'c1', projectName: 'Chantier', payMode: 'horaire', rate: 40,
    startTime: '2026-07-22T08:00:00-06:00', endTime: '2026-07-22T16:00:00-06:00',
    pausedAt: null, totalPauseMinutes: 0, withinGeofence: true, revenue: 0,
    ...overrides
  };
}

test('les totaux se recalculent à partir des heures corrigées', () => {
  const totals = recomputePunchTotals(punch());
  assert.equal(totals.totalWorkedHours, 8);
  assert.equal(totals.revenue, 320, '8 h × 40 $');
});

test('la pause est retirée des heures payées', () => {
  const totals = recomputePunchTotals(punch({ totalPauseMinutes: 30 }));
  assert.equal(totals.totalWorkedHours, 7.5);
  assert.equal(totals.revenue, 300);
});

test('corriger un oubli de punch out ramène le montant au bon niveau', () => {
  // L'employé a oublié de fermer : 14 h enregistrées au lieu de 8 h.
  const oubli = punch({ endTime: '2026-07-22T22:00:00-06:00' });
  assert.equal(recomputePunchTotals(oubli).totalWorkedHours, 14);
  assert.equal(recomputePunchTotals(oubli).revenue, 560);

  // Le bureau corrige l'heure de fin.
  const corrige = { ...oubli, endTime: '2026-07-22T16:00:00-06:00' };
  assert.equal(recomputePunchTotals(corrige).totalWorkedHours, 8);
  assert.equal(recomputePunchTotals(corrige).revenue, 320);
});

test('le forfait ne dépend pas des heures', () => {
  const forfait = punch({ payMode: 'forfait', rate: 1200 });
  assert.equal(recomputePunchTotals(forfait).revenue, 1200);
  const plusLong = { ...forfait, endTime: '2026-07-22T20:00:00-06:00' };
  assert.equal(recomputePunchTotals(plusLong).revenue, 1200, 'le forfait reste le forfait');
});

test('le mode surface facture les matériaux déclarés', () => {
  const surface = punch({
    payMode: 'surface',
    surfaceMaterials: [
      { name: 'Bardeaux', quantity: 30, unitPrice: 4.5, emoji: '🪵' },
      { name: 'Membrane', quantity: 2, unitPrice: 60, emoji: '📦' }
    ]
  });
  assert.equal(recomputePunchTotals(surface).revenue, 255, '30×4,50 + 2×60');
});

test('un pointage encore ouvert ne produit aucun total', () => {
  assert.deepEqual(recomputePunchTotals(punch({ endTime: null })), { totalWorkedHours: 0, revenue: 0 });
});

test('des heures incohérentes ne produisent jamais de montant négatif', () => {
  const inverse = punch({ startTime: '2026-07-22T16:00:00-06:00', endTime: '2026-07-22T08:00:00-06:00' });
  const totals = recomputePunchTotals(inverse);
  assert.equal(totals.totalWorkedHours, 0);
  assert.equal(totals.revenue, 0);

  const pauseAbsurde = recomputePunchTotals(punch({ totalPauseMinutes: 10000 }));
  assert.equal(pauseAbsurde.totalWorkedHours, 0);
});

test('le store n’a plus qu’une seule formule de montant', () => {
  // Garde-fou anti-régression : l'arrêt du pointage et la correction
  // administrative doivent tous deux passer par `recomputePunchTotals`. Si
  // l'un rouvrait son propre calcul, corriger une minute changerait le montant
  // pour une autre raison que la minute corrigée.
  const source = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8');
  assert.match(source, /recomputePunchTotals\(closed\)/, 'l’arrêt passe par la formule commune');
  assert.match(source, /recomputePunchTotals\(draft\)/, 'la correction passe par la formule commune');
  assert.doesNotMatch(source, /payMode === 'horaire'/,
    'plus aucun calcul de montant dupliqué dans le store');
});
