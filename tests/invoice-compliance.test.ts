import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkInvoiceCompliance,
  checkProjectClosure,
  complianceSummary,
  openTasksOf,
  projectIdsForInvoice
} from '../src/invoiceCompliance';
import type { Invoice, Project, ProjectTask, PunchSession } from '../src/types';

function task(overrides: Partial<ProjectTask> = {}): ProjectTask {
  return {
    id: 't1',
    text: 'Poser le solin du côté nord',
    done: false,
    priority: 'normal',
    createdAt: '2026-08-01T12:00:00.000Z',
    ...overrides
  };
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'c1',
    name: '335 Grégoire Crescent',
    clientName: 'Constructions Beaulieu',
    address: '335 Grégoire Crescent',
    latitude: 56.72,
    longitude: -111.38,
    radius: 100,
    assignedEmployees: ['e1'],
    status: 'active',
    tasks: [],
    tools: [],
    ...overrides
  };
}

function punch(overrides: Partial<PunchSession> = {}): PunchSession {
  return {
    id: 'p1',
    employeeId: 'e1',
    employeeName: 'Léa Tremblay',
    projectId: 'c1',
    projectName: '335 Grégoire Crescent',
    payMode: 'horaire',
    rate: 42,
    startTime: '2026-08-10T13:00:00.000Z',
    endTime: '2026-08-10T21:00:00.000Z',
    pausedAt: null,
    totalPauseMinutes: 0,
    withinGeofence: true,
    revenue: 336,
    totalWorkedHours: 8,
    ...overrides
  } as PunchSession;
}

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'i1',
    employeeId: 'e1',
    employeeName: 'Léa Tremblay',
    invoiceNumber: 'INV-0001',
    date: '2026-08-11',
    sessionIds: ['p1'],
    totalHours: 8,
    amount: 336,
    gstAmount: 16.8,
    qstAmount: 0,
    totalWithTaxes: 352.8,
    status: 'draft',
    taxIncluded: false,
    ...overrides
  } as Invoice;
}

// ---------------------------------------------------------------------------
// La règle demandée : toutes les tâches cochées pour que la facture parte
// ---------------------------------------------------------------------------

test('une tâche ouverte empêche la facture de partir', () => {
  const result = checkInvoiceCompliance(
    invoice(),
    [punch()],
    [project({ tasks: [task({ id: 'a' }), task({ id: 'b', done: true })] })]
  );
  assert.equal(result.ready, false);
  assert.equal(result.totalOpenTasks, 1);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].projectName, '335 Grégoire Crescent');
  assert.equal(result.groups[0].openTasks[0].id, 'a');
});

test('toutes les tâches cochées ouvrent la porte', () => {
  const result = checkInvoiceCompliance(
    invoice(),
    [punch()],
    [project({ tasks: [task({ id: 'a', done: true }), task({ id: 'b', done: true })] })]
  );
  assert.equal(result.ready, true);
  assert.equal(result.totalOpenTasks, 0);
  assert.deepEqual(result.groups, []);
});

test('un chantier sans aucune tâche ne bloque rien', () => {
  // Beaucoup de petits travaux n'ont pas de liste. Exiger une liste vide
  // empêcherait toute facturation sur ces chantiers-là.
  const sansListe = checkInvoiceCompliance(invoice(), [punch()], [project({ tasks: [] })]);
  assert.equal(sansListe.ready, true);

  const listeAbsente = checkInvoiceCompliance(invoice(), [punch()], [project({ tasks: undefined })]);
  assert.equal(listeAbsente.ready, true);
});

test('seuls les chantiers réellement couverts par la facture comptent', () => {
  const projects = [
    project({ id: 'c1', tasks: [task({ id: 'a', done: true })] }),
    project({ id: 'c2', name: 'Autre chantier', tasks: [task({ id: 'b' })] })
  ];
  const punches = [
    punch({ id: 'p1', projectId: 'c1' }),
    punch({ id: 'p2', projectId: 'c2' })
  ];
  // La facture ne couvre que le pointage p1, donc que le chantier c1.
  const result = checkInvoiceCompliance(invoice({ sessionIds: ['p1'] }), punches, projects);
  assert.equal(result.ready, true, 'une tâche ouverte sur un autre chantier ne bloque pas');
  assert.deepEqual(result.projectIds, ['c1']);
});

test('une facture couvrant deux chantiers additionne ce qui reste', () => {
  const projects = [
    project({ id: 'c1', tasks: [task({ id: 'a' })] }),
    project({ id: 'c2', name: 'Autre chantier', tasks: [task({ id: 'b' }), task({ id: 'c' })] })
  ];
  const punches = [punch({ id: 'p1', projectId: 'c1' }), punch({ id: 'p2', projectId: 'c2' })];
  const result = checkInvoiceCompliance(invoice({ sessionIds: ['p1', 'p2'] }), punches, projects);
  assert.equal(result.ready, false);
  assert.equal(result.totalOpenTasks, 3);
  assert.equal(result.groups.length, 2);
});

test('les tâches critiques restantes sont comptées à part', () => {
  const result = checkInvoiceCompliance(
    invoice(),
    [punch()],
    [project({ tasks: [task({ id: 'a', priority: 'critique' }), task({ id: 'b' })] })]
  );
  assert.equal(result.groups[0].criticalCount, 1);
});

test('un chantier supprimé est signalé mais ne piège pas le travailleur', () => {
  // Le travailleur ne peut rien faire d'une ligne effacée par le bureau : on ne
  // retient pas sa facture pour ça.
  const result = checkInvoiceCompliance(invoice(), [punch({ projectId: 'disparu' })], []);
  assert.equal(result.ready, true);
  assert.deepEqual(result.unknownProjectIds, ['disparu']);
});

test('une facture sans pointage rattaché ne bloque pas', () => {
  const result = checkInvoiceCompliance(invoice({ sessionIds: [] }), [punch()], [project({ tasks: [task()] })]);
  assert.equal(result.ready, true);
  assert.deepEqual(result.projectIds, []);
});

test('le résumé dit exactement ce qui manque, dans les deux langues', () => {
  const unSeul = checkInvoiceCompliance(invoice(), [punch()], [project({ tasks: [task()] })]);
  assert.equal(complianceSummary(unSeul, 'FR'), '1 tâche à terminer sur « 335 Grégoire Crescent ».');
  assert.equal(complianceSummary(unSeul, 'EN'), '1 task left on “335 Grégoire Crescent”.');

  const plusieurs = checkInvoiceCompliance(
    invoice({ sessionIds: ['p1', 'p2'] }),
    [punch({ id: 'p1', projectId: 'c1' }), punch({ id: 'p2', projectId: 'c2' })],
    [
      project({ id: 'c1', tasks: [task({ id: 'a' })] }),
      project({ id: 'c2', name: 'Autre', tasks: [task({ id: 'b' })] })
    ]
  );
  assert.equal(complianceSummary(plusieurs, 'FR'), '2 tâches à terminer sur 2 chantiers.');
  assert.equal(complianceSummary(plusieurs, 'EN'), '2 tasks left across 2 sites.');

  const pret = checkInvoiceCompliance(invoice(), [punch()], [project({ tasks: [] })]);
  assert.match(complianceSummary(pret, 'FR'), /cochées/);
  assert.match(complianceSummary(pret, 'EN'), /checked/);
});

test('openTasksOf ne retient que ce qui n’est pas fait', () => {
  assert.equal(openTasksOf({ tasks: [task({ done: true }), task({ id: 'b' })] }).length, 1);
  assert.equal(openTasksOf({ tasks: undefined }).length, 0);
});

test('projectIdsForInvoice ne répète pas un chantier', () => {
  const punches = [punch({ id: 'p1', projectId: 'c1' }), punch({ id: 'p2', projectId: 'c1' })];
  assert.deepEqual(projectIdsForInvoice({ sessionIds: ['p1', 'p2'] }, punches), ['c1']);
});

// ---------------------------------------------------------------------------
// Fermeture du chantier
// ---------------------------------------------------------------------------

test('un chantier dont tout est coché et fermé peut être terminé', () => {
  const result = checkProjectClosure(
    project({ tasks: [task({ done: true })] }),
    [punch()],
    [invoice({ status: 'paid' })]
  );
  assert.equal(result.ready, true);
  assert.deepEqual(result.openTasks, []);
  assert.deepEqual(result.openPunches, []);
});

test('une tâche ouverte empêche de fermer le chantier', () => {
  const result = checkProjectClosure(project({ tasks: [task()] }), [punch()], []);
  assert.equal(result.ready, false);
  assert.equal(result.openTasks.length, 1);
});

test('un pointage encore en cours empêche de fermer le chantier', () => {
  // Fermer sous les pieds de quelqu'un qui travaille fausserait ses heures.
  const result = checkProjectClosure(
    project({ tasks: [task({ done: true })] }),
    [punch({ id: 'ouvert', endTime: null })],
    []
  );
  assert.equal(result.ready, false);
  assert.equal(result.openPunches.length, 1);
  assert.equal(result.openPunches[0].id, 'ouvert');
});

test('une facture impayée est signalée mais ne bloque jamais la fermeture', () => {
  // Le paiement dépend du client : un entrepreneur doit pouvoir clore ses
  // travaux avant d'être payé.
  const result = checkProjectClosure(
    project({ tasks: [task({ done: true })] }),
    [punch()],
    [invoice({ id: 'i1', status: 'pending' }), invoice({ id: 'i2', status: 'draft' })]
  );
  assert.equal(result.ready, true);
  assert.equal(result.unpaidInvoices.length, 1);
  assert.equal(result.draftInvoices.length, 1);
});

test('les factures d’un autre chantier ne sont pas comptées', () => {
  const punches = [punch({ id: 'p1', projectId: 'c1' }), punch({ id: 'p2', projectId: 'c2' })];
  const result = checkProjectClosure(
    project({ id: 'c1', tasks: [] }),
    punches,
    [invoice({ id: 'ailleurs', status: 'draft', sessionIds: ['p2'] })]
  );
  assert.equal(result.draftInvoices.length, 0);
  assert.equal(result.ready, true);
});
