import assert from 'node:assert/strict';
import test from 'node:test';
import type { Employee, PayrollPayment } from '../src/types.ts';
import {
  reportingThreshold,
  reportingYearForPeriod,
  summarizeSubcontractorPayments
} from '../src/accountingSubcontractors.ts';

const emp = (id: string, name: string, workerType: string, extra: Partial<Employee> = {}) =>
  ({ id, name, workerType, ...extra }) as Employee;
const pay = (
  employeeId: string,
  amount: number,
  status: PayrollPayment['status'] = 'paid',
  workerTypeAtPayment?: PayrollPayment['workerTypeAtPayment'],
  employeeName = ''
) => ({
  id: `p${employeeId}${amount}${status}`,
  employeeId,
  employeeName,
  period: '',
  amount,
  status,
  date: '2026-03-01',
  workerTypeAtPayment
}) as PayrollPayment;

const ca2026 = reportingThreshold('CA', 2026)!;

test('les seuils suivent le pays, la devise et l’année', () => {
  assert.deepEqual(ca2026, { amount: 500, form: 'T5018', currency: 'CAD', inclusive: false });
  assert.deepEqual(reportingThreshold('US', 2025), {
    amount: 600, form: '1099-NEC', currency: 'USD', inclusive: true
  });
  assert.deepEqual(reportingThreshold('US', 2026), {
    amount: 2000, form: '1099-NEC', currency: 'USD', inclusive: true
  });
  assert.deepEqual(reportingThreshold('US', 2027), {
    amount: null, form: '1099-NEC', currency: 'USD', inclusive: true
  });
  assert.equal(reportingThreshold('FR', 2026), null);
});

test('un seuil n’est évalué que sur une période de déclaration complète', () => {
  assert.equal(reportingYearForPeriod('CA', '2026-01-01', '2026-12-31'), 2026);
  assert.equal(reportingYearForPeriod('CA', '2025-04-01', '2026-03-31'), 2026);
  assert.equal(reportingYearForPeriod('CA', '2026-03-01', '2026-03-31'), null);
  assert.equal(reportingYearForPeriod('CA', '2025-01-01', '2026-12-31'), null);
  assert.equal(reportingYearForPeriod('US', '2026-01-01', '2026-12-31'), 2026);
  assert.equal(reportingYearForPeriod('US', '2025-04-01', '2026-03-31'), null);
});

test('seuls les versements réellement payés comptent', () => {
  const employees = [emp('s1', 'Stephane Roy', 'contractor')];
  const payments = [
    pay('s1', 400, 'paid', 'contractor'),
    pay('s1', 300, 'paid', 'contractor'),
    pay('s1', 9999, 'draft', 'contractor'),
    pay('s1', 5000, 'refused', 'contractor')
  ];
  const { rows } = summarizeSubcontractorPayments(employees, payments, ca2026);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].total, 700);
  assert.equal(rows[0].paymentCount, 2);
  assert.equal(rows[0].meetsThreshold, true);
});

test('le type figé au versement gagne sur la fiche actuelle', () => {
  const employees = [
    emp('changed-to-employee', 'Alex', 'salaried'),
    emp('changed-to-contractor', 'Sam', 'contractor')
  ];
  const { rows } = summarizeSubcontractorPayments(employees, [
    pay('changed-to-employee', 900, 'paid', 'contractor'),
    pay('changed-to-contractor', 5000, 'paid', 'salaried')
  ], ca2026);
  assert.deepEqual(rows.map(row => [row.name, row.total]), [['Alex', 900]]);
  assert.equal(rows[0].classificationInferred, false);
});

test('le T5018 exige plus de 500 dollars, pas 500 exactement', () => {
  const employees = [emp('s1', 'Petit', 'contractor')];
  const atThreshold = summarizeSubcontractorPayments(employees, [pay('s1', 500, 'paid', 'contractor')], ca2026);
  const overThreshold = summarizeSubcontractorPayments(employees, [pay('s1', 500.01, 'paid', 'contractor')], ca2026);
  assert.equal(atThreshold.rows[0].meetsThreshold, false);
  assert.equal(overThreshold.rows[0].meetsThreshold, true);
});

test('une période ou une devise non évaluée produit À valider, jamais un faux Oui', () => {
  const { rows } = summarizeSubcontractorPayments(
    [emp('s1', 'Petit', 'contractor')],
    [pay('s1', 5000, 'paid', 'contractor')],
    null
  );
  assert.equal(rows[0].meetsThreshold, null);
});

test('un type absent ou non canonique est signalé, jamais traité comme salarié', () => {
  const employees = [emp('x1', 'Stephane Roy', 'Compagnon')];
  const { rows, unclassified } = summarizeSubcontractorPayments(employees, [pay('x1', 2500)], ca2026);
  assert.equal(rows.length, 0);
  assert.deepEqual(unclassified, [{ employeeId: 'x1', name: 'Stephane Roy', total: 2500 }]);
});

test('les anciens versements sans instantané restent visibles mais sont signalés', () => {
  const employees = [emp('s1', 'Roy Toiture', 'contractor')];
  const { rows, inferred } = summarizeSubcontractorPayments(employees, [pay('s1', 800)], ca2026);
  assert.equal(rows[0].classificationInferred, true);
  assert.deepEqual(inferred, [{
    employeeId: 's1',
    name: 'Roy Toiture',
    total: 800,
    paymentCount: 1,
    classification: 'contractor'
  }]);
});

test('le NAS remplace le numéro de taxe absent dans le fichier du sous-traitant', () => {
  const employees = [emp('s1', 'Roy Toiture', 'contractor', {
    businessName: '9123-4567 Alberta Ltd', gstNumber: '   ', sin: '123456789',
    address: '10 rue Principale', phone: '(403) 555-0100'
  })];
  const { rows } = summarizeSubcontractorPayments(employees, [pay('s1', 800, 'paid', 'contractor')], ca2026);
  assert.equal(rows[0].businessName, '9123-4567 Alberta Ltd');
  assert.equal(rows[0].taxNumber, '123456789');
  assert.equal(rows[0].address, '10 rue Principale');
  assert.equal(rows[0].phone, '(403) 555-0100');
});

test('un paiement figé reste exportable même si l’ancien profil a été supprimé', () => {
  const { rows, unclassified } = summarizeSubcontractorPayments(
    [],
    [pay('gone', 900, 'paid', 'contractor', 'Entreprise archivée')],
    ca2026
  );
  assert.equal(rows[0].name, 'Entreprise archivée');
  assert.equal(rows[0].total, 900);
  assert.deepEqual(unclassified, []);
});
