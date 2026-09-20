import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import { checkProjectClosure } from '../src/invoiceCompliance';
import { TABLES_WITH_COMPANY_ID, TABLE_ID_COLUMN } from '../db';
import type { Invoice, Project, PunchSession } from '../src/types';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// Une fin de quart absente vaut une fin de quart ouverte
// ---------------------------------------------------------------------------
// Huit endroits comparaient strictement à null pendant que cinq autres
// testaient simplement la valeur. Un pointage restauré depuis une sauvegarde où
// la clé « endTime » n'existe pas passait donc pour terminé : l'employé pouvait
// en ouvrir un second par-dessus, le chantier se fermait sous ses pieds, et ses
// heures étaient comptées deux fois.

const chantier: Project = {
  id: 'c1', name: '335 Grégoire', clientName: 'Client', address: '',
  latitude: 0, longitude: 0, radius: 100, assignedEmployees: [], status: 'active', tasks: []
};

const pointage = (surcharge: Partial<PunchSession>): PunchSession => ({
  id: 'p1', employeeId: 'e1', employeeName: 'Léa', projectId: 'c1', projectName: '335 Grégoire',
  payMode: 'horaire', rate: 40, startTime: '2026-09-20T13:00:00Z', endTime: null,
  pausedAt: null, totalPauseMinutes: 0, withinGeofence: true, revenue: 0,
  ...surcharge
});

test('un pointage sans fin bloque la fermeture du chantier, null ou absent', () => {
  for (const [nom, session] of [
    ['fin à null', pointage({ endTime: null })],
    ['clé absente', { ...pointage({}), endTime: undefined } as unknown as PunchSession],
    ['fin vide', pointage({ endTime: '' })]
  ] as const) {
    const verdict = checkProjectClosure(chantier, [session], []);
    assert.equal(verdict.ready, false, nom);
    assert.equal(verdict.openPunches.length, 1, nom);
  }
});

test('un pointage terminé ne bloque rien', () => {
  const verdict = checkProjectClosure(chantier, [pointage({ endTime: '2026-09-20T21:00:00Z' })], []);
  assert.equal(verdict.ready, true);
  assert.equal(verdict.openPunches.length, 0);
});

test('plus aucun endroit ne compare strictement la fin à null', () => {
  // La cohérence est le fond du problème : la moitié du code disait une chose,
  // l'autre moitié le contraire.
  for (const fichier of ['src/store.ts', 'src/App.tsx', 'src/invoiceCompliance.ts',
                         'src/employeeDossier.ts', 'src/components/MotivationTab.tsx']) {
    assert.ok(!read(fichier).includes('endTime === null'), fichier);
  }
});

// ---------------------------------------------------------------------------
// Le garde des anciens identifiants ne doit plus dériver
// ---------------------------------------------------------------------------
// Sa liste de tables était recopiée à la main. Neuf tables ajoutées depuis n'y
// figuraient plus, et pour elles le garde ne faisait rien.

test('le garde couvre toutes les tables exposées par l’API', () => {
  const source = read('legacyIdGuard.ts');
  assert.match(source, /TABLES_WITH_UUID_ID = new Set\(\s*\['companies', \.\.\.TABLES_WITH_COMPANY_ID\]/,
    'la liste doit être déduite, jamais recopiée');
  assert.match(source, /TABLE_ID_COLUMN\[table\] \|\| 'id'\) === 'id'/,
    'les tables dont la clé n’est pas « id » doivent s’exclure d’elles-mêmes');
});

test('les tables ajoutées depuis sont bien couvertes maintenant', () => {
  const couvertes = new Set(
    ['companies', ...TABLES_WITH_COMPANY_ID].filter(t => (TABLE_ID_COLUMN[t] || 'id') === 'id')
  );
  for (const table of ['tool_assets', 'tool_theft_reports', 'project_photos', 'change_orders',
                       'insurance_claims', 'leads', 'shift_assignments', 'safety_records']) {
    assert.ok(couvertes.has(table), `${table} doit être couverte`);
  }
  // weekly_goals a « employee_id » pour clé primaire : lui fabriquer un « id »
  // ne servirait à rien.
  assert.ok(!couvertes.has('weekly_goals'));
});

test('les colonnes de référence ajoutées depuis sont nettoyées', () => {
  const source = read('legacyIdGuard.ts');
  for (const champ of ['assigned_user_id', 'assigned_employee_id', 'catalog_item_id',
                       'payroll_entry_id', 'approved_by', 'created_by', 'taken_by',
                       'submitted_by', 'converted_client_id', 'converted_project_id']) {
    assert.ok(source.includes(`'${champ}'`), `${champ} doit être nettoyé`);
  }
});

test('expenses.project_id reste épargné', () => {
  // C'est la seule de ces colonnes qui est du texte en base, pas un uuid : la
  // nettoyer effacerait une référence parfaitement valide.
  assert.match(read('legacyIdGuard.ts'), /table === 'expenses' && field === 'project_id'/);
});

// ---------------------------------------------------------------------------
// Importer une date depuis un autre logiciel
// ---------------------------------------------------------------------------

test('une date importée est lue dans le fuseau de l’entreprise', () => {
  // « 15/03/2026 » est interprété à minuit LOCAL. Le convertir en UTC reculait
  // la date d'un jour pour tout client à l'est de Greenwich : une facture
  // importée changeait de date, et pouvait basculer d'un exercice à l'autre.
  const source = read('src/dataMigration.ts');
  assert.match(source, /return localDayKey\(parsed\);/);
  assert.ok(!source.includes("parsed.toISOString().slice(0, 10)"),
    'plus de conversion UTC pour une journée civile');
});
