import { TEST_DATASET } from './testDataset';
import type {
  ChangeOrder,
  Employee,
  ExpenseRecord,
  GCPDocument,
  HRAlert,
  InsuranceClaim,
  Invoice,
  Lead,
  MotivationGoal,
  MotivationTeam,
  PayrollPayment,
  Project,
  ProjectPhoto,
  PunchSession,
  SafetyRecord,
  ShiftAssignment,
  SupplierOrder,
  ToolAsset,
  ToolTheftReport,
  WeeklyGoal
} from './types';

const DEMO_ADMIN_ID = 'test-admin';
const DEMO_PERIOD_START = '2021-07-01';
const DEMO_PERIOD_END = '2026-08-31';
const DEMO_LATEST_STATS_MONTH = '2026-06';

const FISCAL_YEARS = [
  { code: 'fy2022', label: '2021–2022', shift: -4, factor: 0.78 },
  { code: 'fy2023', label: '2022–2023', shift: -3, factor: 0.83 },
  { code: 'fy2024', label: '2023–2024', shift: -2, factor: 0.89 },
  { code: 'fy2025', label: '2024–2025', shift: -1, factor: 0.94 },
  { code: 'fy2026', label: '2025–2026', shift: 0, factor: 1 }
] as const;

type FiscalYear = (typeof FISCAL_YEARS)[number];

export interface DemoSandboxCounts {
  employees: number;
  clients: number;
  projects: number;
  punchSessions: number;
  payrollPayments: number;
  documents: number;
  expenses: number;
  orders: number;
  projectPhotos: number;
  changeOrders: number;
  insuranceClaims: number;
  leads: number;
  shiftAssignments: number;
  safetyRecords: number;
  toolAssets: number;
  toolTheftReports: number;
  totalRows: number;
}

export interface DemoSandboxSummary {
  scenarioVersion: string;
  scenarioName: string;
  periodStart: string;
  periodEnd: string;
  latestStatsMonth: string;
  generatedAt: string;
  counts: DemoSandboxCounts;
  clientRevenue: number;
  operatingExpenses: number;
  payroll: number;
  grossMargin: number;
  workedHours: number;
}

export interface DemoSandboxDataset {
  employees: Employee[];
  projects: Project[];
  punchSessions: PunchSession[];
  invoices: Invoice[];
  catalogue: typeof TEST_DATASET.catalogue;
  suppliers: typeof TEST_DATASET.suppliers;
  inventory: typeof TEST_DATASET.inventory;
  toolAssets: ToolAsset[];
  toolTheftReports: ToolTheftReport[];
  orders: SupplierOrder[];
  clients: typeof TEST_DATASET.clients;
  hrAlerts: HRAlert[];
  documents: GCPDocument[];
  expenses: ExpenseRecord[];
  projectPhotos: ProjectPhoto[];
  changeOrders: ChangeOrder[];
  insuranceClaims: InsuranceClaim[];
  leads: Lead[];
  shiftAssignments: ShiftAssignment[];
  safetyRecords: SafetyRecord[];
  personalExpenses: ExpenseRecord[];
  payrollPayments: PayrollPayment[];
  motivationTeams: MotivationTeam[];
  motivationGoals: MotivationGoal[];
  weeklyGoals: WeeklyGoal[];
  activeEmployee: Employee;
  summary: DemoSandboxSummary;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;
const scaled = (value: number, factor: number): number => round2(Number(value || 0) * factor);
const demoId = (year: FiscalYear, id: string): string => `demo-${year.code}-${id}`;

function shiftYears(value: string | undefined | null, years: number): string | undefined {
  if (!value) return value || undefined;
  return value.replace(/20\d{2}/g, token => String(Number(token) + years));
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function mondayOf(value: string): string {
  const date = new Date(`${value}T12:00:00.000Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function employeeId(id: string, administrator: Employee): string {
  return id === DEMO_ADMIN_ID ? administrator.id : id;
}

function employeeName(id: string, fallback: string, administrator: Employee): string {
  return id === DEMO_ADMIN_ID ? administrator.name : fallback;
}

function makeSvg(label: string, color: string): string {
  const safe = label.replace(/[<>&]/g, '').slice(0, 34);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="#111827"/></linearGradient></defs><rect width="640" height="420" fill="url(#g)"/><path d="M95 286 235 166l80 72 58-54 172 148H95z" fill="#fff" opacity=".16"/><rect x="42" y="42" width="556" height="336" rx="24" fill="none" stroke="#fff" opacity=".24" stroke-width="3"/><text x="320" y="110" fill="#fff" text-anchor="middle" font-family="Arial" font-size="26" font-weight="700">MODE DÉMO</text><text x="320" y="350" fill="#fff" text-anchor="middle" font-family="Arial" font-size="20">${safe}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function buildEmployees(administrator: Employee): Employee[] {
  const employees: Employee[] = TEST_DATASET.employees.map((employee, index): Employee => ({
    ...employee,
    id: employeeId(employee.id, administrator),
    name: employeeName(employee.id, employee.name, administrator),
    nip: '',
    hireDate: shiftYears(employee.hireDate, -4) || employee.hireDate,
    hourlyRate: round2(employee.hourlyRate * (1 + (index % 3) * 0.015)),
    annualSalary: employee.annualSalary ? round2(employee.annualSalary) : undefined,
    credentials: (employee.credentials || []).map(credential => ({
      ...credential,
      id: `demo-${credential.id}`,
      issuedDate: shiftYears(credential.issuedDate, -4) || credential.issuedDate,
      expiryDate: shiftYears(credential.expiryDate, -4)
    }))
  }));

  const adminIndex = employees.findIndex(employee => employee.id === administrator.id);
  const demoAdministrator: Employee = {
    ...employees[adminIndex],
    id: administrator.id,
    name: administrator.name,
    role: 'admin',
    nip: '',
    avatar: administrator.avatar || employees[adminIndex].avatar,
    privacyNoticeVersion: administrator.privacyNoticeVersion,
    privacyNoticeAcknowledgedAt: administrator.privacyNoticeAcknowledgedAt,
    locationNoticeAcknowledgedAt: administrator.locationNoticeAcknowledgedAt
  };
  employees[adminIndex] = demoAdministrator;
  return employees;
}

function buildProjectsAndHistory(administrator: Employee) {
  const projects: Project[] = [];
  const punchSessions: PunchSession[] = [];
  const invoices: Invoice[] = [];
  const documents: GCPDocument[] = [];
  const expenses: ExpenseRecord[] = [];
  const orders: SupplierOrder[] = [];
  const payrollPayments: PayrollPayment[] = [];
  const goals: MotivationGoal[] = [];
  const projectMaps = new Map<string, Map<string, string>>();

  for (const year of FISCAL_YEARS) {
    const projectMap = new Map(TEST_DATASET.projects.map(project => [project.id, demoId(year, project.id)]));
    projectMaps.set(year.code, projectMap);
    const projectNameMap = new Map(TEST_DATASET.projects.map(project => [
      project.id,
      `${year.label} · ${project.name}`
    ]));
    const sessionMap = new Map(TEST_DATASET.punchSessions.map(session => [session.id, demoId(year, session.id)]));

    projects.push(...TEST_DATASET.projects.map(project => ({
      ...project,
      id: projectMap.get(project.id)!,
      name: projectNameMap.get(project.id)!,
      assignedEmployees: project.assignedEmployees.map(id => employeeId(id, administrator)),
      status: year.shift < 0 ? 'completed' as const : project.status,
      tasks: (project.tasks || []).map(task => ({
        ...task,
        id: demoId(year, task.id),
        done: year.shift < 0 ? true : task.done,
        createdAt: shiftYears(task.createdAt, year.shift) || task.createdAt
      })),
      tools: (project.tools || []).map(tool => ({ ...tool, id: demoId(year, tool.id), brought: true }))
    })));

    punchSessions.push(...TEST_DATASET.punchSessions.map(session => ({
      ...session,
      id: sessionMap.get(session.id)!,
      employeeId: employeeId(session.employeeId, administrator),
      employeeName: employeeName(session.employeeId, session.employeeName, administrator),
      projectId: projectMap.get(session.projectId)!,
      projectName: projectNameMap.get(session.projectId)!,
      rate: scaled(session.rate, year.factor),
      startTime: shiftYears(session.startTime, year.shift) || session.startTime,
      endTime: shiftYears(session.endTime, year.shift) || null,
      pausedAt: shiftYears(session.pausedAt, year.shift) || null,
      revenue: scaled(session.revenue, year.factor),
      surfaceMaterials: session.surfaceMaterials?.map(material => ({
        ...material,
        unitPrice: scaled(material.unitPrice, year.factor)
      }))
    })));

    invoices.push(...TEST_DATASET.invoices.map(invoice => ({
      ...invoice,
      id: demoId(year, invoice.id),
      employeeId: employeeId(invoice.employeeId, administrator),
      employeeName: employeeName(invoice.employeeId, invoice.employeeName, administrator),
      invoiceNumber: shiftYears(invoice.invoiceNumber, year.shift) || invoice.invoiceNumber,
      date: shiftYears(invoice.date, year.shift) || invoice.date,
      sessionIds: invoice.sessionIds.map(id => sessionMap.get(id)!),
      amount: scaled(invoice.amount, year.factor),
      gstAmount: scaled(invoice.gstAmount, year.factor),
      qstAmount: scaled(invoice.qstAmount, year.factor),
      totalWithTaxes: scaled(invoice.totalWithTaxes, year.factor),
      status: year.shift < 0 ? 'paid' as const : invoice.status,
      employeeSignedAt: shiftYears(invoice.employeeSignedAt, year.shift)
    })));

    documents.push(...TEST_DATASET.documents.map(document => {
      const id = demoId(year, document.id);
      const total = scaled(document.total, year.factor);
      const historicalInvoice = year.shift < 0 && document.type === 'invoice';
      const paymentsHistory = historicalInvoice
        ? [{
            id: `${id}-payment-final`,
            date: addDays(shiftYears(document.date, year.shift) || document.date, 12),
            amount: total,
            method: 'etransfer',
            notes: 'Paiement final — archive de démonstration'
          }]
        : document.paymentsHistory.map(payment => ({
            ...payment,
            id: demoId(year, payment.id),
            date: shiftYears(payment.date, year.shift) || payment.date,
            amount: scaled(payment.amount, year.factor)
          }));
      return {
        ...document,
        id,
        number: shiftYears(document.number, year.shift) || document.number,
        date: shiftYears(document.date, year.shift) || document.date,
        dueDate: shiftYears(document.dueDate, year.shift) || document.dueDate,
        status: historicalInvoice ? 'paid' as const : year.shift < 0 ? (document.type === 'quote' || document.type === 'contract' ? 'accepted' as const : document.status) : document.status,
        refQuote: document.refQuote ? demoId(year, document.refQuote) : undefined,
        refContract: document.refContract ? demoId(year, document.refContract) : undefined,
        lineItems: document.lineItems.map(line => ({
          ...line,
          id: demoId(year, line.id),
          unitPrice: scaled(line.unitPrice, year.factor),
          total: scaled(line.total, year.factor)
        })),
        materialLines: document.materialLines.map(line => ({
          ...line,
          id: demoId(year, line.id),
          unitPrice: scaled(line.unitPrice, year.factor),
          total: scaled(line.total, year.factor)
        })),
        labourLines: document.labourLines.map(line => ({
          ...line,
          id: demoId(year, line.id),
          rate: scaled(line.rate, year.factor),
          total: scaled(line.total, year.factor)
        })),
        otherLines: document.otherLines.map(line => ({ ...line, id: demoId(year, line.id), amount: scaled(line.amount, year.factor) })),
        subcontractLines: document.subcontractLines.map(line => ({ ...line, id: demoId(year, line.id), amount: scaled(line.amount, year.factor) })),
        subtotal: scaled(document.subtotal, year.factor),
        taxAmount: scaled(document.taxAmount, year.factor),
        total,
        holdbackAmount: scaled(document.holdbackAmount, year.factor),
        depositAmount: historicalInvoice ? total : scaled(document.depositAmount, year.factor),
        balanceDue: historicalInvoice ? 0 : scaled(document.balanceDue, year.factor),
        workStartDate: shiftYears(document.workStartDate, year.shift),
        workEndDate: shiftYears(document.workEndDate, year.shift),
        signedAt: shiftYears(document.signedAt, year.shift),
        ownerName: document.ownerName === 'Administrateur Test' ? administrator.name : document.ownerName,
        paymentsHistory
      };
    }));

    expenses.push(...TEST_DATASET.expenses.map(expense => ({
      ...expense,
      id: demoId(year, expense.id),
      projectId: projectMap.get(expense.projectId)!,
      amount: scaled(expense.amount, year.factor),
      tax: scaled(expense.tax, year.factor),
      date: shiftYears(expense.date, year.shift) || expense.date
    })));

    orders.push(...TEST_DATASET.orders.map(order => ({
      ...order,
      id: demoId(year, order.id),
      date: shiftYears(order.date, year.shift) || order.date,
      status: year.shift < 0 ? 'received' as const : order.status,
      items: order.items.map(item => ({ ...item, price: scaled(item.price, year.factor) })),
      totalAmount: scaled(order.totalAmount, year.factor)
    })));

    payrollPayments.push(...TEST_DATASET.payrollPayments.map(payment => ({
      ...payment,
      id: demoId(year, payment.id),
      employeeId: employeeId(payment.employeeId, administrator),
      employeeName: employeeName(payment.employeeId, payment.employeeName, administrator),
      projectId: payment.projectId ? projectMap.get(payment.projectId) : undefined,
      period: shiftYears(payment.period, year.shift) || payment.period,
      amount: scaled(payment.amount, year.factor),
      status: year.shift < 0 ? 'paid' as const : payment.status,
      date: shiftYears(payment.date, year.shift) || payment.date
    })));

    goals.push(...TEST_DATASET.motivationGoals.map(goal => ({
      ...goal,
      id: demoId(year, goal.id),
      target: goal.metric === 'revenue' ? scaled(goal.target, year.factor) : goal.target,
      current: goal.metric === 'revenue' ? scaled(goal.current, year.factor) : goal.current,
      startDate: shiftYears(goal.startDate, year.shift) || goal.startDate,
      endDate: shiftYears(goal.endDate, year.shift),
      employeeId: goal.employeeId ? employeeId(goal.employeeId, administrator) : undefined,
      status: year.shift < 0 && goal.status === 'active' ? 'achieved' as const : goal.status
    })));
  }

  return { projects, punchSessions, invoices, documents, expenses, orders, payrollPayments, goals, projectMaps };
}

function buildToolAssets(employees: Employee[], projects: Project[]): ToolAsset[] {
  const specs: Array<[string, string, string, string, number]> = [
    ['Cloueuse à charpente', 'Cloueuses', 'Paslode', 'CF325XP', 749],
    ['Cloueuse à toiture', 'Cloueuses', 'Bostitch', 'RN46-1', 429],
    ['Scie circulaire', 'Scies', 'Makita', 'XSH06', 549],
    ['Scie à onglets', 'Scies', 'DeWalt', 'DHS790', 1199],
    ['Visseuse à chocs', 'Outils sans fil', 'Milwaukee', 'M18 Fuel', 399],
    ['Perceuse à percussion', 'Outils sans fil', 'Hilti', 'SF 6H-A22', 689],
    ['Compresseur portatif', 'Air comprimé', 'Rolair', 'JC10 Plus', 449],
    ['Laser rotatif', 'Mesure', 'Bosch', 'GRL 400 HCK', 899],
    ['Niveau laser', 'Mesure', 'DeWalt', 'DW088CG', 449],
    ['Harnais antichute', 'Sécurité', '3M Protecta', '1161205', 289],
    ['Harnais antichute', 'Sécurité', '3M Protecta', '1161205', 289],
    ['Ligne de vie', 'Sécurité', 'PeakWorks', 'V8229100', 319],
    ['Échelle 28 pi', 'Accès', 'Featherlite', '6928D', 589],
    ['Échelle 32 pi', 'Accès', 'Featherlite', '6932D', 729],
    ['Échafaudage roulant', 'Accès', 'Metaltech', 'I-CISCH1', 1349],
    ['Plieuse à aluminium', 'Ferblanterie', 'Van Mark', 'Mark I 10-6', 3299],
    ['Cisaille électrique', 'Ferblanterie', 'Malco', 'TurboShear', 299],
    ['Grignoteuse', 'Ferblanterie', 'Makita', 'DJN161Z', 499],
    ['Génératrice', 'Énergie', 'Honda', 'EU2200i', 1599],
    ['Aspirateur chantier', 'Nettoyage', 'Milwaukee', 'M18 0880', 269],
    ['Caméra thermique', 'Inspection', 'FLIR', 'C5', 1099],
    ['Humidimètre', 'Inspection', 'Klein', 'ET140', 99],
    ['Tablette chantier', 'Informatique', 'Samsung', 'Tab Active4 Pro', 899],
    ['Téléphone chantier', 'Informatique', 'Samsung', 'XCover6 Pro', 649],
    ['Remorque fermée', 'Transport', 'Continental', 'VHW 7x14', 11499],
    ['Nettoyeur haute pression', 'Nettoyage', 'DeWalt', 'DXPW3400', 799],
    ['Découpeuse à béton', 'Scies', 'Stihl', 'TS 420', 1699],
    ['Cloueuse à finition', 'Cloueuses', 'Milwaukee', 'M18 2746', 529],
    ['Agrafeuse pneumatique', 'Cloueuses', 'Senco', 'SNS41', 339],
    ['Détecteur de montant', 'Mesure', 'Franklin', 'M210', 79]
  ];
  const assignable = employees.filter(employee => employee.role === 'employee' && !employee.id.startsWith('test-former-'));
  const activeProjects = projects.filter(project => project.id.includes('fy2026') && project.status === 'active');
  return specs.map((spec, index) => {
    const purchaseYear = 2021 + (index % 5);
    const assigned = index % 3 === 0 ? assignable[index % assignable.length] : undefined;
    const status: ToolAsset['status'] = index === 7 || index === 22
      ? 'stolen'
      : index === 18
        ? 'missing'
        : index % 11 === 0
          ? 'repair'
          : index % 7 === 0
            ? 'loaned'
            : index === 24
              ? 'retired'
              : 'in_service';
    return {
      id: `demo-tool-${String(index + 1).padStart(3, '0')}`,
      name: spec[0], category: spec[1], brand: spec[2], model: spec[3],
      serialNumber: `DEMO-${purchaseYear}-${String(41001 + index)}`,
      assetTag: `HX-${String(index + 1).padStart(4, '0')}`,
      purchaseDate: `${purchaseYear}-${String((index % 12) + 1).padStart(2, '0')}-15`,
      purchasePrice: spec[4], replacementValue: scaled(spec[4], 1.18),
      seller: index % 2 ? 'Home Depot Pro' : 'Hilti / fournisseur spécialisé',
      warrantyExpiry: `${purchaseYear + 3}-${String((index % 12) + 1).padStart(2, '0')}-15`,
      currentLocation: status === 'stolen' || status === 'missing'
        ? 'Emplacement inconnu'
        : activeProjects[index % Math.max(1, activeProjects.length)]?.name || 'Entrepôt Hailite',
      assignedEmployeeId: assigned?.id,
      assignedEmployeeName: assigned?.name,
      status,
      notes: status === 'in_service' ? 'Inspection préventive effectuée.' : 'Dossier fictif pour validation du registre.',
      createdAt: `${purchaseYear}-01-05T15:00:00.000Z`,
      updatedAt: '2026-08-06T15:00:00.000Z'
    };
  });
}

function theftSnapshot(tool: ToolAsset) {
  return {
    toolId: tool.id, name: tool.name, category: tool.category, brand: tool.brand, model: tool.model,
    serialNumber: tool.serialNumber, assetTag: tool.assetTag, purchaseDate: tool.purchaseDate,
    purchasePrice: tool.purchasePrice, replacementValue: tool.replacementValue,
    currentLocation: tool.currentLocation, assignedEmployeeName: tool.assignedEmployeeName,
    notes: tool.notes, hasToolPhoto: false, hasSerialPhoto: false, hasReceipt: false
  };
}

function buildToolTheftReports(tools: ToolAsset[]): ToolTheftReport[] {
  const incidents = [
    { toolIndex: 7, date: '2022-11-18', status: 'closed' as const, file: 'CPS-DEMO-2022-1841' },
    { toolIndex: 22, date: '2024-06-09', status: 'closed' as const, file: 'RCMP-DEMO-2024-0927' },
    { toolIndex: 18, date: '2025-10-21', status: 'insurance_submitted' as const, file: 'CPS-DEMO-2025-3314' }
  ];
  return incidents.map((incident, index) => {
    const tool = tools[incident.toolIndex];
    return {
      id: `demo-theft-${String(index + 1).padStart(2, '0')}`,
      incidentDate: incident.date,
      incidentTime: index === 0 ? '03:15' : '18:40',
      incidentLocation: index === 1 ? 'Stationnement du chantier, Airdrie' : 'Remorque de chantier, Calgary',
      circumstances: 'Effraction constatée lors de l’ouverture du chantier. Rapport et inventaire fictifs.',
      discoveredBy: 'Noah Gagnon', policeService: index === 1 ? 'GRC Airdrie' : 'Calgary Police Service',
      policeFileNumber: incident.file, insurer: 'Intact Assurance — scénario démo',
      insuranceClaimNumber: `DEMO-OUT-${2022 + index}-${1008 + index}`,
      contactName: 'Service des réclamations', contactPhone: '403-555-0199',
      contactEmail: 'reclamations.test@example.com', toolIds: [tool.id], toolSnapshots: [theftSnapshot(tool)],
      totalReplacementValue: tool.replacementValue, status: incident.status,
      createdAt: `${incident.date}T16:00:00.000Z`, updatedAt: `${incident.date}T19:00:00.000Z`
    };
  });
}

function buildPhotos(projects: Project[], administrator: Employee): ProjectPhoto[] {
  const phases: Array<ProjectPhoto['phase']> = ['before', 'during', 'after'];
  const colors = ['#9A3412', '#0369A1', '#166534'];
  return projects
    .filter(project => !project.id.endsWith('test-project-admin'))
    .flatMap((project, projectIndex) => {
      const baseDate = project.tasks?.[0]?.createdAt?.slice(0, 10) || `${2021 + Math.floor(projectIndex / 20)}-07-01`;
      return phases.map((phase, phaseIndex) => ({
        id: `${project.id}-photo-${phase}`,
        projectId: project.id,
        phase,
        imageUrl: makeSvg(`${phase.toUpperCase()} · ${project.name}`, colors[phaseIndex]),
        caption: phase === 'before' ? 'État initial documenté' : phase === 'during' ? 'Progression des travaux' : 'Inspection finale terminée',
        takenAt: `${addDays(baseDate, phaseIndex * 8)}T16:30:00.000Z`,
        takenById: administrator.id,
        takenByName: administrator.name,
        latitude: project.latitude,
        longitude: project.longitude
      }));
    });
}

function buildChangeOrders(projects: Project[], administrator: Employee): ChangeOrder[] {
  return projects
    .filter((project, index) => !project.id.endsWith('test-project-admin') && index % 2 === 0)
    .map((project, index) => {
      const latest = project.id.includes('fy2026');
      const baseDate = project.tasks?.[0]?.createdAt?.slice(0, 10) || '2026-01-10';
      const status: ChangeOrder['status'] = latest && index % 4 === 0 ? 'pending' : latest && index % 3 === 0 ? 'approved' : 'invoiced';
      const createdAt = `${addDays(baseDate, 9)}T19:15:00.000Z`;
      return {
        id: `${project.id}-change-${String(index + 1).padStart(2, '0')}`,
        projectId: project.id,
        number: `OC-${project.id.match(/fy(\d{4})/)?.[1] || '2026'}-${String(index + 1).padStart(3, '0')}`,
        description: index % 3 === 0 ? 'Remplacement de contreplaqué détérioré' : index % 3 === 1 ? 'Solins et ventilation supplémentaires' : 'Réparation de membrane non prévue',
        reason: 'Condition cachée découverte après la dépose.',
        amount: round2(875 + (index % 9) * 485),
        status,
        createdAt,
        createdById: administrator.id,
        createdByName: administrator.name,
        clientName: project.clientName,
        signedAt: status === 'pending' ? undefined : `${addDays(createdAt, 1)}T14:00:00.000Z`
      };
    });
}

function buildInsuranceClaims(projects: Project[], administrator: Employee): InsuranceClaim[] {
  return projects
    .filter((project, index) => !project.id.endsWith('test-project-admin') && (project.name.toLowerCase().includes('grêle') || index % 13 === 0))
    .map((project, index) => {
      const latest = project.id.includes('fy2026');
      const rcv = round2(28500 + (index % 8) * 4750);
      const baseDate = project.tasks?.[0]?.createdAt?.slice(0, 10) || '2026-04-01';
      return {
        id: `${project.id}-claim-${String(index + 1).padStart(2, '0')}`,
        projectId: project.id,
        insurer: ['Intact Assurance', 'Aviva Canada', 'Wawanesa'][index % 3],
        claimNumber: `DEMO-CLAIM-${project.id.match(/fy(\d{4})/)?.[1]}-${String(1200 + index)}`,
        policyNumber: `POL-DEMO-${81000 + index}`,
        lossType: index % 4 === 0 ? 'wind' : 'hail',
        lossDate: addDays(baseDate, -21),
        adjusterName: ['Mélanie Gervais', 'Andrew Collins', 'Samira Khan'][index % 3],
        adjusterPhone: `403-555-${String(3100 + index).padStart(4, '0')}`,
        adjusterEmail: `expert${index + 1}.test@example.com`,
        deductible: index % 2 ? 2500 : 1500,
        acv: scaled(rcv, 0.72), rcv, supplementAmount: round2(850 + (index % 5) * 525),
        approvedAmount: latest && index % 2 === 0 ? scaled(rcv, 0.86) : rcv,
        status: latest && index % 2 === 0 ? 'partial' : latest ? 'approved' : 'closed',
        notes: 'Réclamation entièrement fictive pour tester le suivi assurance.',
        createdAt: `${addDays(baseDate, -18)}T16:00:00.000Z`,
        createdById: administrator.id,
        createdByName: administrator.name
      };
    });
}

function fiscalDate(year: FiscalYear, monthIndex: number, day: number): string {
  const startYear = 2025 + year.shift;
  const zeroBasedMonth = 6 + monthIndex;
  const calendarYear = startYear + Math.floor(zeroBasedMonth / 12);
  const month = (zeroBasedMonth % 12) + 1;
  return `${calendarYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function buildLeads(projectMaps: Map<string, Map<string, string>>, administrator: Employee): Lead[] {
  const firstNames = ['Alex', 'Mélanie', 'Ravi', 'Sarah', 'Olivier', 'Nadia', 'Lucas', 'Priya', 'Thomas', 'Chloé', 'David', 'Amina', 'Gabriel', 'Sofia', 'Michael', 'Élodie', 'Jason', 'Camille'];
  const lastNames = ['Caron', 'Singh', 'Beaulieu', 'Martin', 'Roy', 'Nguyen', 'Wilson', 'Gagnon', 'Brown', 'Fortin', 'Johnson', 'Haddad', 'Tremblay', 'Chen', 'Bouchard', 'Evans', 'Pelletier', 'Brooks'];
  const sources: Lead['source'][] = ['referral', 'phone', 'website', 'door', 'repeat', 'insurance', 'other'];
  const currentStatuses: Lead['status'][] = ['won', 'lost', 'quoted', 'inspection', 'contacted', 'new'];
  const projectIds = TEST_DATASET.projects.filter(project => !project.id.endsWith('project-admin')).map(project => project.id);
  const clientIds = TEST_DATASET.clients.filter(client => client.id !== 'test-client-company').map(client => client.id);
  const result: Lead[] = [];
  FISCAL_YEARS.forEach((year, yearIndex) => {
    const projectMap = projectMaps.get(year.code)!;
    for (let index = 0; index < 18; index += 1) {
      const status: Lead['status'] = year.shift < 0 ? (index % 3 === 0 ? 'lost' : 'won') : currentStatuses[index % currentStatuses.length];
      const createdAt = fiscalDate(year, index % 12, 4 + (index % 20));
      const projectId = projectMap.get(projectIds[index % projectIds.length]);
      result.push({
        id: `demo-${year.code}-lead-${String(index + 1).padStart(2, '0')}`,
        name: `${firstNames[(index + yearIndex) % firstNames.length]} ${lastNames[(index * 2 + yearIndex) % lastNames.length]}`,
        phone: `403-555-${String(5000 + yearIndex * 100 + index).padStart(4, '0')}`,
        email: `prospect.${yearIndex + 1}.${index + 1}.test@example.com`,
        address: `${120 + index * 7} Demo Avenue, Calgary, AB`,
        source: sources[(index + yearIndex) % sources.length], status,
        estimatedValue: scaled(14500 + (index % 7) * 8950, year.factor),
        nextFollowUp: ['new', 'contacted', 'inspection', 'quoted'].includes(status) ? addDays(createdAt, 7) : undefined,
        notes: 'Prospect fictif généré pour le scénario de cinq ans.',
        lostReason: status === 'lost' ? (index % 2 ? 'Échéancier incompatible' : 'Concurrent retenu') : undefined,
        createdAt: `${createdAt}T15:00:00.000Z`,
        createdById: administrator.id, createdByName: administrator.name,
        convertedClientId: status === 'won' ? clientIds[index % clientIds.length] : undefined,
        convertedProjectId: status === 'won' ? projectId : undefined
      });
    }
  });
  return result;
}

function buildShiftAssignments(projects: Project[], employees: Employee[], administrator: Employee): ShiftAssignment[] {
  const activeProjects = projects.filter(project => project.id.includes('fy2026') && project.status === 'active' && !project.id.endsWith('test-project-admin'));
  const workers = employees.filter(employee => employee.role === 'employee' && !employee.id.startsWith('test-former-'));
  const start = mondayOf('2026-08-06');
  const result: ShiftAssignment[] = [];
  for (let dayOffset = 0; dayOffset < 19; dayOffset += 1) {
    const date = addDays(start, dayOffset);
    const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    workers.forEach((worker, workerIndex) => {
      const project = activeProjects[(workerIndex + dayOffset) % activeProjects.length];
      result.push({
        id: `demo-shift-${date}-${worker.id}`,
        date, projectId: project.id, employeeId: worker.id, employeeName: worker.name,
        note: workerIndex % 4 === 0 ? 'Départ de l’entrepôt à 7 h' : undefined,
        createdAt: '2026-08-01T15:00:00.000Z', createdById: administrator.id, createdByName: administrator.name
      });
    });
  }
  return result;
}

function buildSafetyRecords(projects: Project[], employees: Employee[], administrator: Employee): SafetyRecord[] {
  const names = new Map(employees.map(employee => [employee.id, employee.name]));
  const signature = makeSvg('SIGNATURE DÉMO', '#1D4ED8');
  return projects
    .filter(project => !project.id.endsWith('test-project-admin'))
    .flatMap((project, index) => {
      const baseDate = project.tasks?.[0]?.createdAt?.slice(0, 10) || '2026-01-05';
      const attendees = project.assignedEmployees.slice(0, 4).map((id, attendeeIndex) => ({
        employeeId: id,
        employeeName: names.get(id) || 'Travailleur Démo',
        signature: attendeeIndex % 3 === 2 ? undefined : signature,
        signedAt: attendeeIndex % 3 === 2 ? undefined : `${baseDate}T14:05:00.000Z`
      }));
      return [
        {
          id: `${project.id}-safety-hazard`, type: 'hazard' as const, projectId: project.id, date: baseDate,
          topic: 'Analyse des dangers avant travaux',
          hazards: ['Travail en hauteur', 'Chute d’objets', index % 2 ? 'Vent fort' : 'Accès par échelle'],
          controls: 'Périmètre balisé, harnais inspectés et point d’ancrage confirmé.',
          weather: index % 3 === 0 ? 'Nuageux, vent 25 km/h' : 'Dégagé, vent faible',
          notes: 'Fiche fictive pour essai du registre OH&S.', attendees,
          createdAt: `${baseDate}T13:55:00.000Z`, createdById: administrator.id, createdByName: administrator.name
        },
        {
          id: `${project.id}-safety-toolbox`, type: 'toolbox' as const, projectId: project.id, date: addDays(baseDate, 7),
          topic: index % 2 ? 'Manutention des panneaux et communication' : 'Protection antichute et inspection quotidienne',
          notes: 'Causerie fictive documentée avant le quart.', attendees,
          createdAt: `${addDays(baseDate, 7)}T13:45:00.000Z`, createdById: administrator.id, createdByName: administrator.name
        }
      ];
    });
}

function buildPersonalExpenses(projectMaps: Map<string, Map<string, string>>, administrator: Employee): ExpenseRecord[] {
  const result: ExpenseRecord[] = [];
  FISCAL_YEARS.forEach((year, yearIndex) => {
    const adminProject = projectMaps.get(year.code)!.get('test-project-admin')!;
    for (let month = 0; month < 12; month += 1) {
      const date = fiscalDate(year, month, 9);
      result.push({
        id: `demo-${year.code}-personal-fuel-${month + 1}`,
        provider: 'Petro-Canada — reçu personnel fictif', category: 'fuel', projectId: adminProject,
        amount: scaled(72 + (month % 4) * 11, year.factor), tax: scaled(3.6 + (month % 4) * 0.55, year.factor),
        date, notes: 'Déplacement professionnel — scénario démo',
        submittedById: administrator.id, submittedByName: administrator.name
      });
      result.push({
        id: `demo-${year.code}-personal-tools-${month + 1}`,
        provider: month % 2 ? 'Home Depot Pro' : 'RONA+', category: month % 3 === 0 ? 'tools' : 'other', projectId: adminProject,
        amount: scaled(38 + (month % 5) * 17, year.factor), tax: scaled(1.9 + (month % 5) * 0.85, year.factor),
        date: addDays(date, 8), notes: 'Petit achat remboursable fictif',
        submittedById: administrator.id, submittedByName: administrator.name
      });
    }
    if (yearIndex === 4) result[result.length - 1].notes = 'Reçu courant à vérifier — scénario démo';
  });
  return result;
}

function buildHrAlerts(administrator: Employee): HRAlert[] {
  return FISCAL_YEARS.flatMap((year, index) => [
    {
      id: `demo-${year.code}-hr-safety`, type: 'info' as const,
      title: `Bilan sécurité ${year.label}`, message: 'Révision annuelle des formations et équipements terminée.',
      date: fiscalDate(year, 9, 12), resolved: true
    },
    {
      id: `demo-${year.code}-hr-wcb`, type: index === 4 ? 'warning' as const : 'info' as const,
      title: `Révision WCB ${year.label}`, message: index === 4 ? 'Vérification annuelle à compléter avant la prochaine paie.' : 'Dossier annuel vérifié et archivé.',
      date: fiscalDate(year, 11, 20), resolved: index < 4
    },
    {
      id: `demo-${year.code}-hr-training`, type: index === 4 ? 'warning' as const : 'info' as const,
      title: `Formation antichute ${year.label}`, message: index === 4 ? 'Deux renouvellements arrivent à échéance.' : 'Renouvellements effectués.',
      date: fiscalDate(year, 10, 18), employeeId: administrator.id, employeeName: administrator.name, resolved: index < 4
    }
  ]);
}

function countRows(dataset: Omit<DemoSandboxDataset, 'summary'>): DemoSandboxCounts {
  const counts = {
    employees: dataset.employees.length,
    clients: dataset.clients.length,
    projects: dataset.projects.length,
    punchSessions: dataset.punchSessions.length,
    payrollPayments: dataset.payrollPayments.length,
    documents: dataset.documents.length,
    expenses: dataset.expenses.length,
    orders: dataset.orders.length,
    projectPhotos: dataset.projectPhotos.length,
    changeOrders: dataset.changeOrders.length,
    insuranceClaims: dataset.insuranceClaims.length,
    leads: dataset.leads.length,
    shiftAssignments: dataset.shiftAssignments.length,
    safetyRecords: dataset.safetyRecords.length,
    toolAssets: dataset.toolAssets.length,
    toolTheftReports: dataset.toolTheftReports.length
  };
  return { ...counts, totalRows: Object.values(counts).reduce((sum, value) => sum + value, 0) };
}

export function createFiveYearDemoDataset(authenticatedAdministrator: Employee): DemoSandboxDataset {
  if (authenticatedAdministrator.role !== 'admin') {
    throw new Error('Le mode démo de cinq ans est réservé à un administrateur authentifié.');
  }

  const employees = buildEmployees(authenticatedAdministrator);
  const activeEmployee = employees.find(employee => employee.id === authenticatedAdministrator.id)!;
  const history = buildProjectsAndHistory(activeEmployee);
  const latestProjectMap = history.projectMaps.get('fy2026')!;
  const motivationTeams: MotivationTeam[] = TEST_DATASET.motivationTeams.map(team => ({
    ...team,
    id: `demo-${team.id}`,
    memberIds: team.memberIds.map(id => employeeId(id, activeEmployee)),
    leaderId: team.leaderId ? employeeId(team.leaderId, activeEmployee) : undefined,
    projectIds: team.projectIds?.map(id => latestProjectMap.get(id)!).filter(Boolean),
    createdAt: shiftYears(team.createdAt, -4) || team.createdAt
  }));
  const teamMap = new Map(TEST_DATASET.motivationTeams.map((team, index) => [team.id, motivationTeams[index].id]));
  const motivationGoals = history.goals.map(goal => ({ ...goal, teamId: goal.teamId ? teamMap.get(goal.teamId) : undefined }));
  const weeklyGoals: WeeklyGoal[] = TEST_DATASET.weeklyGoals.map(goal => ({
    ...goal,
    employeeId: employeeId(goal.employeeId, activeEmployee),
    weekStart: '2026-08-03',
    lastPunchDate: goal.lastPunchDate ? '2026-08-05' : null
  }));
  const toolAssets = buildToolAssets(employees, history.projects);
  const projectPhotos = buildPhotos(history.projects, activeEmployee);
  const changeOrders = buildChangeOrders(history.projects, activeEmployee);
  const insuranceClaims = buildInsuranceClaims(history.projects, activeEmployee);
  const leads = buildLeads(history.projectMaps, activeEmployee);
  const shiftAssignments = buildShiftAssignments(history.projects, employees, activeEmployee);
  const safetyRecords = buildSafetyRecords(history.projects, employees, activeEmployee);
  const personalExpenses = buildPersonalExpenses(history.projectMaps, activeEmployee);

  const withoutSummary: Omit<DemoSandboxDataset, 'summary'> = {
    employees,
    projects: history.projects,
    punchSessions: history.punchSessions,
    invoices: history.invoices,
    catalogue: TEST_DATASET.catalogue.map(item => ({ ...item })),
    suppliers: TEST_DATASET.suppliers.map(item => ({ ...item })),
    inventory: TEST_DATASET.inventory.map(item => ({ ...item })),
    toolAssets,
    toolTheftReports: buildToolTheftReports(toolAssets),
    orders: history.orders,
    clients: TEST_DATASET.clients.map(item => ({ ...item })),
    hrAlerts: buildHrAlerts(activeEmployee),
    documents: history.documents,
    expenses: history.expenses,
    projectPhotos,
    changeOrders,
    insuranceClaims,
    leads,
    shiftAssignments,
    safetyRecords,
    personalExpenses,
    payrollPayments: history.payrollPayments,
    motivationTeams,
    motivationGoals,
    weeklyGoals,
    activeEmployee
  };
  const clientRevenue = round2(history.documents.filter(document => document.type === 'invoice').reduce((sum, document) => sum + document.subtotal, 0));
  const operatingExpenses = round2(history.expenses.reduce((sum, expense) => sum + expense.amount + expense.tax, 0));
  const payroll = round2(history.payrollPayments.reduce((sum, payment) => sum + payment.amount, 0));
  const workedHours = round2(history.punchSessions.reduce((sum, session) => sum + (session.totalWorkedHours || 0), 0));
  const summary: DemoSandboxSummary = {
    scenarioVersion: '2026.08-five-year-sandbox-v1',
    scenarioName: 'Entreprise fictive — cinq exercices complets et opérations courantes',
    periodStart: DEMO_PERIOD_START,
    periodEnd: DEMO_PERIOD_END,
    latestStatsMonth: DEMO_LATEST_STATS_MONTH,
    generatedAt: '2026-08-06T15:00:00.000Z',
    counts: countRows(withoutSummary),
    clientRevenue,
    operatingExpenses,
    payroll,
    grossMargin: round2(clientRevenue - operatingExpenses - payroll),
    workedHours
  };
  return { ...withoutSummary, summary };
}
