import assert from 'node:assert/strict';
import { TEST_DATASET, TEST_DATASET_SUMMARY } from '../src/testDataset';
import { TEST_EMPLOYMENT_END, TEST_PERIOD_END, TEST_PERIOD_START, isTestEmployeeActiveOn } from '../src/testDataCore';

const money = (value: number) => Math.round(value * 100) / 100;
const unique = (name: string, rows: Array<{ id: string }>) => {
  const ids = rows.map(row => row.id);
  assert.equal(new Set(ids).size, ids.length, `${name}: identifiants dupliqués`);
};

unique('employees', TEST_DATASET.employees);
unique('projects', TEST_DATASET.projects);
unique('punchSessions', TEST_DATASET.punchSessions);
unique('invoices', TEST_DATASET.invoices);
unique('catalogue', TEST_DATASET.catalogue);
unique('suppliers', TEST_DATASET.suppliers);
unique('inventory', TEST_DATASET.inventory);
unique('orders', TEST_DATASET.orders);
unique('clients', TEST_DATASET.clients);
unique('hrAlerts', TEST_DATASET.hrAlerts);
unique('documents', TEST_DATASET.documents);
unique('expenses', TEST_DATASET.expenses);
unique('payrollPayments', TEST_DATASET.payrollPayments);

const employeeIds = new Set(TEST_DATASET.employees.map(employee => employee.id));
const projectIds = new Set(TEST_DATASET.projects.map(project => project.id));
const clientIds = new Set(TEST_DATASET.clients.map(client => client.id));

assert.equal(TEST_DATASET.employees.filter(employee => !employee.id.startsWith('test-former-')).length, 10, 'Le portail doit proposer dix profils actifs');
assert.equal(TEST_DATASET.employees.filter(employee => employee.id.startsWith('test-former-')).length, 2, 'Deux anciens employés doivent rester dans l’historique');
assert.ok(TEST_DATASET.projects.length >= 20, 'Au moins vingt projets sont requis');
assert.ok(TEST_DATASET.punchSessions.length >= 150, 'Le calendrier annuel doit contenir suffisamment de quarts de travail');
assert.ok(TEST_DATASET.payrollPayments.length >= 100, 'La paie annuelle doit contenir suffisamment de versements');
assert.ok(TEST_DATASET.expenses.length >= 120, 'Les dépenses annuelles doivent être détaillées');

for (const project of TEST_DATASET.projects) {
  project.assignedEmployees.forEach(employeeId => assert.ok(employeeIds.has(employeeId), `Projet ${project.id}: employé ${employeeId} introuvable`));
}

for (const session of TEST_DATASET.punchSessions) {
  assert.ok(employeeIds.has(session.employeeId), `Session ${session.id}: employé introuvable`);
  assert.ok(projectIds.has(session.projectId), `Session ${session.id}: projet introuvable`);
  const date = session.startTime.slice(0, 10);
  assert.ok(date >= TEST_PERIOD_START && date <= TEST_PERIOD_END, `Session ${session.id}: date hors exercice`);
  assert.ok(isTestEmployeeActiveOn(session.employeeId, date), `Session ${session.id}: personne non employée à cette date`);
  assert.ok((session.totalWorkedHours || 0) > 0, `Session ${session.id}: heures invalides`);
  assert.ok(session.revenue > 0, `Session ${session.id}: rémunération invalide`);
}

for (const payment of TEST_DATASET.payrollPayments) {
  assert.ok(employeeIds.has(payment.employeeId), `Paie ${payment.id}: employé introuvable`);
  if (payment.projectId) assert.ok(projectIds.has(payment.projectId), `Paie ${payment.id}: projet introuvable`);
  assert.ok(payment.amount > 0, `Paie ${payment.id}: montant invalide`);
}

for (const expense of TEST_DATASET.expenses) {
  assert.ok(projectIds.has(expense.projectId), `Dépense ${expense.id}: projet introuvable`);
  assert.ok(expense.amount > 0 && expense.tax >= 0, `Dépense ${expense.id}: montant invalide`);
}

for (const invoice of TEST_DATASET.invoices) {
  assert.ok(employeeIds.has(invoice.employeeId), `Facture sous-traitant ${invoice.id}: employé introuvable`);
  invoice.sessionIds.forEach(sessionId => {
    assert.ok(TEST_DATASET.punchSessions.some(session => session.id === sessionId), `Facture ${invoice.id}: session ${sessionId} introuvable`);
  });
}

for (const document of TEST_DATASET.documents) {
  assert.ok(clientIds.has(document.clientId), `Document ${document.id}: client introuvable`);
  assert.ok(Math.abs(money(document.subtotal + document.taxAmount) - document.total) <= 0.02, `Document ${document.id}: total incohérent`);
  const paid = money(document.paymentsHistory.reduce((sum, payment) => sum + payment.amount, 0));
  assert.ok(Math.abs(money(document.total - paid) - document.balanceDue) <= 0.02, `Document ${document.id}: solde incohérent`);
  const lines = money(document.lineItems.reduce((sum, line) => sum + line.total, 0));
  assert.ok(Math.abs(lines - document.subtotal) <= 0.02, `Document ${document.id}: lignes incohérentes`);
}

const months = new Set(TEST_DATASET.expenses.map(expense => expense.date.slice(0, 7)));
for (let month = 7; month <= 12; month += 1) assert.ok(months.has(`2025-${String(month).padStart(2, '0')}`), `Dépenses manquantes pour 2025-${month}`);
for (let month = 1; month <= 6; month += 1) assert.ok(months.has(`2026-${String(month).padStart(2, '0')}`), `Dépenses manquantes pour 2026-${month}`);

for (const [employeeId, endDate] of Object.entries(TEST_EMPLOYMENT_END)) {
  const lastSession = TEST_DATASET.punchSessions
    .filter(session => session.employeeId === employeeId)
    .map(session => session.startTime.slice(0, 10))
    .sort()
    .at(-1);
  assert.ok(lastSession && lastSession <= endDate, `${employeeId}: travail enregistré après le départ`);
}

for (const employee of TEST_DATASET.employees) {
  const payCount = TEST_DATASET.payrollPayments.filter(payment => payment.employeeId === employee.id).length;
  assert.ok(payCount > 0, `${employee.name}: aucun versement de paie`);
}

assert.ok(TEST_DATASET.hrAlerts.some(alert => alert.title.includes('Départ volontaire')), 'Événement de départ volontaire manquant');
assert.ok(TEST_DATASET.hrAlerts.some(alert => alert.title.includes('Fin d’emploi')), 'Événement de fin d’emploi manquant');
assert.ok(!TEST_DATASET.employees.some(employee => /^emp-[1-4]$/.test(employee.id)), 'Un ancien profil de démonstration subsiste');

const billed = money(TEST_DATASET.documents.filter(document => document.type === 'invoice').reduce((sum, document) => sum + document.subtotal, 0));
const expenses = money(TEST_DATASET.expenses.reduce((sum, expense) => sum + expense.amount + expense.tax, 0));
const payroll = money(TEST_DATASET.payrollPayments.reduce((sum, payment) => sum + payment.amount, 0));
assert.ok(billed > expenses + payroll, 'Le scénario annuel doit conserver une marge brute positive');

console.log('Jeu de données annuel validé', {
  ...TEST_DATASET_SUMMARY,
  billed,
  expenses,
  payroll,
  grossMargin: money(billed - expenses - payroll)
});
