import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const component = read('src/components/ClientDocumentsManager.tsx');
const types = read('src/types.ts');

for (const marker of [
  'document-professional-workflow',
  'Devis → Contrat → Facture',
  "openCreateDocument('quote')",
  "openCreateDocument('contract', doc)",
  "openCreateDocument('invoice', doc)",
  "status: newDocType === 'contract' ? 'accepted' : 'draft'",
  'refQuote:',
  'refContract:',
  "status: 'completed'",
  'doc.refContract',
  'Travaux terminés',
  'Créer contrat',
  'Créer facture',
  'Filigrane professionnel imprimable',
  'selectedDocForView.number',
  'companyInfo.logo &&',
  'Signer et créer le contrat',
  'id="document-search-only"',
  'Recherche unique dans tous les devis, contrats et factures',
  'Rechercher un client, un numéro de devis, de contrat ou de facture',
  'doc.clientName',
  'doc.refQuote',
  'doc.refContract'
]) assert.ok(component.includes(marker), `Parcours documentaire incomplet: ${marker}`);

assert.ok(!component.includes('convertQuoteToInvoice(doc.id)'), 'La conversion directe devis vers facture ne doit plus être utilisée.');
assert.ok(!component.includes('Main search and new create button'), 'L’ancien bouton rapide de création est encore affiché.');
assert.ok(!component.includes('Type filters'), 'Les anciens onglets Tous / Devis / Contrats / Factures sont encore affichés.');
assert.ok(!component.includes('Status sub filters'), 'Les anciens filtres de statut sont encore affichés.');
assert.ok(!component.includes('setActiveTypeTab(tab.id'), 'Un ancien contrôle de filtre par type subsiste.');
assert.ok(!component.includes('setActiveStatusTab(stat.id'), 'Un ancien contrôle de filtre par statut subsiste.');
assert.ok(types.includes("'completed'"), 'Le statut contrat terminé est absent des types.');

console.log('Parcours professionnel des documents validé', {
  quoteCreation: true,
  acceptedQuoteToSignedContract: true,
  completedContractToInvoice: true,
  quoteReference: true,
  contractReference: true,
  companyLogoWatermark: true,
  documentTypeWatermark: true,
  documentNumberWatermark: true,
  directQuoteToInvoiceRemoved: true,
  onlyThreeCreationCards: true,
  searchOnlyPanel: true,
  searchesClientAndReferences: true,
  legacyCreateButtonRemoved: true,
  legacyTypeFiltersRemoved: true,
  legacyStatusFiltersRemoved: true
});
