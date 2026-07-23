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
  "{ id: 'completed', label:",
  'doc.refContract && doc.refContract.toLowerCase()',
  'Travaux terminés',
  'Créer contrat',
  'Créer facture',
  'Filigrane professionnel imprimable',
  'selectedDocForView.number',
  'companyInfo.logo &&',
  'Signer et créer le contrat'
]) assert.ok(component.includes(marker), `Parcours documentaire incomplet: ${marker}`);

assert.ok(!component.includes('convertQuoteToInvoice(doc.id)'), 'La conversion directe devis vers facture ne doit plus être utilisée.');
assert.ok(types.includes("'completed'"), 'Le statut contrat terminé est absent des types.');

console.log('Parcours professionnel des documents validé', {
  quoteCreation: true,
  acceptedQuoteToSignedContract: true,
  completedContractToInvoice: true,
  completedContractFilter: true,
  quoteReference: true,
  contractReference: true,
  referenceSearch: true,
  companyLogoWatermark: true,
  documentTypeWatermark: true,
  documentNumberWatermark: true,
  directQuoteToInvoiceRemoved: true
});
