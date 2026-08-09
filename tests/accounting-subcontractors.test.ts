import assert from 'node:assert/strict';
import test from 'node:test';
import type { Employee, PayrollPayment } from '../src/types.ts';
import { reportingThreshold, summarizeSubcontractorPayments } from '../src/accountingSubcontractors.ts';

const emp = (id: string, name: string, workerType: string, extra: Partial<Employee> = {}) =>
  ({ id, name, workerType, ...extra }) as Employee;
const pay = (employeeId: string, amount: number, status: PayrollPayment['status'] = 'paid') =>
  ({ id: `p${employeeId}${amount}`, employeeId, employeeName: '', period: '', amount, status, date: '2026-03-01' }) as PayrollPayment;

test('les seuils suivent le pays et l’année', () => {
  assert.deepEqual(reportingThreshold('CA', 2026), { amount: 500, form: 'T5018' });
  // Le seuil américain est passé de 600 $ à 2 000 $ après le 31 décembre 2025.
  assert.deepEqual(reportingThreshold('US', 2025), { amount: 600, form: '1099-NEC' });
  assert.deepEqual(reportingThreshold('US', 2026), { amount: 2000, form: '1099-NEC' });
  assert.equal(reportingThreshold('FR', 2026), null);
});

test('seuls les versements réellement payés comptent', () => {
  const employees = [emp('s1', 'Stephane Roy', 'contractor')];
  const payments = [pay('s1', 400), pay('s1', 300), pay('s1', 9999, 'draft'), pay('s1', 5000, 'refused')];
  const { rows } = summarizeSubcontractorPayments(employees, payments, 500);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].total, 700);
  assert.equal(rows[0].paymentCount, 2);
  assert.equal(rows[0].meetsThreshold, true);
});

test('un salarié n’apparaît jamais dans le fichier des sous-traitants', () => {
  const employees = [emp('e1', 'Alex', 'salaried'), emp('s1', 'Stephane', 'contractor')];
  const { rows } = summarizeSubcontractorPayments(employees, [pay('e1', 5000), pay('s1', 100)], 500);
  assert.deepEqual(rows.map(r => r.name), ['Stephane']);
});

test('le seuil est indiqué sans exclure personne du fichier', () => {
  // Sous le seuil, la ligne reste présente : c'est au comptable de trancher.
  const { rows } = summarizeSubcontractorPayments([emp('s1', 'Petit', 'contractor')], [pay('s1', 120)], 500);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].meetsThreshold, false);
});

test('une personne payée sans type de travailleur est signalée, jamais devinée', () => {
  // Cas réel : un profil porte le rôle « sous-traitant » en base mais aucun
  // type de travailleur. Le deviner exposerait à une déclaration fausse.
  const employees = [emp('x1', 'Stephane Roy', '')];
  const { rows, unclassified } = summarizeSubcontractorPayments(employees, [pay('x1', 2500)], 500);
  assert.equal(rows.length, 0);
  assert.deepEqual(unclassified, [{ employeeId: 'x1', name: 'Stephane Roy', total: 2500 }]);
});

test('les coordonnées du sous-traitant accompagnent le montant', () => {
  const employees = [emp('s1', 'Roy Toiture', 'contractor', {
    businessName: '9123-4567 Alberta Ltd', gstNumber: '123456789RT0001',
    address: '10 rue Principale', phone: '(403) 555-0100'
  })];
  const { rows } = summarizeSubcontractorPayments(employees, [pay('s1', 800)], 500);
  assert.equal(rows[0].businessName, '9123-4567 Alberta Ltd');
  assert.equal(rows[0].taxNumber, '123456789RT0001');
  assert.equal(rows[0].address, '10 rue Principale');
  assert.equal(rows[0].phone, '(403) 555-0100');
});
