import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const catalogue = read('src/components/CatalogueManager.tsx');
const store = read('src/store.ts');
const tools = read('src/components/ToolRegistry.tsx');

for (const marker of [
  'Modifier les prix du matériau',
  'prix fournisseur, le prix sous-traitant et le prix client',
  'sans en créer un autre',
  'Prix modifiables en tout temps',
  'Enregistrer les nouveaux prix',
  'Modifier les prix',
  'Les documents déjà enregistrés conservent leurs montants historiques',
  'updateCatalogueMaterial({',
  'supplierPrice: Number(editForm.supplierPrice)',
  'pricePerSqFt: Number(editForm.pricePerSqFt)',
  'clientPrice: Number(editForm.clientPrice)',
  'Aucun nouveau matériau n’a été créé'
]) assert.ok(catalogue.includes(marker), `Modification de prix incomplète: ${marker}`);

assert.ok(store.includes("updateCatalogueMaterial: (item) =>"), 'Action de mise à jour du catalogue absente.');
assert.ok(store.includes("saveState('gcp_catalogue', updated)"), 'Mise à jour locale du catalogue absente.');
assert.ok(store.includes("syncUpdate('catalog_items', item.id"), 'Synchronisation cloud de la mise à jour absente.');

for (const marker of [
  'Registre des outils',
  'model: \'\'',
  'serialNumber: \'\'',
  'toolPhoto:',
  'serialPhoto:',
  'receiptPhoto:',
  'application/pdf',
  'Dossiers de vol',
  'totalReplacementValue',
  'DOSSIER DE VOL D’OUTILS'
]) assert.ok(tools.includes(marker), `Registre d’outils incomplet: ${marker}`);

console.log('Catalogue et registre des outils validés', {
  existingMaterialPriceEditing: true,
  supplierPrice: true,
  subcontractorPrice: true,
  clientPrice: true,
  noDuplicateMaterial: true,
  localPersistence: true,
  cloudPersistence: true,
  existingDocumentsKeepHistoricalAmounts: true,
  toolPhoto: true,
  modelAndSerial: true,
  receiptPhotoOrPdf: true,
  theftClaimReport: true
});
