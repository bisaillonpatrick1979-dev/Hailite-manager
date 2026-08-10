import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CompanyInfo, Employee, PunchSession } from '../src/types';
import {
  roundHours, resolveOvertimeRules, computeHoursBreakdown, grossFromBreakdown,
  DEFAULT_OVERTIME_RULES
} from '../src/overtime';

const EDMONTON = 'America/Edmonton';

function quart(jour: string, debut: string, fin: string, id = jour + debut): PunchSession {
  return {
    id, employeeId: 'e1', employeeName: 'Mathieu',
    projectId: 'c1', projectName: 'Chantier', payMode: 'horaire', rate: 40,
    startTime: `${jour}T${debut}:00-06:00`, endTime: `${jour}T${fin}:00-06:00`,
    pausedAt: null, totalPauseMinutes: 0, withinGeofence: true, revenue: 0
  };
}

// ---------------------------------------------------------------------------
// Arrondi au quart d'heure
// ---------------------------------------------------------------------------
test('l’arrondi se fait au quart d’heure le plus proche', () => {
  assert.equal(roundHours(8.1, 15), 8);        // 6 min → 0
  assert.equal(roundHours(8.13, 15), 8.25);    // 8 min → 15
  assert.equal(roundHours(7.87, 15), 7.75);
  assert.equal(roundHours(8, 15), 8);
});

test('un arrondi à zéro laisse les heures intactes', () => {
  assert.equal(roundHours(7.9333, 0), 7.9333);
});

test('des heures nulles ou absurdes ne cassent pas l’arrondi', () => {
  assert.equal(roundHours(0, 15), 0);
  assert.equal(roundHours(-3, 15), 0);
  assert.equal(roundHours(Number.NaN, 15), 0);
});

// ---------------------------------------------------------------------------
// Résolution des règles : compagnie puis surcharge employé
// ---------------------------------------------------------------------------
test('sans réglage, la règle albertaine par défaut s’applique', () => {
  const regles = resolveOvertimeRules({} as CompanyInfo);
  assert.deepEqual(regles, DEFAULT_OVERTIME_RULES);
});

test('les réglages de la compagnie remplacent les valeurs par défaut', () => {
  const regles = resolveOvertimeRules({
    overtimeDailyHours: 10, overtimeWeeklyHours: 50,
    overtimeMultiplier: 2, hourRoundingMinutes: 30
  } as CompanyInfo);
  assert.equal(regles.dailyThreshold, 10);
  assert.equal(regles.weeklyThreshold, 50);
  assert.equal(regles.multiplier, 2);
  assert.equal(regles.roundingMinutes, 30);
});

test('un arrondi réglé à zéro est respecté, pas remplacé par le défaut', () => {
  const regles = resolveOvertimeRules({ hourRoundingMinutes: 0 } as CompanyInfo);
  assert.equal(regles.roundingMinutes, 0, '0 est un choix volontaire : aucun arrondi');
});

test('la fiche de l’employé surcharge la compagnie', () => {
  const regles = resolveOvertimeRules(
    { overtimeDailyHours: 8, overtimeMultiplier: 1.5 } as CompanyInfo,
    { overtimeDailyHoursOverride: 10, overtimeMultiplierOverride: 2 } as Employee
  );
  assert.equal(regles.dailyThreshold, 10);
  assert.equal(regles.multiplier, 2);
  assert.equal(regles.weeklyThreshold, 44, 'les champs non surchargés restent ceux de la compagnie');
});

// ---------------------------------------------------------------------------
// Répartition régulier / supplémentaire
// ---------------------------------------------------------------------------
const REGLES = DEFAULT_OVERTIME_RULES;

test('une semaine normale ne produit aucune heure supplémentaire', () => {
  // 2026-07-20 est un lundi. Cinq jours de 8 h = 40 h.
  const punches = ['20', '21', '22', '23', '24']
    .map(jour => quart(`2026-07-${jour}`, '08:00', '16:00'));
  const r = computeHoursBreakdown(punches, REGLES, '2026-07', EDMONTON);
  assert.equal(r.totalHours, 40);
  assert.equal(r.overtimeHours, 0);
  assert.equal(r.regularHours, 40);
});

test('une longue journée déclenche le seuil quotidien', () => {
  const punches = [quart('2026-07-20', '07:00', '19:00')]; // 12 h
  const r = computeHoursBreakdown(punches, REGLES, '2026-07', EDMONTON);
  assert.equal(r.totalHours, 12);
  assert.equal(r.overtimeHours, 4, '12 h − 8 h');
  assert.equal(r.regularHours, 8);
});

test('le seuil hebdomadaire s’applique même sans longue journée', () => {
  // Six jours de 8 h = 48 h : aucun dépassement quotidien, mais 4 h au-delà de 44.
  const punches = ['20', '21', '22', '23', '24', '25']
    .map(jour => quart(`2026-07-${jour}`, '08:00', '16:00'));
  const r = computeHoursBreakdown(punches, REGLES, '2026-07', EDMONTON);
  assert.equal(r.totalHours, 48);
  assert.equal(r.overtimeHours, 4, '48 h − 44 h');
});

test('on retient le plus grand des deux seuils, jamais leur somme', () => {
  // Cinq jours de 10 h = 50 h.
  // Dépassements quotidiens : 5 × 2 h = 10 h. Dépassement hebdo : 50 − 44 = 6 h.
  // La bonne réponse est 10 h, pas 16 h.
  const punches = ['20', '21', '22', '23', '24']
    .map(jour => quart(`2026-07-${jour}`, '07:00', '17:00'));
  const r = computeHoursBreakdown(punches, REGLES, '2026-07', EDMONTON);
  assert.equal(r.totalHours, 50);
  assert.equal(r.overtimeHours, 10);
  assert.equal(r.regularHours, 40);
});

test('les semaines sont séparées : une semaine chargée ne contamine pas l’autre', () => {
  const semaine1 = ['20', '21', '22', '23', '24'].map(j => quart(`2026-07-${j}`, '07:00', '17:00')); // 50 h
  const semaine2 = ['27', '28'].map(j => quart(`2026-07-${j}`, '08:00', '16:00'));                   // 16 h
  const r = computeHoursBreakdown([...semaine1, ...semaine2], REGLES, '2026-07', EDMONTON);
  assert.equal(r.totalHours, 66);
  assert.equal(r.overtimeHours, 10, 'seule la première semaine dépasse');
});

test('un employé exempté ne génère jamais d’heures supplémentaires', () => {
  const punches = [quart('2026-07-20', '06:00', '20:00')]; // 14 h
  const r = computeHoursBreakdown(punches, { ...REGLES, exempt: true }, '2026-07', EDMONTON);
  assert.equal(r.totalHours, 14);
  assert.equal(r.overtimeHours, 0);
  assert.equal(r.regularHours, 14);
});

test('l’arrondi porte sur la journée entière, pas sur chaque pointage', () => {
  // Trois allers-retours de 2 h 05 dans la même journée = 6 h 15 exactement.
  // Arrondir chaque pointage donnerait 3 × 2 h = 6 h ; on veut 6,25 h.
  const punches = [
    quart('2026-07-20', '08:00', '10:05', 'a'),
    quart('2026-07-20', '10:30', '12:35', 'b'),
    quart('2026-07-20', '13:00', '15:05', 'c')
  ];
  const r = computeHoursBreakdown(punches, REGLES, '2026-07', EDMONTON);
  assert.equal(r.totalHours, 6.25);
});

test('un quart de nuit compte sur les deux journées qu’il touche', () => {
  const nuit: PunchSession = {
    ...quart('2026-07-20', '22:00', '23:00'),
    endTime: '2026-07-21T02:00:00-06:00'
  };
  const r = computeHoursBreakdown([nuit], REGLES, '2026-07', EDMONTON);
  assert.equal(r.totalHours, 4);
  assert.deepEqual(r.byDay.map(d => d.dayKey), ['2026-07-20', '2026-07-21']);
});

test('les pointages encore ouverts sont ignorés', () => {
  const ouvert: PunchSession = { ...quart('2026-07-20', '08:00', '16:00'), endTime: null };
  const r = computeHoursBreakdown([ouvert], REGLES, '2026-07', EDMONTON);
  assert.equal(r.totalHours, 0);
});

// ---------------------------------------------------------------------------
// Salaire brut
// ---------------------------------------------------------------------------
test('le brut applique le multiplicateur aux seules heures supplémentaires', () => {
  const r = computeHoursBreakdown(
    [quart('2026-07-20', '07:00', '19:00')], REGLES, '2026-07', EDMONTON);
  // 8 h × 40 $ + 4 h × 40 $ × 1,5 = 320 + 240 = 560 $
  assert.equal(grossFromBreakdown(r, 40, 1.5), 560);
});

test('sans heures supplémentaires, le brut reste le taux simple', () => {
  const r = computeHoursBreakdown(
    [quart('2026-07-20', '08:00', '16:00')], REGLES, '2026-07', EDMONTON);
  assert.equal(grossFromBreakdown(r, 40, 1.5), 320);
});
