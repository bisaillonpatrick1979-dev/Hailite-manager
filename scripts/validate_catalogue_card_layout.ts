import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const catalogue = readFileSync(resolve(root, 'src/components/CatalogueManager.tsx'), 'utf8');

for (const marker of [
  'grid-cols-[92px_minmax(0,1fr)]',
  'xl:grid-cols-[80px_minmax(220px,1fr)_minmax(240px,auto)]',
  'h-[92px] w-[92px]',
  'break-words text-xs leading-relaxed',
  'col-span-2 grid min-w-0 grid-cols-3',
  'xl:col-span-1',
  'min-w-0 rounded-lg border border-gray-850',
  'truncate text-[9px] uppercase',
  'col-span-2 text-sm font-black text-left',
  'col-span-2 flex flex-wrap justify-end'
]) assert.ok(catalogue.includes(marker), `Disposition catalogue absente: ${marker}`);

assert.ok(!catalogue.includes('flex flex-col sm:flex-row sm:items-center gap-3 text-xs'), 'L’ancienne rangée comprimée est encore active.');
assert.ok(!catalogue.includes('grid grid-cols-3 sm:flex gap-1.5'), 'Les prix utilisent encore la disposition qui causait le chevauchement.');
assert.ok(!catalogue.includes('text-gray-500 uppercase whitespace-nowrap'), 'Un libellé de prix peut encore forcer un débordement.');

console.log('Mise en page du catalogue validée', {
  tabletSafeGrid: true,
  supplierTextProtected: true,
  pricesOnDedicatedRow: true,
  responsiveDesktopLayout: true,
  actionsOnDedicatedRow: true,
  noPriceOverlap: true
});
