import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createFiveYearDemoDataset } from '../src/demoSandbox';
import type { Employee } from '../src/types';

const administrator: Employee = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Patrick Bisaillon',
  nip: '',
  role: 'admin',
  hourlyRate: 0,
  workerType: 'Propriétaire',
  asNumber: '',
  phone: '',
  address: '',
  hireDate: '2021-07-01',
  avatar: '',
  level: 1,
  xp: 0,
  privacyNoticeVersion: '2026.08',
  privacyNoticeAcknowledgedAt: '2026-08-06T12:00:00.000Z',
  locationNoticeAcknowledgedAt: '2026-08-06T12:00:00.000Z'
};

const dataset = createFiveYearDemoDataset(administrator);

function uniqueIds(label: string, rows: Array<{ id: string }>) {
  const ids = rows.map(row => row.id);
  assert.equal(new Set(ids).size, ids.length, `${label}: identifiants dupliqués`);
}

test('le bac à sable charge réellement cinq ans et tous les modules', () => {
  assert.equal(dataset.summary.periodStart, '2021-07-01');
  assert.equal(dataset.summary.latestStatsMonth, '2026-06');
  assert.ok(dataset.projects.length >= 100);
  assert.ok(dataset.punchSessions.length >= 3000);
  assert.ok(dataset.payrollPayments.length >= 1000);
  assert.ok(dataset.documents.length >= 280);
  assert.ok(dataset.expenses.length >= 800);
  assert.ok(dataset.projectPhotos.length >= 280);
  assert.ok(dataset.safetyRecords.length >= 180);
  assert.ok(dataset.shiftAssignments.length >= 90);
  assert.ok(dataset.leads.length >= 80);
  assert.ok(dataset.toolAssets.length >= 30);
  assert.ok(dataset.toolTheftReports.length >= 3);
  assert.ok(dataset.changeOrders.length >= 45);
  assert.ok(dataset.insuranceClaims.length >= 12);
  assert.ok(dataset.summary.counts.totalRows >= 6500);

  const fiscalYears = new Set(dataset.punchSessions.map(session => Number(session.startTime.slice(0, 4))));
  for (const year of [2021, 2022, 2023, 2024, 2025, 2026]) {
    assert.ok(fiscalYears.has(year), `année civile ${year} absente des pointages`);
  }
});

test('toutes les références croisées du scénario sont valides', () => {
  const employeeIds = new Set(dataset.employees.map(employee => employee.id));
  const projectIds = new Set(dataset.projects.map(project => project.id));
  const punchIds = new Set(dataset.punchSessions.map(session => session.id));
  const clientIds = new Set(dataset.clients.map(client => client.id));
  const documentIds = new Set(dataset.documents.map(document => document.id));
  const teamIds = new Set(dataset.motivationTeams.map(team => team.id));
  const toolIds = new Set(dataset.toolAssets.map(tool => tool.id));

  for (const project of dataset.projects) {
    project.assignedEmployees.forEach(id => assert.ok(employeeIds.has(id), `${project.id}: employé ${id} absent`));
  }
  for (const session of dataset.punchSessions) {
    assert.ok(employeeIds.has(session.employeeId), `${session.id}: employé absent`);
    assert.ok(projectIds.has(session.projectId), `${session.id}: chantier absent`);
  }
  for (const invoice of dataset.invoices) {
    assert.ok(employeeIds.has(invoice.employeeId), `${invoice.id}: employé absent`);
    invoice.sessionIds.forEach(id => assert.ok(punchIds.has(id), `${invoice.id}: pointage ${id} absent`));
  }
  for (const payment of dataset.payrollPayments) {
    assert.ok(employeeIds.has(payment.employeeId), `${payment.id}: employé absent`);
    if (payment.projectId) assert.ok(projectIds.has(payment.projectId), `${payment.id}: chantier absent`);
  }
  for (const document of dataset.documents) {
    assert.ok(clientIds.has(document.clientId), `${document.id}: client absent`);
    if (document.refQuote) assert.ok(documentIds.has(document.refQuote), `${document.id}: devis référencé absent`);
    if (document.refContract) assert.ok(documentIds.has(document.refContract), `${document.id}: contrat référencé absent`);
  }
  for (const row of [...dataset.expenses, ...dataset.personalExpenses]) assert.ok(projectIds.has(row.projectId), `${row.id}: chantier absent`);
  for (const row of [...dataset.projectPhotos, ...dataset.changeOrders, ...dataset.insuranceClaims, ...dataset.shiftAssignments, ...dataset.safetyRecords]) {
    assert.ok(projectIds.has(row.projectId), `${row.id}: chantier absent`);
  }
  for (const lead of dataset.leads) {
    if (lead.convertedClientId) assert.ok(clientIds.has(lead.convertedClientId), `${lead.id}: client converti absent`);
    if (lead.convertedProjectId) assert.ok(projectIds.has(lead.convertedProjectId), `${lead.id}: chantier converti absent`);
  }
  for (const team of dataset.motivationTeams) {
    team.memberIds.forEach(id => assert.ok(employeeIds.has(id), `${team.id}: membre absent`));
    team.projectIds?.forEach(id => assert.ok(projectIds.has(id), `${team.id}: chantier absent`));
  }
  for (const goal of dataset.motivationGoals) {
    if (goal.teamId) assert.ok(teamIds.has(goal.teamId), `${goal.id}: équipe absente`);
    if (goal.employeeId) assert.ok(employeeIds.has(goal.employeeId), `${goal.id}: employé absent`);
  }
  for (const report of dataset.toolTheftReports) report.toolIds.forEach(id => assert.ok(toolIds.has(id), `${report.id}: outil absent`));
});

test('les identifiants sont uniques et aucune donnée secrète n’est générée', () => {
  const collections: Array<[string, Array<{ id: string }>]> = [
    ['employees', dataset.employees], ['projects', dataset.projects], ['punchSessions', dataset.punchSessions],
    ['invoices', dataset.invoices], ['orders', dataset.orders], ['documents', dataset.documents],
    ['expenses', dataset.expenses], ['photos', dataset.projectPhotos], ['changeOrders', dataset.changeOrders],
    ['claims', dataset.insuranceClaims], ['leads', dataset.leads], ['shifts', dataset.shiftAssignments],
    ['safety', dataset.safetyRecords], ['tools', dataset.toolAssets], ['theftReports', dataset.toolTheftReports]
  ];
  collections.forEach(([label, rows]) => uniqueIds(label, rows));
  assert.ok(dataset.employees.every(employee => employee.nip === ''));
  assert.ok(dataset.employees.every(employee => !employee.sin));
  assert.equal(dataset.activeEmployee.id, administrator.id);
  assert.equal(dataset.activeEmployee.name, administrator.name);
  assert.equal(dataset.activeEmployee.role, 'admin');
  assert.ok(dataset.projectPhotos.every(photo => photo.imageUrl.startsWith('data:image/svg+xml;utf8,')));
  assert.ok(dataset.projectPhotos.every(photo => photo.imageUrl.length < 2500), 'les photos démo ne doivent pas gonfler la mémoire');
});

test('les chiffres historiques sont calculés et le scénario est déterministe', () => {
  assert.ok(dataset.summary.clientRevenue > 4_000_000);
  assert.ok(dataset.summary.operatingExpenses > 2_000_000);
  assert.ok(dataset.summary.payroll > 1_800_000);
  assert.ok(dataset.summary.grossMargin > 0);
  assert.ok(dataset.summary.workedHours > 25_000);
  const again = createFiveYearDemoDataset(administrator);
  assert.deepEqual(again.summary, dataset.summary);
  assert.deepEqual(again.projects.slice(0, 5), dataset.projects.slice(0, 5));
});

test('l’isolation bloque Supabase, localStorage et l’hydratation pendant la démo', async () => {
  const [apiClient, store] = await Promise.all([
    readFile(new URL('../src/apiClient.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/store.ts', import.meta.url), 'utf8')
  ]);
  assert.match(apiClient, /let demoSandboxIsolation = false/);
  assert.match(apiClient, /if \(demoSandboxIsolation\) return \{ demo: true \}/);
  assert.match(apiClient, /if \(demoSandboxIsolation\) return \{ enabled: false, tables: \{\} \}/);
  assert.match(store, /if \(isDemoSandboxIsolationActive\(\)\) return;/);
  assert.match(store, /if \(get\(\)\.demoSandboxActive \|\| isDemoSandboxIsolationActive\(\)\)/);
  assert.match(store, /setDemoSandboxIsolation\(true\)/);
  assert.match(store, /setDemoSandboxIsolation\(false\)/);
});

test('l’activation, une modification et la sortie restaurent réellement l’état initial sans requête réseau', async () => {
  const storage = new Map<string, string>();
  let storageWrites = 0;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storageWrites += 1; storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
      clear: () => { storage.clear(); },
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      get length() { return storage.size; }
    }
  });
  let networkCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    networkCalls += 1;
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const { useAppStore } = await import('../src/store');
    const initialCompanyInfo = useAppStore.getState().companyInfo;
    const realProject = {
      id: 'real-project-kept', name: 'Vrai chantier conservé', clientName: 'Client réel', address: 'Calgary',
      latitude: 51, longitude: -114, radius: 100, assignedEmployees: [administrator.id], status: 'active' as const
    };
    useAppStore.setState({
      activeEmployee: administrator,
      employees: [administrator],
      projects: [realProject],
      companyInfo: { ...initialCompanyInfo, dataStorageMode: 'local' }
    });
    const writesBeforeDemo = storageWrites;

    assert.equal(await useAppStore.getState().activateDemoSandbox(), true);
    assert.equal(useAppStore.getState().demoSandboxActive, true);
    assert.equal(useAppStore.getState().projects.length, 100);
    useAppStore.getState().addProject({
      name: 'Essai temporaire', clientName: 'Client Démo', address: 'Adresse Démo', latitude: 51,
      longitude: -114, radius: 100, assignedEmployees: [administrator.id], status: 'active'
    });
    assert.equal(useAppStore.getState().projects.length, 101);
    assert.equal(networkCalls, 0, 'aucun fetch ne doit partir pendant le mode démo');
    assert.equal(storageWrites, writesBeforeDemo, 'aucune donnée démo ne doit aller dans localStorage');

    await useAppStore.getState().deactivateDemoSandbox();
    assert.equal(useAppStore.getState().demoSandboxActive, false);
    assert.deepEqual(useAppStore.getState().projects, [realProject]);
    assert.equal(networkCalls, 0, 'la restauration locale ne doit pas déclencher de requête réseau');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
