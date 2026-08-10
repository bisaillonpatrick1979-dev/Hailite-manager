import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CompanyInfo, Employee } from '../src/types';
import { calculateDetailedPayroll, periodsPerYear, progressiveTax, type PayrollContext } from '../src/payroll';
import { getRegionsForMarket } from '../src/internationalRegions';
import { getRegionPayrollMeta } from '../src/regionsData';
import { computeHoursBreakdown, DEFAULT_OVERTIME_RULES } from '../src/overtime';
import type { PunchSession } from '../src/types';

const alberta = getRegionsForMarket('CA').find(r => r.code === 'AB');
if (!alberta) throw new Error('Région AB introuvable');

const CONTEXTE: PayrollContext = {
  country: 'CA',
  region: alberta,
  payrollMeta: getRegionPayrollMeta(alberta, 'CA')
};

const salarie = (o: Partial<Employee> = {}): Employee => ({
  id: 'e1', name: 'Mathieu', nip: '', role: 'employee', hourlyRate: 40,
  workerType: 'salaried', asNumber: '', phone: '', address: '', hireDate: '2024-01-01',
  avatar: '', level: 1, xp: 0, payFrequency: 'weekly', ...o
});

const compagnie = (o: Partial<CompanyInfo> = {}): CompanyInfo =>
  ({ name: 'Hailite', country: 'CA', region: 'AB', ...o } as CompanyInfo);

test('les périodes de paie suivent la fréquence choisie', () => {
  assert.equal(periodsPerYear('weekly'), 52);
  assert.equal(periodsPerYear('biweekly'), 26);
  assert.equal(periodsPerYear('semi-monthly'), 24);
  assert.equal(periodsPerYear('monthly'), 12);
  assert.equal(periodsPerYear(undefined), 52, 'hebdomadaire par défaut');
});

test('le brut d’un salarié vient des heures et du taux', () => {
  const paie = calculateDetailedPayroll(salarie(), compagnie(), 40, CONTEXTE);
  assert.equal(paie.gross, 1600, '40 h × 40 $');
});

test('les heures supplémentaires sont majorées dans le brut', () => {
  const quart = (jour: string): PunchSession => ({
    id: jour, employeeId: 'e1', employeeName: 'Mathieu', projectId: 'c1', projectName: 'Chantier',
    payMode: 'horaire', rate: 40,
    startTime: `2026-07-${jour}T07:00:00-06:00`, endTime: `2026-07-${jour}T17:00:00-06:00`,
    pausedAt: null, totalPauseMinutes: 0, withinGeofence: true, revenue: 0
  });
  const semaine = ['20', '21', '22', '23', '24'].map(quart);
  const rep = computeHoursBreakdown(semaine, DEFAULT_OVERTIME_RULES, '2026-07', 'America/Edmonton');
  const paie = calculateDetailedPayroll(salarie(), compagnie(), rep, CONTEXTE);
  // 40 h × 40 $ + 10 h × 40 $ × 1,5
  assert.equal(paie.gross, 2200);
});

test('un salaire annuel fixe remplace le calcul horaire', () => {
  const paie = calculateDetailedPayroll(
    salarie({ annualSalary: 78000, payFrequency: 'biweekly' }), compagnie(), 40, CONTEXTE);
  assert.equal(paie.gross, 3000, '78 000 $ / 26 périodes');
});

test('l’indemnité de vacances suit la compagnie, puis la surcharge de l’employé', () => {
  const base = calculateDetailedPayroll(salarie(), compagnie({ payrollVacationRate: 6 }), 40, CONTEXTE);
  assert.equal(Number(base.vacationAmount.toFixed(2)), 96, '6 % de 1 600 $');
  const surcharge = calculateDetailedPayroll(
    salarie({ vacationRateOverride: 10 }), compagnie({ payrollVacationRate: 6 }), 40, CONTEXTE);
  assert.equal(Number(surcharge.vacationAmount.toFixed(2)), 160, '10 % l’emporte');
});

test('un sous-traitant n’a aucune retenue à la source', () => {
  const paie = calculateDetailedPayroll(
    salarie({ workerType: 'contractor' }), compagnie(), 40, CONTEXTE);
  assert.equal(paie.cpp, 0);
  assert.equal(paie.ei, 0);
  assert.equal(paie.fedTax, 0);
  assert.equal(paie.totalDeductions, 0);
  assert.equal(paie.net, paie.gross, 'sans numéro de TPS, aucune taxe ajoutée');
});

test('un sous-traitant inscrit facture les taxes de vente de sa région', () => {
  const paie = calculateDetailedPayroll(
    salarie({ workerType: 'contractor', gstNumber: '123456789RT0001' }), compagnie(), 40, CONTEXTE);
  assert.ok(paie.gst > 0, 'la TPS albertaine s’ajoute');
  assert.equal(Number(paie.net.toFixed(2)), Number((paie.gross + paie.totalTaxes).toFixed(2)));
});

test('les retenues d’un salarié restent inférieures à son brut', () => {
  const paie = calculateDetailedPayroll(salarie(), compagnie(), 40, CONTEXTE);
  assert.ok(paie.cpp > 0 && paie.ei > 0, 'RRQ et AE prélevées');
  assert.ok(paie.totalDeductions < paie.gross, 'les retenues ne dépassent pas le brut');
  assert.ok(paie.net > 0);
});

test('le net ne devient jamais négatif', () => {
  // Des retenues fixes énormes sur une petite paie : le net est borné à zéro
  // plutôt que d'afficher un montant négatif.
  const paie = calculateDetailedPayroll(
    salarie({ hourlyRate: 15 }),
    compagnie({ payrollHealthInsurance: 500, payrollDentalInsurance: 500, payrollLTD: 500 }),
    4, CONTEXTE);
  assert.equal(paie.net, 0);
});

test('hors Canada, l’impôt progressif n’est pas inventé', () => {
  const contexteUS: PayrollContext = { ...CONTEXTE, country: 'US' };
  assert.equal(progressiveTax(80000, true, contexteUS), 0);
  assert.equal(progressiveTax(80000, false, contexteUS), 0);
});

test('l’impôt progressif canadien augmente avec le revenu', () => {
  const bas = progressiveTax(40000, true, CONTEXTE);
  const haut = progressiveTax(150000, true, CONTEXTE);
  assert.ok(bas > 0 && haut > bas, 'le barème doit être progressif');
});

test('les cotisations plafonnent : doubler un haut salaire ne double pas la RRQ', () => {
  const a = calculateDetailedPayroll(
    salarie({ annualSalary: 90000, payFrequency: 'monthly' }), compagnie(), 0, CONTEXTE);
  const b = calculateDetailedPayroll(
    salarie({ annualSalary: 180000, payFrequency: 'monthly' }), compagnie(), 0, CONTEXTE);
  assert.equal(Number(a.cpp.toFixed(2)), Number(b.cpp.toFixed(2)), 'RRQ identique au-delà du plafond');
  assert.equal(Number(a.ei.toFixed(2)), Number(b.ei.toFixed(2)), 'AE identique au-delà du plafond');
});

test('un employé sans heures ne produit aucun brut', () => {
  const paie = calculateDetailedPayroll(salarie(), compagnie(), 0, CONTEXTE);
  assert.equal(paie.gross, 0);
  assert.equal(paie.vacationAmount, 0);
});
