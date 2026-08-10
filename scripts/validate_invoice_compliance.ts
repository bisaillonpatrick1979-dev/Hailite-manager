// ---------------------------------------------------------------------------
// Conformité avant facturation : la porte doit rester fermée
// ---------------------------------------------------------------------------
// Un employé ou un sous-traitant ne peut pas envoyer sa facture tant qu'une
// tâche reste ouverte sur un des chantiers qu'elle couvre. C'est la dernière
// occasion de cocher : une fois la facture partie, plus personne n'y retourne,
// et le chantier ne peut pas être fermé.
//
// Ce validateur vérifie que la porte est posée aux deux endroits où elle peut
// être franchie — le bouton d'envoi et la fenêtre de signature — et qu'aucune
// des trois exceptions voulues n'a disparu.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const model = read('src/invoiceCompliance.ts');
const app = read('src/App.tsx');
const notice = read('src/components/InvoiceComplianceNotice.tsx');
const directory = read('src/components/ProjectDirectoryManager.tsx');

// -- La règle elle-même ---------------------------------------------------
assert.ok(model.includes('export function checkInvoiceCompliance'), 'La règle de conformité est absente.');
assert.ok(
  model.includes('ready: totalOpenTasks === 0'),
  'La facture ne doit partir que lorsqu’il ne reste aucune tâche ouverte.'
);

// -- Les trois exceptions voulues ----------------------------------------
// 1. Un chantier sans liste de tâches ne bloque rien : beaucoup de petits
//    travaux n'en ont pas, et les bloquer empêcherait toute facturation.
assert.ok(
  model.includes('if (openTasks.length === 0) continue;'),
  'Un chantier sans tâche ouverte ne doit pas apparaître comme bloquant.'
);
// 2. Un chantier supprimé ne piège pas le travailleur.
assert.ok(
  model.includes('unknownProjectIds.push(projectId)') && !/unknownProjectIds\.length[^)]*ready/.test(model),
  'Un chantier introuvable doit être signalé sans bloquer l’envoi.'
);
// 3. Une facture impayée n'empêche jamais de fermer un chantier.
assert.ok(
  /ready: openTasks\.length === 0 && openPunches\.length === 0/.test(model),
  'La fermeture ne doit dépendre que des tâches et des pointages ouverts, jamais du paiement.'
);

// -- La porte est posée aux deux endroits franchissables ------------------
const gateSites = (app.match(/invoiceComplianceFor\(/g) || []).length;
assert.ok(
  gateSites >= 3,
  `La conformité doit être évaluée au bouton d’envoi et dans la fenêtre de signature (${gateSites} usages trouvés).`
);
assert.ok(
  /disabled=\{!compliance\.ready\}/.test(app),
  'Le bouton d’envoi doit être désactivé tant que le chantier n’est pas terminé.'
);
assert.ok(
  /disabled=\{!invoiceComplianceFor\(invoiceToSign\)\.ready\}/.test(app),
  'Le bouton de signature doit être désactivé lui aussi : la fenêtre peut rester ouverte pendant qu’une tâche est rouverte.'
);
assert.ok(
  /if \(!compliance\.ready\) \{\s*alert\(complianceSummary/.test(app),
  'Le geste d’envoi doit revérifier la conformité au moment du clic.'
);

// -- Un refus doit toujours s'expliquer -----------------------------------
assert.ok(
  app.includes('title={compliance.ready ? undefined : complianceSummary('),
  'Un bouton grisé doit dire pourquoi il l’est.'
);
assert.ok(
  notice.includes('group.openTasks.map'),
  'Le travailleur doit voir quelles tâches il lui reste, pas seulement un compte.'
);
assert.ok(notice.includes('onOpenProject'), 'Il doit pouvoir se rendre à la liste de tâches.');
assert.ok(
  model.includes('export function complianceSummary'),
  'Le message doit venir d’une source unique : deux écrans qui expliquent différemment ne sont plus crus.'
);

// -- Fermeture du chantier ------------------------------------------------
assert.ok(directory.includes('checkProjectClosure('), 'La fermeture du chantier doit être contrôlée.');
assert.ok(
  /<option value="completed" disabled=\{!closure\.ready\}>/.test(directory),
  'L’état « Terminé » doit être hors d’atteinte tant que le chantier n’est pas prêt.'
);
assert.ok(
  directory.includes('closure.openPunches.length > 0'),
  'Un pointage encore en cours doit être nommé : fermer sous les pieds de quelqu’un fausserait ses heures.'
);

// -- Bilingue -------------------------------------------------------------
for (const marker of ['Le chantier n’est pas terminé', 'The site is not finished']) {
  assert.ok(notice.includes(marker), `Traduction manquante : ${marker}`);
}

console.log('Conformité de facturation validée', {
  regleToutesLesTachesCochees: true,
  chantierSansListeNonBloquant: true,
  chantierSupprimeNonBloquant: true,
  factureImpayeeNonBloquante: true,
  porteAuBoutonEtALaSignature: true,
  refusToujoursExplique: true,
  fermetureChantierControlee: true,
  bilingue: true
});
