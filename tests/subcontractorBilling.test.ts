import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePayBasis, resolveRate, priceProduction,
  formatHours, projectPerformance,
  type PayRateRow, type CatalogRate
} from '../src/subcontractorBilling';

const PROJECT = 'proj-1';
const WORKER = 'user-1';
const OTHER = 'user-2';

const rates: PayRateRow[] = [
  { id: 'r1', projectId: PROJECT, userId: WORKER, catalogItemId: null, label: 'Vinyle standard', unit: 'pi2', rate: 2.25 },
  { id: 'r2', projectId: PROJECT, userId: null, catalogItemId: null, label: 'Vinyle standard', unit: 'pi2', rate: 1.75 },
  { id: 'r3', projectId: PROJECT, userId: null, catalogItemId: null, label: 'Papier Tyvek', unit: 'pi2', rate: 0.25 }
];

const catalog: CatalogRate[] = [
  { id: 'c1', name: 'Hardie Plank (fibre de ciment)', unit: 'pi2', pricePerSqft: 2.5 },
  { id: 'c2', name: 'Coin extérieur', unit: 'unite', pricePerSqft: null }
];

test('les deux vocabulaires de la base donnent le meme mode', () => {
  assert.equal(normalizePayBasis('horaire'), 'hourly');
  assert.equal(normalizePayBasis('hourly'), 'hourly');
  assert.equal(normalizePayBasis('forfait'), 'flat');
  assert.equal(normalizePayBasis('SQFT'), 'piece');
  assert.equal(normalizePayBasis(''), null);
  assert.equal(normalizePayBasis(undefined), null);
});

test('une entente nominative bat le taux par defaut du projet', () => {
  const r = resolveRate(PROJECT, WORKER, 'Vinyle standard', rates, catalog);
  assert.equal(r?.rate, 2.25);
  assert.equal(r?.source, 'assignment');
});

test('sans entente nominative, le taux du projet sapplique', () => {
  const r = resolveRate(PROJECT, OTHER, 'Vinyle standard', rates, catalog);
  assert.equal(r?.rate, 1.75);
  assert.equal(r?.source, 'project_default');
});

test('le catalogue sert de dernier recours', () => {
  const r = resolveRate(PROJECT, WORKER, 'Hardie Plank (fibre de ciment)', rates, catalog);
  assert.equal(r?.rate, 2.5);
  assert.equal(r?.source, 'catalog');
});

test('un poste sans taux vaut null, jamais zero', () => {
  assert.equal(resolveRate(PROJECT, WORKER, 'Soffite aluminium', rates, catalog), null);
  // Article au catalogue mais sans taux de pose : ce n'est pas un taux de 0.
  assert.equal(resolveRate(PROJECT, WORKER, 'Coin extérieur', rates, catalog), null);
});

test('un poste sans taux bloque la facture au lieu de la chiffrer a zero', () => {
  const result = priceProduction(
    [{ projectId: PROJECT, userId: WORKER, label: 'Soffite aluminium', quantity: 400 }],
    rates, catalog
  );
  assert.equal(result.priced.length, 0);
  assert.equal(result.total, 0);
  assert.deepEqual(result.problems, [{ label: 'Soffite aluminium', quantity: 400, reason: 'no_rate' }]);
});

test('le taux fige a la saisie resiste a un changement de grille', () => {
  const result = priceProduction(
    [{ projectId: PROJECT, userId: WORKER, label: 'Vinyle standard', quantity: 100, unitPrice: 2.0, unit: 'pi2' }],
    rates, catalog
  );
  assert.equal(result.priced[0].unitPrice, 2.0);
  assert.equal(result.priced[0].source, 'snapshot');
  assert.equal(result.total, 200);
});

test('les quantites nulles ou negatives sont refusees', () => {
  const result = priceProduction([
    { projectId: PROJECT, userId: WORKER, label: 'Vinyle standard', quantity: 0 },
    { projectId: PROJECT, userId: WORKER, label: 'Vinyle standard', quantity: -50 }
  ], rates, catalog);
  assert.equal(result.priced.length, 0);
  assert.equal(result.problems.length, 2);
  assert.ok(result.problems.every(p => p.reason === 'invalid_quantity'));
});

test('un chantier complet se totalise au cent pres', () => {
  const result = priceProduction([
    { projectId: PROJECT, userId: WORKER, label: 'Vinyle standard', quantity: 1240 },
    { projectId: PROJECT, userId: WORKER, label: 'Papier Tyvek', quantity: 1240 }
  ], rates, catalog);
  assert.equal(result.problems.length, 0);
  assert.equal(result.total, 2790 + 310);
});

test('les heures decimales saffichent en minutes reelles', () => {
  assert.equal(formatHours(6.32), '6 h 19');
  assert.equal(formatHours(8), '8 h 00');
  assert.equal(formatHours(0.5), '0 h 30');
  assert.equal(formatHours(-1), '—');
});

test('le rendement se calcule sans que les heures payent', () => {
  const pricing = priceProduction(
    [{ projectId: PROJECT, userId: WORKER, label: 'Vinyle standard', quantity: 1240 }],
    rates, catalog
  );
  const perf = projectPerformance(40, pricing);
  assert.equal(perf.labourCost, 2790);
  assert.equal(perf.totalQuantity, 1240);
  assert.equal(perf.quantityPerHour, 31);
  assert.equal(perf.effectiveHourlyRate, 69.75);
});

test('un chantier sans heure pointee a un rendement inconnu, pas nul', () => {
  const pricing = priceProduction(
    [{ projectId: PROJECT, userId: WORKER, label: 'Vinyle standard', quantity: 500 }],
    rates, catalog
  );
  const perf = projectPerformance(0, pricing);
  assert.equal(perf.quantityPerHour, null);
  assert.equal(perf.effectiveHourlyRate, null);
  assert.equal(perf.labourCost, 1125);
});
