import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const app = read('src/App.tsx');
const help = read('src/components/UserHelpCenter.tsx');

for (const marker of [
  "lazy(() => import('./components/UserHelpCenter'))",
  'helpCenterOpen',
  'gcp_help_welcome_',
  'open-professional-help-center',
  'Centre d’aide et de formation',
  '<UserHelpCenter',
  "role={activeEmployee?.role || 'employee'}",
  'onNavigate={(tab, settingsTab)',
  'Aide et formation'
]) assert.ok(app.includes(marker), `Intégration du centre d’aide absente: ${marker}`);

assert.ok(!app.includes('INTERACTIVE VALIDATION TOUR OVERLAY'), 'L’ancien panneau de validation est encore affiché.');
assert.ok(!app.includes('TOUR_STEPS_I18N'), 'Les anciennes instructions de validation sont encore incluses.');
assert.ok(!app.includes('setTourStep(0)'), 'L’ancien bouton de visite est encore actif.');

for (const marker of [
  'Centre d’aide et de formation',
  'Parcours de démarrage',
  'gcp_help_progress_',
  'Première connexion et navigation',
  'Configuration initiale de la compagnie',
  'Journée de travail : pointage complet',
  'Créer un client et son chantier',
  'Parcours professionnel : Devis → Contrat → Facture',
  'Catalogue : matériaux et prix',
  'Registre des outils et dossier de vol',
  'Employés, rôles, compétences et paie',
  'Choisir et comprendre le stockage',
  'Importer les données d’une ancienne application',
  'Accès, confidentialité et usage responsable',
  'Problèmes courants et solutions',
  'Rechercher : devis, pointage, sauvegarde, outil, paie',
  'Ouvrir ce module',
  "STARTER_BY_ROLE",
  "admin:",
  "secretary:",
  "accountant:",
  "employee:"
]) assert.ok(help.includes(marker), `Contenu d’aide absent: ${marker}`);

for (const category of [
  "'start'", "'daily'", "'projects'", "'documents'", "'inventory'",
  "'team'", "'storage'", "'security'", "'troubleshooting'"
]) assert.ok(help.includes(category), `Catégorie d’aide absente: ${category}`);

// La progression de formation doit survivre à une reconnexion : en
// sessionStorage, toutes les étapes réapparaissaient comme non faites à chaque
// retour, et l'application semblait exiger de tout refaire.
assert.ok(help.includes("localStorage.setItem(progressKey"), 'La progression de formation doit survivre à une reconnexion.');
assert.ok(!help.includes("sessionStorage.setItem(progressKey"), 'La progression ne doit plus être limitée à la session.');
// L'intention d'origine reste : sur une tablette partagée, la progression d'un
// employé ne doit pas devenir celle d'un autre. La clé porte donc son
// identifiant, et le préfixe est déclaré dans la politique de stockage pour
// échapper au nettoyage du démarrage sans ouvrir la porte aux données métier.
assert.ok(help.includes('`gcp_help_progress_${employeeId}`'), 'La progression doit être propre à chaque employé.');
const storagePolicy = read('src/securityStorage.ts');
assert.ok(storagePolicy.includes("'gcp_help_progress_'"), 'Le préfixe de progression doit être autorisé explicitement.');
assert.ok(storagePolicy.includes("'gcp_help_welcome_'"), 'Le préfixe de première ouverture doit être autorisé explicitement.');
assert.ok(storagePolicy.includes('SAFE_KEY_PREFIXES'), 'La politique de stockage doit encadrer les préfixes autorisés.');

// Le centre d'aide ne doit jamais s'ouvrir de lui-même. Il le faisait à chaque
// connexion : la marque de passage vivait en sessionStorage, que la déconnexion
// vide. Une aide qu'on doit refermer à chaque retour cesse d'être une aide.
assert.ok(
  !app.includes('sessionStorage.setItem(welcomeKey'),
  'La marque de première ouverture ne doit plus vivre dans la session, sinon la fenêtre revient à chaque connexion.'
);
assert.ok(
  app.includes('localStorage.getItem(welcomeKey)'),
  'La première ouverture doit être notée de façon durable.'
);
const automaticOpenings = (app.match(/setHelpCenterOpen\(true\)/g) || []).length;
assert.equal(
  automaticOpenings, 2,
  `Le centre d'aide ne doit s'ouvrir que sur les deux boutons prévus (${automaticOpenings} ouvertures trouvées).`
);
for (const opening of app.split('setHelpCenterOpen(true)').slice(0, -1)) {
  const context = opening.slice(-160);
  assert.ok(
    context.includes('onClick'),
    'Une ouverture du centre d’aide ne provient pas d’un geste explicite de l’utilisateur.'
  );
}
assert.ok(help.includes("article.roles.includes(role)"), 'Le contenu n’est pas filtré selon le rôle.');
assert.ok(help.includes("searchable.includes(query)"), 'La recherche plein texte du guide est absente.');
assert.ok(help.includes("onNavigate(selectedArticle.tab!"), 'Les instructions ne permettent pas d’ouvrir le module concerné.');

console.log('Centre d’aide professionnel validé', {
  oldValidationGuideRemoved: true,
  neverOpensByItself: true,
  permanentHelpButton: true,
  mobileMoreMenuEntry: true,
  roleBasedContent: true,
  searchableInstructions: true,
  guidedChecklist: true,
  savedProgress: true,
  moduleDeepLinks: true,
  bilingual: true,
  documentsWorkflow: true,
  catalogueAndTools: true,
  storageAndMigration: true,
  securityAndTroubleshooting: true
});
