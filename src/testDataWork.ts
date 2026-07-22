import type { GCPDocument, Invoice, PayrollPayment, PunchSession } from './types';
import { TEST_EMPLOYEES } from './testProfiles';
import {
  TEST_CLIENTS, TEST_PERIOD_END, TEST_PERIOD_START, TEST_PROJECT_META, isTestEmployeeActiveOn
} from './testDataCore';

const round2 = (value: number) => Math.round(value * 100) / 100;
const asDate = (date: string) => new Date(`${date}T12:00:00Z`);
const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: string, days: number) => {
  const value = asDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return dateOnly(value);
};
const minDate = (a: string, b: string) => (a < b ? a : b);
const monthKey = (date: string) => date.slice(0, 7);
const mondayOf = (date: string) => {
  const value = asDate(date);
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - day + 1);
  return dateOnly(value);
};

function randomGenerator(seed = 20260719) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}
const random = randomGenerator();

function weekdays(start: string, end: string): string[] {
  const result: string[] = [];
  const cursor = asDate(start);
  const stop = asDate(end);
  while (cursor <= stop) {
    if (![0, 6].includes(cursor.getUTCDay())) result.push(dateOnly(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

const contractorRates: Record<string, number> = {
  'test-contractor-1': 2.95,
  'test-contractor-2': 2.7,
  'test-contractor-3': 3.15
};

function buildPunchSessions(): PunchSession[] {
  const sessions: PunchSession[] = [];
  let sequence = 1;

  TEST_PROJECT_META.filter(project => project.id !== 'test-project-admin').forEach(project => {
    const days = weekdays(project.start, minDate(project.end, TEST_PERIOD_END));
    if (!days.length) return;
    const targetCost = project.subtotal * (project.commercial ? 0.205 : 0.225);
    let cost = 0;
    let iteration = 0;
    const maxIterations = days.length * Math.max(2, project.assignedEmployees.length) * 3;

    while (cost < targetCost && iteration < maxIterations) {
      const day = days[Math.floor(iteration / Math.max(1, project.assignedEmployees.length)) % days.length];
      const employeeId = project.assignedEmployees[iteration % project.assignedEmployees.length];
      const employee = TEST_EMPLOYEES.find(item => item.id === employeeId);
      iteration += 1;
      if (!employee || !isTestEmployeeActiveOn(employeeId, day) || random() < 0.08) continue;

      const contractor = employeeId.startsWith('test-contractor-');
      let hours = round2(7.25 + random() * 2.25);
      const pause = random() > 0.15 ? 30 : 45;
      const startHour = random() > 0.2 ? 7 : 8;
      const startMinute = random() > 0.5 ? 0 : 15;
      const rate = contractor ? contractorRates[employeeId] : employee.hourlyRate;
      let quantity = contractor ? round2(hours * (12.5 + random() * 3.5)) : 0;
      let pay = contractor ? round2(quantity * rate) : round2(hours * rate);
      const remaining = targetCost - cost;

      if (pay > remaining && remaining > 80) {
        if (contractor) {
          quantity = round2(remaining / rate);
          pay = round2(quantity * rate);
          hours = round2(Math.max(2.5, quantity / 14));
        } else {
          hours = round2(Math.max(2.5, remaining / rate));
          pay = round2(hours * rate);
        }
      }

      const start = new Date(`${day}T${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}:00-06:00`);
      const end = new Date(start.getTime() + (hours * 60 + pause) * 60000);
      const outside = random() < 0.025;
      sessions.push({
        id: `test-punch-${String(sequence++).padStart(4, '0')}`,
        employeeId,
        employeeName: employee.name,
        projectId: project.id,
        projectName: project.name,
        payMode: contractor ? 'surface' : 'horaire',
        rate,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        pausedAt: null,
        totalPauseMinutes: pause,
        withinGeofence: !outside,
        attemptedOutsideGeofence: outside,
        outsideDetails: outside ? `${Math.round(140 + random() * 220)} m du chantier — corrigé par le contremaître` : undefined,
        surfaceMaterials: contractor ? [{ name: project.service, quantity, unitPrice: rate, emoji: '🏠' }] : undefined,
        revenue: pay,
        totalWorkedHours: hours
      });
      cost += pay;
    }
  });

  return sessions.sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export const TEST_PUNCH_SESSIONS = buildPunchSessions();

function buildPayrollPayments(): PayrollPayment[] {
  const result: PayrollPayment[] = [];
  let sequence = 1;
  const groups = new Map<string, { employeeId: string; employeeName: string; week: string; hours: number; amount: number; projects: string[] }>();

  TEST_PUNCH_SESSIONS.forEach(session => {
    const week = mondayOf(session.startTime.slice(0, 10));
    const key = `${session.employeeId}:${week}`;
    const group = groups.get(key) || { employeeId: session.employeeId, employeeName: session.employeeName, week, hours: 0, amount: 0, projects: [] };
    group.hours += session.totalWorkedHours || 0;
    group.amount += session.revenue;
    if (!group.projects.includes(session.projectId)) group.projects.push(session.projectId);
    groups.set(key, group);
  });

  Array.from(groups.values()).forEach(group => {
    const contractor = group.employeeId.startsWith('test-contractor-');
    const paymentDate = addDays(group.week, 11);
    result.push({
      id: `test-pay-${String(sequence++).padStart(4, '0')}`,
      employeeId: group.employeeId,
      employeeName: group.employeeName,
      projectId: group.projects[0],
      period: `Semaine du ${group.week}`,
      amount: round2(group.amount * (contractor ? 1 : 1.06)),
      status: paymentDate > '2026-06-26' ? 'approved' : 'paid',
      date: paymentDate,
      hours: round2(group.hours)
    });
  });

  ['test-admin', 'test-secretary', 'test-accountant'].forEach(employeeId => {
    const employee = TEST_EMPLOYEES.find(item => item.id === employeeId);
    if (!employee) return;
    const step = employee.payFrequency === 'weekly' ? 7 : 14;
    let start = employee.hireDate > TEST_PERIOD_START ? employee.hireDate : TEST_PERIOD_START;
    while (start <= TEST_PERIOD_END) {
      const hours = step === 7 ? 40 : 75;
      const payDate = addDays(start, step + 4);
      result.push({
        id: `test-pay-${String(sequence++).padStart(4, '0')}`,
        employeeId,
        employeeName: employee.name,
        projectId: 'test-project-admin',
        period: `${step === 7 ? 'Semaine' : 'Deux semaines'} du ${start}`,
        amount: round2(hours * employee.hourlyRate),
        status: payDate > '2026-06-26' ? 'approved' : 'paid',
        date: minDate(payDate, '2026-07-04'),
        hours
      });
      start = addDays(start, step);
    }
  });

  return result.sort((a, b) => a.date.localeCompare(b.date));
}

export const TEST_PAYROLL_PAYMENTS = buildPayrollPayments();

function buildContractorInvoices(): Invoice[] {
  const groups = new Map<string, PunchSession[]>();
  TEST_PUNCH_SESSIONS.filter(session => session.employeeId.startsWith('test-contractor-')).forEach(session => {
    const key = `${session.employeeId}:${monthKey(session.startTime)}`;
    groups.set(key, [...(groups.get(key) || []), session]);
  });

  return Array.from(groups.entries()).map(([key, sessions], index) => {
    const [employeeId, month] = key.split(':');
    const employee = TEST_EMPLOYEES.find(item => item.id === employeeId)!;
    const amount = round2(sessions.reduce((sum, session) => sum + session.revenue, 0));
    const gst = round2(amount * 0.05);
    return {
      id: `test-contractor-invoice-${String(index + 1).padStart(3, '0')}`,
      employeeId,
      employeeName: employee.name,
      invoiceNumber: `ST-${month.replace('-', '')}-${String(index + 1).padStart(3, '0')}`,
      date: `${month}-28`,
      sessionIds: sessions.map(session => session.id),
      totalHours: round2(sessions.reduce((sum, session) => sum + (session.totalWorkedHours || 0), 0)),
      amount,
      gstAmount: gst,
      qstAmount: 0,
      totalWithTaxes: round2(amount + gst),
      status: month === '2026-06' ? 'pending' : 'paid',
      notes: `Travaux de sous-traitance — ${month}`,
      taxIncluded: false,
      employeeSignedAt: `${month}-28T18:00:00.000Z`
    };
  });
}

export const TEST_INVOICES = buildContractorInvoices();

const overdueProjects = new Set(['test-project-07', 'test-project-15']);

function clientDocumentStatus(projectId: string, projectStatus: string): GCPDocument['status'] {
  if (projectStatus === 'completed') return overdueProjects.has(projectId) ? 'overdue' : 'paid';
  if (projectId === 'test-project-19') return 'accepted';
  if (projectId === 'test-project-18') return 'sent';
  return 'draft';
}

function lineItems(subtotal: number, service: string, prefix: string) {
  const materials = round2(subtotal * 0.42);
  const labour = round2(subtotal * 0.36);
  const equipment = round2(subtotal * 0.08);
  const management = round2(subtotal - materials - labour - equipment);
  return [
    { id: `${prefix}-1`, description: `Matériaux — ${service}`, qty: 1, unit: 'forfait', unitPrice: materials, total: materials },
    { id: `${prefix}-2`, description: 'Main-d’œuvre spécialisée', qty: 1, unit: 'forfait', unitPrice: labour, total: labour },
    { id: `${prefix}-3`, description: 'Équipement, accès et protection', qty: 1, unit: 'forfait', unitPrice: equipment, total: equipment },
    { id: `${prefix}-4`, description: 'Gestion, livraison et nettoyage', qty: 1, unit: 'forfait', unitPrice: management, total: management }
  ];
}

function buildDocuments(): GCPDocument[] {
  const documents: GCPDocument[] = [];
  let sequence = 1;

  TEST_PROJECT_META.filter(project => project.id !== 'test-project-admin').forEach(project => {
    const client = TEST_CLIENTS.find(item => item.id === project.clientId)!;
    const taxAmount = round2(project.subtotal * 0.05);
    const total = round2(project.subtotal + taxAmount);
    const quoteDate = addDays(project.start, -28);
    const contractDate = addDays(project.start, -14);
    const invoiceDate = project.status === 'completed' ? project.end : addDays(project.start, 14);
    const status = clientDocumentStatus(project.id, project.status);
    const received = status === 'paid' ? total : status === 'overdue' || status === 'sent' ? round2(total * 0.25) : 0;
    const common = {
      clientId: client.id, clientName: client.name, clientAddress: client.address, clientEmail: client.email,
      clientPhone: client.phone, siteAddress: project.address, isSimpleLayout: true, materialLines: [], labourLines: [],
      otherLines: [], subcontractLines: [], subtotal: project.subtotal, discountPct: 0, taxRate: 5, taxAmount, total,
      holdbackPct: project.commercial ? 10 : 0, holdbackAmount: 0,
      acceptedPayments: ['cheque', 'etransfer', 'virement'] as Array<'cheque' | 'etransfer' | 'virement' | 'cash'>,
      lateInterestPct: 2, depositPct: 25, paymentMidPct: 25, paymentFinalPct: 50,
      workStartDate: project.start, workEndDate: project.end, quoteValidDays: 30,
      permitBy: project.commercial ? 'contractor' as const : 'na' as const,
      warrantyYears: 5, hasInsurance: true, subcontractAuthorized: true, ownerName: 'Administrateur Test'
    };
    const quoteId = `test-doc-quote-${String(sequence).padStart(3, '0')}`;
    const contractId = `test-doc-contract-${String(sequence).padStart(3, '0')}`;
    const invoiceId = `test-doc-invoice-${String(sequence).padStart(3, '0')}`;

    documents.push({
      ...common, id: quoteId, type: 'quote', number: `DEV-${quoteDate.slice(0, 4)}-${String(sequence).padStart(4, '0')}`,
      date: quoteDate, dueDate: addDays(quoteDate, 30), status: 'accepted', lineItems: lineItems(project.subtotal, project.service, `${quoteId}-line`),
      depositAmount: 0, balanceDue: total, paymentsHistory: [], signedAt: `${contractDate}T18:00:00.000Z`
    });
    documents.push({
      ...common, id: contractId, type: 'contract', number: `CTR-${contractDate.slice(0, 4)}-${String(sequence).padStart(4, '0')}`,
      date: contractDate, dueDate: project.end, status: 'accepted', refQuote: quoteId,
      lineItems: lineItems(project.subtotal, project.service, `${contractId}-line`), depositAmount: round2(total * 0.25),
      balanceDue: total, contractObject: project.service,
      clauseChangeOrder: 'Toute modification doit être approuvée par écrit avant l’exécution.',
      clauseResiliation: 'Résiliation selon les travaux exécutés et les matériaux commandés.',
      clauseWarrantyDetails: 'Garantie de cinq ans sur la main-d’œuvre, sous réserve des exclusions usuelles.',
      paymentsHistory: [], signedAt: `${contractDate}T18:00:00.000Z`
    });
    documents.push({
      ...common, id: invoiceId, type: 'invoice', number: `FAC-${invoiceDate.slice(0, 4)}-${String(sequence).padStart(4, '0')}`,
      date: invoiceDate, dueDate: addDays(invoiceDate, 30), status, refQuote: quoteId, refContract: contractId,
      lineItems: lineItems(project.subtotal, project.service, `${invoiceId}-line`), depositAmount: received,
      balanceDue: round2(total - received), paymentsHistory: received ? [{
        id: `test-payment-${project.id}`, date: addDays(invoiceDate, status === 'paid' ? 12 : 2), amount: received,
        method: status === 'paid' && random() > 0.55 ? 'cheque' : 'etransfer',
        notes: status === 'paid' ? 'Paiement reçu en totalité' : 'Dépôt de démarrage reçu'
      }] : []
    });
    sequence += 1;
  });

  return documents.sort((a, b) => a.date.localeCompare(b.date));
}

export const TEST_DOCUMENTS = buildDocuments();
