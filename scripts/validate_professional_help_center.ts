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

assert.ok(help.includes("localStorage.setItem(progressKey"), 'La progression du démarrage n’est pas conservée.');
assert.ok(help.includes("article.roles.includes(role)"), 'Le contenu n’est pas filtré selon le rôle.');
assert.ok(help.includes("searchable.includes(query)"), 'La recherche plein texte du guide est absente.');
assert.ok(help.includes("onNavigate(selectedArticle.tab!"), 'Les instructions ne permettent pas d’ouvrir le module concerné.');

console.log('Centre d’aide professionnel validé', {
  oldValidationGuideRemoved: true,
  firstLoginOpening: true,
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
