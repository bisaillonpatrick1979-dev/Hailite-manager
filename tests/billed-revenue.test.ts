import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// Ce qui compte comme revenu facturé
// ---------------------------------------------------------------------------
// Deux écrans calculent un revenu : le bandeau financier du tableau de bord et
// la rentabilité par chantier. Les deux énuméraient les statuts à la main —
// « paid », « sent », « accepted » — et laissaient donc dehors « completed » et
// « overdue ».
//
// Conséquence : marquer une facture « en retard », c'est-à-dire constater qu'un
// client tarde à payer, la faisait sortir du revenu du mois. Le revenu baissait
// au moment précis où le recouvrement commençait, et la marge avec lui. Le
// chiffre d'affaires d'un mois pouvait diminuer sans qu'aucune facture ne soit
// annulée.

test('seul le brouillon n’est pas encore facturé', () => {
  assert.match(app, /const isBilledInvoice = \(doc: GCPDocument\): boolean =>\s*\n?\s*doc\.type === 'invoice' && doc\.status !== 'draft';/);
});

test('plus aucune énumération de statuts à la main', () => {
  // C'est la forme qui produisait l'erreur : une liste qu'il fallait penser à
  // compléter chaque fois qu'un statut apparaît.
  assert.doesNotMatch(app, /d\.status === 'paid' \|\| d\.status === 'sent' \|\| d\.status === 'accepted'/);
});

test('les deux écrans emploient la même définition', () => {
  // L'intention était déjà écrite en commentaire : « deux écrans de
  // l'application ne doivent jamais afficher deux marges différentes ». Elle
  // ne tenait que par la discipline de recopier la même liste aux deux
  // endroits.
  const emplois = app.match(/isBilledInvoice\(d\)/g) || [];
  assert.equal(emplois.length, 2, 'le bandeau financier et la rentabilité par chantier');
});

test('l’encaissé reste distinct du facturé', () => {
  // Le revenu compte ce qui est dû; la trésorerie compte ce qui est entré.
  // Confondre les deux effacerait justement les factures en retard.
  const bloc = app.slice(app.indexOf('const getCompanyFinances'), app.indexOf('const getCompanyFinances') + 1400);
  assert.match(bloc, /const revenue = billedInvoices\.reduce/);
  assert.match(bloc, /const collected = documents/);
  assert.match(bloc, /paymentsHistory/, 'l’encaissé vient des versements, pas des statuts');
});
