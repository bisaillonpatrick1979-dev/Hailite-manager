import assert from 'node:assert/strict';
import test from 'node:test';
import type { Employee, PayrollPayment } from '../src/types.ts';
import { meetsReportingThreshold, reportingThreshold, summarizeSubcontractorPayments } from '../src/accountingSubcontractors.ts';

const CA = reportingThreshold('CA', 2026);

const emp = (id: string, name: string, workerType: string, extra: Partial<Employee> = {}) =>
  ({ id, name, workerType, ...extra }) as Employee;
const pay = (
  employeeId: string,
  amount: number,
  status: PayrollPayment['status'] = 'paid',
  workerTypeAtPayment?: string
) => ({
  id: `p${employeeId}${amount}`, employeeId, employeeName: '', period: '', amount, status,
  date: '2026-03-01', workerTypeAtPayment
}) as PayrollPayment;

test('les seuils suivent le pays et l’année', () => {
  assert.deepEqual(reportingThreshold('CA', 2026), { amount: 500, form: 'T5018', inclusive: false });
  // Le seuil américain est passé de 600 $ à 2 000 $ après le 31 décembre 2025.
  assert.deepEqual(reportingThreshold('US', 2025), { amount: 600, form: '1099-NEC', inclusive: true });
  assert.deepEqual(reportingThreshold('US', 2026), { amount: 2000, form: '1099-NEC', inclusive: true });
  assert.equal(reportingThreshold('FR', 2026), null);
});

test('au-delà de 2026, le seuil américain n’est pas inventé', () => {
  // Le seuil devient indexé : affirmer 2 000 $ pour 2027 serait faux sans que
  // rien ne le signale, sur un écran qui sert à produire des feuillets.
  for (const year of [2027, 2028, 2035]) {
    const threshold = reportingThreshold('US', year);
    assert.equal(threshold?.amount, null, `${year} ne doit pas affirmer de montant`);
    assert.equal(threshold?.form, '1099-NEC');
    assert.equal(meetsReportingThreshold(999999, threshold), null, 'aucun oui/non ne doit être produit');
  }
});

test('le T5018 vise « plus de 500 $ », le 1099-NEC « à partir du seuil »', () => {
  // Exactement 500 $ n'atteint pas le seuil canadien, mais exactement 600 $
  // atteint le seuil américain. La nuance change qui figure au feuillet.
  assert.equal(meetsReportingThreshold(500, reportingThreshold('CA', 2026)), false);
  assert.equal(meetsReportingThreshold(500.01, reportingThreshold('CA', 2026)), true);
  assert.equal(meetsReportingThreshold(600, reportingThreshold('US', 2025)), true);
  assert.equal(meetsReportingThreshold(599.99, reportingThreshold('US', 2025)), false);
  assert.equal(meetsReportingThreshold(1000, null), null);
});

test('seuls les versements réellement payés comptent', () => {
  const employees = [emp('s1', 'Stephane Roy', 'contractor')];
  const payments = [pay('s1', 400), pay('s1', 300), pay('s1', 9999, 'draft'), pay('s1', 5000, 'refused')];
  const { rows } = summarizeSubcontractorPayments(employees, payments, CA);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].total, 700);
  assert.equal(rows[0].paymentCount, 2);
  assert.equal(rows[0].meetsThreshold, true);
});

test('un salarié n’apparaît jamais dans le fichier des sous-traitants', () => {
  const employees = [emp('e1', 'Alex', 'salaried'), emp('s1', 'Stephane', 'contractor')];
  const { rows } = summarizeSubcontractorPayments(employees, [pay('e1', 5000), pay('s1', 100)], CA);
  assert.deepEqual(rows.map(r => r.name), ['Stephane']);
});

test('le seuil est indiqué sans exclure personne du fichier', () => {
  // Sous le seuil, la ligne reste présente : c'est au comptable de trancher.
  const { rows } = summarizeSubcontractorPayments([emp('s1', 'Petit', 'contractor')], [pay('s1', 120)], CA);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].meetsThreshold, false);
});

test('une personne payée sans type de travailleur est signalée, jamais devinée', () => {
  // Cas réel : un profil porte le rôle « sous-traitant » en base mais aucun
  // type de travailleur. Le deviner exposerait à une déclaration fausse.
  const employees = [emp('x1', 'Stephane Roy', '')];
  const { rows, unclassified } = summarizeSubcontractorPayments(employees, [pay('x1', 2500)], CA);
  assert.equal(rows.length, 0);
  assert.deepEqual(unclassified, [{ employeeId: 'x1', name: 'Stephane Roy', total: 2500 }]);
});

test('les coordonnées du sous-traitant accompagnent le montant', () => {
  const employees = [emp('s1', 'Roy Toiture', 'contractor', {
    businessName: '9123-4567 Alberta Ltd', gstNumber: '123456789RT0001',
    address: '10 rue Principale', phone: '(403) 555-0100'
  })];
  const { rows } = summarizeSubcontractorPayments(employees, [pay('s1', 800)], CA);
  assert.equal(rows[0].businessName, '9123-4567 Alberta Ltd');
  assert.equal(rows[0].taxNumber, '123456789RT0001');
  assert.equal(rows[0].address, '10 rue Principale');
  assert.equal(rows[0].phone, '(403) 555-0100');
});

// ---------------------------------------------------------------------------
// Instantané du type de travailleur
// ---------------------------------------------------------------------------

test('un ancien sous-traitant devenu salarié garde ses paiements passés au feuillet', () => {
  // Le cas qui réécrivait l'histoire : la fiche dit « salarié » aujourd'hui,
  // mais les versements de l'époque portent leur propre nature.
  const employees = [emp('s1', 'Stephane Roy', 'salaried')];
  const payments = [
    pay('s1', 4000, 'paid', 'contractor'),   // versé quand il était sous-traitant
    pay('s1', 2000, 'paid', 'salaried')      // versé après l'embauche
  ];
  const { rows } = summarizeSubcontractorPayments(employees, payments, CA);
  assert.equal(rows.length, 1, 'il doit rester au feuillet des sous-traitants');
  assert.equal(rows[0].total, 4000, 'seuls les versements de sous-traitance comptent');
  assert.equal(rows[0].paymentCount, 1);
  assert.equal(rows[0].classificationInferred, false, 'rien n’a été déduit : l’instantané existait');
});

test('un salarié depuis toujours n’entre pas au feuillet, même avec un instantané', () => {
  const employees = [emp('e1', 'Alex', 'salaried')];
  const { rows } = summarizeSubcontractorPayments(employees, [pay('e1', 9000, 'paid', 'salaried')], CA);
  assert.deepEqual(rows, []);
});

test('sans instantané, on retombe sur la fiche actuelle mais on le signale', () => {
  const employees = [emp('s1', 'Stephane Roy', 'contractor')];
  const { rows, inferred } = summarizeSubcontractorPayments(employees, [pay('s1', 3000)], CA);
  assert.equal(rows[0].total, 3000);
  assert.equal(rows[0].classificationInferred, true);
  assert.deepEqual(inferred, [{ employeeId: 's1', name: 'Stephane Roy', total: 3000, paymentCount: 1 }]);
});

test('un versement avec instantané prime toujours sur la fiche actuelle', () => {
  // Fiche « salarié », instantané « sous-traitant » : c'est l'instantané qui
  // décide, sinon l'export changerait au gré des modifications de profil.
  const { rows } = summarizeSubcontractorPayments(
    [emp('s1', 'Roy', 'salaried')],
    [pay('s1', 700, 'paid', 'contractor')],
    CA
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].classificationInferred, false);
});

test('un versement dont la nature est inconnue partout reste signalé', () => {
  const { rows, unclassified } = summarizeSubcontractorPayments([emp('x1', 'Inconnu', '')], [pay('x1', 800)], CA);
  assert.equal(rows.length, 0);
  assert.equal(unclassified[0].total, 800);
});

test('le seuil s’applique au total de sous-traitance, pas au total versé', () => {
  // 400 $ comme sous-traitant et 400 $ comme salarié ne font pas 800 $ de
  // sous-traitance : le feuillet ne doit pas franchir le seuil par addition.
  const { rows } = summarizeSubcontractorPayments(
    [emp('s1', 'Roy', 'contractor')],
    [pay('s1', 400, 'paid', 'contractor'), pay('s1', 400, 'paid', 'salaried')],
    CA
  );
  assert.equal(rows[0].total, 400);
  assert.equal(rows[0].meetsThreshold, false);
});

test('aucun dollar versé ne disparaît quand une personne mélange les natures', () => {
  // Le cas devient courant pendant la transition : les versements antérieurs à
  // l'instantané n'en ont pas, les suivants oui. Si la fiche n'a pas de type de
  // travailleur, les montants sans nature connue doivent rester visibles —
  // sinon ils sortent du feuillet sans apparaître nulle part.
  const employees = [emp('x1', 'Stephane Roy', '')];
  const payments = [
    pay('x1', 4000, 'paid', 'contractor'), // nature connue
    pay('x1', 800)                         // nature inconnue
  ];
  const { rows, unclassified } = summarizeSubcontractorPayments(employees, payments, CA);

  assert.equal(rows.length, 1, 'la part de sous-traitance est déclarée');
  assert.equal(rows[0].total, 4000);
  assert.deepEqual(unclassified, [{ employeeId: 'x1', name: 'Stephane Roy', total: 800 }],
    'la part de nature inconnue est signalée, pas escamotée');

  const declare = rows.reduce((sum, row) => sum + row.total, 0);
  const signale = unclassified.reduce((sum, entry) => sum + entry.total, 0);
  assert.equal(declare + signale, 4800, 'tout ce qui a été versé est soit déclaré, soit signalé');
});

test('un sous-traitant confirmé n’est pas signalé pour ses versements classés', () => {
  // Contrôle inverse : sans versement de nature inconnue, rien ne doit tomber
  // dans les signalements.
  const { rows, unclassified } = summarizeSubcontractorPayments(
    [emp('s1', 'Roy', 'contractor')],
    [pay('s1', 900, 'paid', 'contractor'), pay('s1', 100, 'paid', 'salaried')],
    CA
  );
  assert.equal(rows[0].total, 900);
  assert.deepEqual(unclassified, []);
});
