// ---------------------------------------------------------------------------
// Portail d'un employé — accessible d'un doigt, et sans secret qui s'échappe
// ---------------------------------------------------------------------------
// Le tableau de bord montrait l'équipe en direct sans jamais permettre de
// s'arrêter sur une personne. On touche maintenant son nom dans une liste et
// son dossier s'ouvre : journée en cours, mois, année, années passées,
// chantiers, versements de paie, cartes de compétence.
//
// Deux garanties à tenir dans la durée :
//   — le dossier reste réservé à l'administration ;
//   — le NIP et le numéro d'assurance sociale n'y apparaissent jamais, et
//     l'affichage ne lit que les champs explicitement autorisés.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const app = read('src/App.tsx');
const dossier = read('src/components/EmployeeDossier.tsx');
const model = read('src/employeeDossier.ts');

// 1. Les deux listes d'employés de l'accueil ouvrent le dossier.
const openings = (app.match(/setDossierEmployeeId\((?:p|punch)\.employeeId\)/g) || []).length;
assert.ok(
  openings >= 4,
  `Les lignes d’employés doivent ouvrir le dossier au clic et au clavier (${openings} appels trouvés).`
);
assert.ok(app.includes('title={fmt(t.openEmployeeDossier'), 'L’action n’est pas annoncée à l’utilisateur.');

// 2. Le geste marche aussi au clavier — une ligne cliquable qui n'est pas
//    atteignable au clavier exclut une partie des utilisateurs.
for (const marker of ['role="button"', 'tabIndex={0}', "event.key === 'Enter'"]) {
  assert.ok(app.includes(marker), `Accessibilité de la ligne d’employé absente: ${marker}`);
}

// 3. Réservé à l'administration : un employé n'a pas à consulter les heures et
//    la paie de ses collègues.
assert.ok(
  /dossierEmployeeId && activeEmployee\?\.role === 'admin'/.test(app),
  'Le dossier doit être réservé à un administrateur authentifié.'
);

// 4. L'affichage passe par le filtre des champs autorisés, jamais par le profil
//    brut. Un champ sensible ajouté plus tard au type Employee ne doit pas
//    apparaître à l'écran par simple oubli.
assert.ok(dossier.includes('dossierIdentity(employee)'), 'Le dossier doit filtrer les champs affichés.');
for (const forbidden of ['identity.nip', 'identity.sin', 'employee.nip', 'employee.sin', 'identity.asNumber']) {
  assert.ok(!dossier.includes(forbidden), `Le dossier ne doit jamais lire ${forbidden}.`);
}
assert.ok(model.includes('DOSSIER_FORBIDDEN_FIELDS'), 'La liste des champs interdits doit rester déclarée.');
for (const forbidden of ['nip', 'sin']) {
  assert.ok(
    new RegExp(`DOSSIER_VISIBLE_FIELDS[\\s\\S]*?\\] as const`).exec(model)?.[0].includes(`'${forbidden}'`) !== true,
    `${forbidden} ne doit pas figurer parmi les champs visibles.`
  );
}

// 5. Les tableaux du dossier défilent horizontalement plutôt que d'être rognés,
//    comme partout ailleurs depuis la correction de l'aperçu de document.
const tables = (dossier.match(/<table\b/g) || []).length;
const scrollers = (dossier.match(/overflow-x-auto/g) || []).length;
assert.equal(scrollers, tables, `Chaque tableau du dossier doit vivre dans une boîte défilante (${tables} tableaux, ${scrollers} boîtes).`);

// 6. Les périodes demandées sont toutes présentes.
for (const marker of ['Aujourd’hui', 'Ce mois-ci', 'Cette année', 'Depuis le début', 'Historique par année']) {
  assert.ok(dossier.includes(marker), `Période absente du dossier: ${marker}`);
}
assert.ok(dossier.includes('EmployeeWorkCalendar'), 'Le calendrier jour par jour doit être intégré au dossier.');

// 7. Bilingue, comme le reste de l'application.
assert.ok(dossier.includes("const isFrench = currentLanguage === 'FR'"), 'Le dossier doit être bilingue.');
const translations = read('src/translations.ts');
assert.equal(
  (translations.match(/openEmployeeDossier:/g) || []).length, 2,
  'Le libellé d’ouverture doit exister en français et en anglais.'
);

console.log('Dossier employé validé', {
  ouvertureDepuisLesListes: true,
  accessibleAuClavier: true,
  reserveAdministration: true,
  champsSensiblesFiltres: true,
  tableauxDefilants: tables,
  journeeMoisAnnee: true,
  bilingue: true
});
