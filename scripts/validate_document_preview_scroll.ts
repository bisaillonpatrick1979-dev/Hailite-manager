// ---------------------------------------------------------------------------
// Aperçu d'un document : rien ne doit être amputé sur un téléphone
// ---------------------------------------------------------------------------
// La feuille blanche (#gcp-pdf-canvas) porte « overflow-hidden » — elle en a
// besoin pour ses coins arrondis et pour contenir le filigrane pivoté. Mais un
// tableau de prix ne se comprime pas : ses colonnes de montants ont une largeur
// minimale, et sur un écran de 390 px le tableau mesurait 355 px dans une boîte
// de contenu de 244 px. Les 112 px de trop étaient rognés sans barre de
// défilement : la moitié droite du document (prix unitaire, total) devenait
// simplement inatteignable.
//
// Le correctif ne retire pas « overflow-hidden » de la feuille ; il donne à
// chaque bloc large sa propre boîte défilante et fait retomber les grilles à une
// colonne sous le point de rupture « sm ». Ce validateur vérifie que ces
// garanties tiennent toujours, et qu'aucun tableau n'a été rajouté hors d'une
// boîte défilante.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = readFileSync(resolve(root, 'src/components/ClientDocumentsManager.tsx'), 'utf8');

// La région de l'aperçu : de la feuille blanche jusqu'au modal suivant.
const start = source.indexOf('id="gcp-pdf-canvas"');
assert.ok(start > 0, 'La feuille d’aperçu #gcp-pdf-canvas est introuvable.');
const end = source.indexOf('MODAL: REGISTER PAYMENT', start);
assert.ok(end > start, 'La fin de la région d’aperçu est introuvable.');
const preview = source.slice(start, end);

// 1. La feuille garde une marge réduite sur téléphone (32 px de chaque côté
//    coûtaient un quart de la largeur utile) mais retrouve la marge pleine à
//    l'impression.
assert.ok(
  /rounded-xl p-4 sm:p-8 [^"]*print:p-8/.test(preview),
  'La feuille d’aperçu doit utiliser « p-4 sm:p-8 » et « print:p-8 ».'
);

// 2. Chaque tableau de l'aperçu vit dans une boîte défilante horizontalement.
const tableCount = (preview.match(/<table\b/g) || []).length;
assert.equal(tableCount, 3, `L’aperçu doit contenir 3 tableaux, ${tableCount} trouvés.`);

let cursor = 0;
let checked = 0;
while (true) {
  const tableAt = preview.indexOf('<table', cursor);
  if (tableAt === -1) break;
  const previousTableEnd = preview.lastIndexOf('</table>', tableAt);
  const wrapperAt = preview.lastIndexOf('overflow-x-auto', tableAt);
  assert.ok(
    wrapperAt !== -1 && wrapperAt > previousTableEnd,
    `Un tableau de l’aperçu (position ${tableAt}) n’est pas enveloppé dans une boîte « overflow-x-auto » : ses colonnes de montants seraient rognées sur téléphone.`
  );
  // Sur téléphone le tableau garde une largeur lisible et défile ; au-delà de
  // « sm » il redevient fluide.
  const declaration = preview.slice(tableAt, preview.indexOf('>', tableAt));
  assert.ok(
    /min-w-\[\d+px\]/.test(declaration) && declaration.includes('sm:min-w-0'),
    `Un tableau de l’aperçu n’a pas de largeur minimale téléphone + « sm:min-w-0 » : ${declaration.slice(0, 90)}`
  );
  checked += 1;
  cursor = tableAt + 6;
}

// 3. Chaque boîte défilante redevient transparente à l'impression : une barre de
//    défilement n'a aucun sens sur du papier, et le contenu doit s'y déployer.
const scrollers = preview.match(/overflow-x-auto[^"]*/g) || [];
assert.equal(scrollers.length, checked, 'Chaque tableau doit avoir sa propre boîte défilante.');
for (const scroller of scrollers) {
  assert.ok(
    scroller.includes('print:overflow-visible'),
    `Une boîte défilante de l’aperçu n’est pas neutralisée à l’impression : ${scroller}`
  );
}

// 4. Aucune grille figée à deux colonnes : à 390 px, deux colonnes laissent
//    ~115 px par colonne et les montants se chevauchent.
const rigidGrids = preview.match(/className="[^"]*\bgrid-cols-2\b[^"]*"/g) || [];
for (const grid of rigidGrids) {
  assert.ok(
    /\bsm:grid-cols-2\b/.test(grid) || /\bprint:grid-cols-2\b/.test(grid),
    `Grille figée à deux colonnes dans l’aperçu : ${grid}`
  );
  assert.ok(
    /\bgrid-cols-1\b/.test(grid),
    `Une grille de l’aperçu ne retombe pas à une colonne sur téléphone : ${grid}`
  );
}

// 5. L'en-tête empile ses deux blocs sur téléphone plutôt que de les serrer.
assert.ok(
  preview.includes('flex flex-col gap-4 border-b border-slate-250 pb-5 sm:flex-row'),
  'L’en-tête de la feuille doit s’empiler sur téléphone.'
);

// 6. Le geste de défilement est annoncé, sinon personne ne le devine.
assert.ok(preview.includes('cdmTableScrollHint'), 'L’indication de défilement du tableau est absente.');
const translations = readFileSync(resolve(root, 'src/translations.ts'), 'utf8');
assert.equal(
  (translations.match(/cdmTableScrollHint:/g) || []).length, 2,
  'cdmTableScrollHint doit exister en français et en anglais.'
);

console.log('Aperçu de document validé', {
  feuilleMargeTelephone: true,
  tableauxDefilants: checked,
  impressionNonAlteree: true,
  grillesResponsives: rigidGrids.length,
  enTeteEmpilee: true,
  indicationBilingue: true
});
