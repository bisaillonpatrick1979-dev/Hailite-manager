import { TEST_EMPLOYEES } from './testProfiles';
import {
  TEST_CATALOGUE,
  TEST_CLIENTS,
  TEST_INVENTORY,
  TEST_PERIOD_END,
  TEST_PERIOD_START,
  TEST_PROJECTS,
  TEST_SUPPLIERS
} from './testDataCore';
import {
  TEST_DOCUMENTS,
  TEST_INVOICES,
  TEST_PAYROLL_PAYMENTS,
  TEST_PUNCH_SESSIONS
} from './testDataWork';
import {
  TEST_EXPENSES,
  TEST_GOALS,
  TEST_HR_ALERTS,
  TEST_ORDERS,
  TEST_TEAMS,
  TEST_WEEKLY_GOALS
} from './testDataAccounting';

export const TEST_DATASET = {
  employees: TEST_EMPLOYEES,
  projects: TEST_PROJECTS,
  punchSessions: TEST_PUNCH_SESSIONS,
  invoices: TEST_INVOICES,
  catalogue: TEST_CATALOGUE,
  suppliers: TEST_SUPPLIERS,
  inventory: TEST_INVENTORY,
  orders: TEST_ORDERS,
  clients: TEST_CLIENTS,
  hrAlerts: TEST_HR_ALERTS,
  documents: TEST_DOCUMENTS,
  expenses: TEST_EXPENSES,
  payrollPayments: TEST_PAYROLL_PAYMENTS,
  motivationTeams: TEST_TEAMS,
  motivationGoals: TEST_GOALS,
  weeklyGoals: TEST_WEEKLY_GOALS
};

export const TEST_DATASET_SUMMARY = {
  scenarioVersion: '2026.07-annual-v3',
  scenarioName: 'Exercice annuel fictif complet, validé et prêt pour les essais',
  periodStart: TEST_PERIOD_START,
  periodEnd: TEST_PERIOD_END,
  employees: TEST_EMPLOYEES.length,
  currentProfiles: TEST_EMPLOYEES.filter(employee => !employee.id.startsWith('test-former-')).length,
  formerEmployees: TEST_EMPLOYEES.filter(employee => employee.id.startsWith('test-former-')).length,
  clients: TEST_CLIENTS.length,
  projects: TEST_PROJECTS.length,
  punchSessions: TEST_PUNCH_SESSIONS.length,
  payrollPayments: TEST_PAYROLL_PAYMENTS.length,
  documents: TEST_DOCUMENTS.length,
  expenses: TEST_EXPENSES.length,
  orders: TEST_ORDERS.length
};
