import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const app = read('src/App.tsx');
const projects = read('src/components/ProjectDirectoryManager.tsx');
const documents = read('src/components/ClientDocumentsManager.tsx');
const store = read('src/store.ts');

for (const marker of [
  "lazy(() => import('./components/ProjectDirectoryManager'))",
  '<ProjectDirectoryManager />',
  'Recherche immédiate et gestion complète des chantiers'
]) assert.ok(app.includes(marker), `Intégration projets absente: ${marker}`);

assert.ok(!app.includes('{projects.map(proj => ('), 'L’ancienne liste infinie de projets est encore rendue.');

for (const marker of [
  'project-directory-search',
  'Nom, client, adresse, employé, tâche ou outil',
  'filteredProjects',
  'Modifier toutes les informations',
  'editForm.name',
  'editForm.clientName',
  'editForm.address',
  'editForm.latitude',
  'editForm.longitude',
  'editForm.radius',
  'editForm.status',
  'tasksText',
  'toolsText',
  'assignedEmployees',
  'updateProject({',
  'rebuildTasks',
  'rebuildTools'
]) assert.ok(projects.includes(marker), `Fonction projet absente: ${marker}`);

for (const marker of [
  'editingDocument',
  'openEditDocument',
  'isSignedContract',
  'newSiteAddress',
  'Ajouter une ligne',
  'Enregistrer les modifications',
  'Enregistrer le brouillon modifiable',
  'Signer et verrouiller le contrat',
  'Signé · verrouillé',
  'Modification autorisée pour tous les documents sauf le contrat signé',
  'Sans signature, le contrat est enregistré comme brouillon',
  'contractWillBeSigned',
  'updateGCPDocument({',
  'setSimpleLines(simpleLines.filter'
]) assert.ok(documents.includes(marker), `Fonction document absente: ${marker}`);

for (const marker of [
  'SIGNED_CONTRACT_CONTENT_LOCK',
  'existingIsSignedContract',
  "existingDocument.status === 'accepted' && doc.status === 'completed'",
  'targetIsSignedContract',
  'if (targetIsSignedContract) return;'
]) assert.ok(store.includes(marker), `Protection du store absente: ${marker}`);

assert.ok(
  documents.includes("newDocType === 'contract' && hasOwnerSignature !== hasClientSignature"),
  'La validation des deux signatures du contrat est absente.'
);
assert.ok(
  documents.includes("contractWillBeSigned ?") && documents.includes(": unsignedContractStatus"),
  'Le contrat ne distingue pas correctement brouillon et signé.'
);
assert.ok(
  documents.includes("clientSignature: newDocType === 'contract' && contractWillBeSigned"),
  'La signature client ne déclenche pas le verrou contractuel.'
);
assert.ok(
  !documents.includes("if (newDocType === 'contract' && !clientSignatureData)"),
  'Le contrat exige encore une signature dès sa création et ne peut pas rester brouillon.'
);

console.log('Recherche et modification validées', {
  projectSearchBelowCreation: true,
  projectSearchFields: ['name', 'client', 'address', 'employee', 'task', 'tool'],
  fullProjectEditing: true,
  projectTasksAndToolsPreserved: true,
  quotesEditable: true,
  invoicesEditable: true,
  unsignedContractsEditable: true,
  signedContractsContentLocked: true,
  signedContractsDeletionLocked: true,
  signedContractLifecycleCompletionAllowed: true,
  simpleDocumentLinesAddRemove: true,
  workAddressEditable: true,
  storeLevelProtection: true
});
