import { create } from 'zustand';
import { registerBackupSnapshotProvider, scheduleConfiguredBackup } from './personalBackup';
import {
  Employee, Project, PunchSession, Invoice, CatalogueMaterial,
  InventoryItem, ToolAsset, ToolTheftReport, SupplierOrder, Supplier, Client, CompanyInfo, HRAlert, EmployeeRole, PayMode, VisualTheme,
  WeeklyGoal, MotivationTeam, MotivationGoal,
  GCPDocument, GCPDocumentLineItem, GCPDocumentMaterialLine, GCPDocumentLabourLine, GCPDocumentOtherLine, GCPDocumentSubcontractLine, GCPDocumentPaymentHistoryEntry,
  ExpenseRecord, PayrollPayment, ProjectPhoto, ChangeOrder, InsuranceClaim, Lead, ShiftAssignment,
  SafetyRecord, PunchCorrection
} from './types';
import {
  genId, syncInsert, syncUpsert, syncUpdate, syncDelete, syncDocumentLines, syncDocumentInsert, syncOrderItems, hydrateFromCloud, getCompanyId, msSinceLastMutation,
  authLogin, authLogout, fetchLoginDirectory, normalizeAppRole, setCloudSyncAllowed, savePrivacyNoticeAcknowledgement,
  submitCredential, reviewCredential,
  isDemoSandboxIsolationActive, setDemoSandboxIsolation,
  syncProjectInsert, syncProjectChildren,
  employeeToRow, projectToRow, punchToRow, invoiceToRow, supplierToRow, catalogueToRow, inventoryToRow, toolAssetToRow, toolTheftReportToRow,
  supplierOrderToRow, clientToRow, companyInfoToRow, weeklyGoalToRow, motivationTeamToRow, motivationGoalToRow,
  hrAlertToRow, expenseToRow, payrollPaymentToRow, documentToRow, documentPaymentToRow,
  projectPhotoToRow, rowToProjectPhoto, changeOrderToRow, rowToChangeOrder,
  insuranceClaimToRow, rowToInsuranceClaim, leadToRow, rowToLead,
  shiftAssignmentToRow, rowToShiftAssignment, safetyRecordToRow, rowToSafetyRecord,
  rowToEmployee, rowToProject, rowToPunch, rowToInvoice, rowToSupplier, rowToCatalogue, rowToInventory, rowToToolAsset, rowToToolTheftReport,
  rowToSupplierOrder, rowToClient, rowToCompanyInfo, rowToWeeklyGoal, rowToMotivationTeam, rowToMotivationGoal,
  rowToHRAlert, rowToExpense, rowToPayrollPayment, rowToDocument
} from './apiClient';
import { LOCAL_TEST_MODE, TEST_EMPLOYEES } from './testProfiles';
import { browserStorageValue, readStoragePersistence } from './securityStorage';
import { hashAccessCode, verifyAccessCode } from './localAuth';
import type { DemoSandboxSummary } from './demoSandbox';
import { USER_PRIVACY_NOTICE_VERSION } from '../privacyVersions';
import { applyReview, buildSubmittedCredential, type SubmissionInput } from '../credentialVerification';
import { resolveOnboardingState } from './onboardingState';
import { resolveViewerProfile } from './viewerProfile';
import { todayKey, localDayKey, setAppTimeZone } from './localTime';
import { punchDayKeys, recomputePunchTotals } from './punchHours';

interface AppState {
  // Data State
  employees: Employee[];
  projects: Project[];
  punchSessions: PunchSession[];
  invoices: Invoice[];
  catalogue: CatalogueMaterial[];
  suppliers: Supplier[];
  inventory: InventoryItem[];
  toolAssets: ToolAsset[];
  toolTheftReports: ToolTheftReport[];
  orders: SupplierOrder[];
  clients: Client[];
  companyInfo: CompanyInfo;
  hrAlerts: HRAlert[];
  documents: GCPDocument[];
  expenses: ExpenseRecord[];
  projectPhotos: ProjectPhoto[];
  changeOrders: ChangeOrder[];
  insuranceClaims: InsuranceClaim[];
  leads: Lead[];
  shiftAssignments: ShiftAssignment[];
  safetyRecords: SafetyRecord[];
  // Dépenses personnelles de l'employé : locales à l'appareil, jamais synchronisées
  personalExpenses: ExpenseRecord[];
  payrollPayments: PayrollPayment[];
  
  // Motivation & Teams State
  motivationTeams: MotivationTeam[];
  motivationGoals: MotivationGoal[];
  weeklyGoals: WeeklyGoal[];
  
  // App Config / Session State
  activeEmployee: Employee | null;
  currentLanguage: 'FR' | 'EN';
  currentTheme: VisualTheme;
  offlineSyncStatus: 'synced' | 'offline' | 'pending';
  isOnboarded: boolean;
  demoSandboxActive: boolean;
  demoSandboxSummary: DemoSandboxSummary | null;
  
  // Operations / Actions
  setLanguage: (lang: 'FR' | 'EN') => void;
  setTheme: (theme: VisualTheme) => void;
  login: (nip: string, employeeId: string) => Promise<{ success: boolean; message: string }>;
  logout: () => void;
  setIsOnboarded: (val: boolean) => void;
  activateDemoSandbox: () => Promise<boolean>;
  resetDemoSandbox: () => Promise<boolean>;
  deactivateDemoSandbox: () => Promise<void>;
  
  // Employee CRUD
  addEmployee: (emp: Omit<Employee, 'id' | 'level' | 'xp'>) => void;
  updateEmployee: (emp: Employee) => void;
  acknowledgePrivacyNotice: () => Promise<void>;
  submitOwnCredential: (submission: SubmissionInput) => Promise<void>;
  reviewEmployeeCredential: (
    employeeId: string,
    credentialId: string,
    decision: { approved: boolean; method?: string; note?: string }
  ) => Promise<void>;
  deleteEmployee: (id: string) => void;
  addXP: (employeeId: string, amount: number) => void;
  
  // Teams Action
  addMotivationTeam: (team: Omit<MotivationTeam, 'id' | 'createdAt'>) => void;
  updateMotivationTeam: (team: MotivationTeam) => void;
  deleteMotivationTeam: (id: string) => void;

  // Motivation Goals Action
  addMotivationGoal: (goal: Omit<MotivationGoal, 'id' | 'startDate'>) => void;
  updateMotivationGoal: (goal: MotivationGoal) => void;
  deleteMotivationGoal: (id: string) => void;
  manualProgressGoal: (goalId: string, increment: number) => void;
  recomputeGoalsAndStreaks: () => void;
  
  // Project CRUD
  addProject: (proj: Omit<Project, 'id'>) => void;
  updateProject: (proj: Project) => void;
  deleteProject: (id: string) => void;

  // Catalogue CRUD
  addCatalogueMaterial: (item: Omit<CatalogueMaterial, 'id'>) => void;
  updateCatalogueMaterial: (item: CatalogueMaterial) => void;
  deleteCatalogueMaterial: (id: string) => void;

  // Supplier CRUD
  addSupplier: (supplier: Omit<Supplier, 'id'>) => void;
  updateSupplier: (supplier: Supplier) => void;
  deleteSupplier: (id: string) => void;

  // Inventory CRUD
  addInventoryItem: (item: Omit<InventoryItem, 'id'>) => void;
  updateInventoryItem: (item: InventoryItem) => void;
  deleteInventoryItem: (id: string) => void;

  // Tool asset registry and theft reports
  addToolAsset: (tool: Omit<ToolAsset, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateToolAsset: (tool: ToolAsset) => void;
  deleteToolAsset: (id: string) => void;
  addToolTheftReport: (report: Omit<ToolTheftReport, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateToolTheftReport: (report: ToolTheftReport) => void;
  deleteToolTheftReport: (id: string) => void;

  // Orders CRUD
  addSupplierOrder: (order: Omit<SupplierOrder, 'id'>) => void;
  updateSupplierOrder: (order: SupplierOrder) => void;

  // Client CRUD
  addClient: (cli: Omit<Client, 'id'>) => void;
  updateClient: (cli: Client) => void;
  deleteClient: (id: string) => void;

  // Company Info Update
  updateCompanyInfo: (info: Partial<CompanyInfo>) => void;

  // HR Alerts
  addHRAlert: (alert: Omit<HRAlert, 'id' | 'date' | 'resolved'>) => void;
  resolveHRAlert: (id: string) => void;

  // Punch Sessions Actions
  startPunchSession: (params: {
    employeeId: string;
    projectId: string;
    payMode: PayMode;
    rate: number;
    withinGeofence: boolean;
    attemptedOutsideGeofence?: boolean;
    outsideDetails?: string;
    latitude?: number;
    longitude?: number;
    needsApproval?: boolean;
  }) => void;
  pausePunchSession: (id: string) => void;
  resumePunchSession: (id: string) => void;
  stopPunchSession: (id: string, surfaceMaterials?: { name: string; quantity: number; unitPrice: number; emoji: string }[]) => void;
  // Validation administrative des heures (réservée à la gestion)
  correctPunchSession: (
    id: string,
    changes: { startTime?: string; endTime?: string; totalPauseMinutes?: number },
    note?: string
  ) => { ok: boolean; message?: string };
  approvePunchSession: (id: string) => { ok: boolean; message?: string };

  // Invoice CRUD
  addInvoice: (inv: Omit<Invoice, 'id' | 'invoiceNumber'>) => void;
  updateInvoice: (inv: Invoice) => void;
  generateDraftInvoiceForEmployee: (employeeId: string) => void;

  // System A: Client Documents Actions
  addGCPDocument: (doc: Omit<GCPDocument, 'id' | 'number'>) => void;
  updateGCPDocument: (doc: GCPDocument) => void;
  deleteGCPDocument: (id: string) => void;
  convertQuoteToInvoice: (quoteId: string) => void;
  addPartialPayment: (id: string, amount: number, method: string, notes?: string) => void;

  // Accounting CRUD
  addSafetyRecord: (record: Omit<SafetyRecord, 'id'>) => void;
  updateSafetyRecord: (record: SafetyRecord) => void;
  deleteSafetyRecord: (id: string) => void;
  addShiftAssignment: (assignment: Omit<ShiftAssignment, 'id'>) => void;
  deleteShiftAssignment: (id: string) => void;
  addLead: (lead: Omit<Lead, 'id'>) => void;
  updateLead: (lead: Lead) => void;
  deleteLead: (id: string) => void;
  addInsuranceClaim: (claim: Omit<InsuranceClaim, 'id'>) => void;
  updateInsuranceClaim: (claim: InsuranceClaim) => void;
  deleteInsuranceClaim: (id: string) => void;
  addChangeOrder: (order: Omit<ChangeOrder, 'id'>) => void;
  updateChangeOrder: (order: ChangeOrder) => void;
  deleteChangeOrder: (id: string) => void;
  addProjectPhoto: (photo: Omit<ProjectPhoto, 'id'>) => void;
  updateProjectPhoto: (photo: ProjectPhoto) => void;
  deleteProjectPhoto: (id: string) => void;
  addExpense: (exp: Omit<ExpenseRecord, 'id'>) => void;
  deleteExpense: (id: string) => void;
  addPersonalExpense: (exp: Omit<ExpenseRecord, 'id'>) => void;
  deletePersonalExpense: (id: string) => void;
  addPayrollPayment: (pay: Omit<PayrollPayment, 'id'>) => void;
  deletePayrollPayment: (id: string) => void;

  // Synchronisation cloud (Supabase) : hydrate le store depuis la base de données si configurée
  hydrateCloud: () => Promise<void>;
}

export const DEMO_SANDBOX_SNAPSHOT_KEYS = [
  'employees', 'projects', 'punchSessions', 'invoices', 'catalogue', 'suppliers', 'inventory',
  'toolAssets', 'toolTheftReports', 'orders', 'clients', 'companyInfo', 'hrAlerts', 'documents',
  'expenses', 'projectPhotos', 'changeOrders', 'insuranceClaims', 'leads', 'shiftAssignments',
  'safetyRecords', 'personalExpenses', 'payrollPayments', 'motivationTeams', 'motivationGoals',
  'weeklyGoals', 'activeEmployee', 'offlineSyncStatus'
] as const satisfies readonly (keyof AppState)[];

type DemoSnapshot = Pick<AppState, (typeof DEMO_SANDBOX_SNAPSHOT_KEYS)[number]>;

let demoSnapshot: DemoSnapshot | null = null;

function cloneDemoValue<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function captureDemoSnapshot(state: AppState): DemoSnapshot {
  return cloneDemoValue(Object.fromEntries(
    DEMO_SANDBOX_SNAPSHOT_KEYS.map(key => [key, state[key]])
  ) as DemoSnapshot);
}

// Profils de validation strictement locaux. Les quatre anciens profils de
// démonstration ont été retirés et ne sont jamais envoyés à Supabase.
const initialEmployees: Employee[] = LOCAL_TEST_MODE ? TEST_EMPLOYEES : [];

const initialProjects: Project[] = [
  {
    id: 'proj-1',
    name: 'Chantier Hydro-Québec',
    clientName: 'Hydro-Québec (Rénovations)',
    address: '75 Boul. René-Lévesque Ouest, Montréal, QC',
    latitude: 45.5088,
    longitude: -73.5540,
    radius: 100, // 100m
    assignedEmployees: ['emp-2', 'emp-3'],
    status: 'active'
  },
  {
    id: 'proj-2',
    name: 'Condos Concorde Brossard',
    clientName: 'Sogeprim Immobilier Inc.',
    address: '2300 Rue de la Concorde, Brossard, QC',
    latitude: 45.4418,
    longitude: -73.4429,
    radius: 150,
    assignedEmployees: ['emp-2', 'emp-3', 'emp-1'],
    status: 'active'
  },
  {
    id: 'proj-3',
    name: 'Siège Social Hailite (Bureaux)',
    clientName: 'Hailite Xteriors Inc.',
    address: '1200 Rue Saint-Denis, Montréal, QC',
    latitude: 45.5145,
    longitude: -73.5601,
    radius: 50,
    assignedEmployees: ['emp-4', 'emp-1'],
    status: 'active'
  },
  {
    id: 'proj-4',
    name: 'Toiture Chalet Tremblant',
    clientName: 'Famille Larouche',
    address: '675 Chemin de la Forêt, Mont-Tremblant, QC',
    latitude: 46.1184,
    longitude: -74.5962,
    radius: 200,
    assignedEmployees: ['emp-3'],
    status: 'on-hold'
  }
];

const initialCatalogue: CatalogueMaterial[] = [
  { id: 'cat-1', name: 'Bardeau d\'asphalte (Standard)', emoji: '🪵', pricePerSqFt: 3.50, imageUrl: "https://images.unsplash.com/photo-1625756975-c71c4ff88df1?w=400&q=80", imageAlt: "Bardeaux d'asphalte gris sur toiture" },
  { id: 'cat-2', name: 'Membrane élastomère Havane', emoji: '🛢️', pricePerSqFt: 6.20, imageUrl: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400&q=80", imageAlt: "Membrane sous-couche noire de toiture" },
  { id: 'cat-3', name: 'Revêtement d\'acier Hailite Rustique', emoji: '🧱', pricePerSqFt: 12.50, imageUrl: "https://images.unsplash.com/photo-1590725121839-892b458a74fe?w=400&q=80", imageAlt: "Panneau de siding en acier galvanisé" },
  { id: 'cat-4', name: 'Flashing en aluminium brossé', emoji: '📐', pricePerSqFt: 4.80, imageUrl: "https://images.unsplash.com/photo-1523217582562-09d0def993a6?w=400&q=80", imageAlt: "Tôle de rive aluminium grise au bord de toit" },
  { id: 'cat-5', name: 'Soffites d\'aluminium ventilés', emoji: '🧇', pricePerSqFt: 3.90, imageUrl: "https://images.unsplash.com/photo-1503174971373-b1f69850bded?w=400&q=80", imageAlt: "Soffite en vinyle blanc ventilé sous les avant-toits" },
  { id: 'cat-6', name: 'Membrane pare-air Tyvek Roll', emoji: '💨', pricePerSqFt: 2.10, imageUrl: "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=400&q=80", imageAlt: "Rouleau de membrane pare-air blanche" }
];

const initialSuppliers: Supplier[] = [
  { id: 'sup-1', name: 'Distribution Pro-Toit Ltée', contactName: 'Marie-Claude Fournier', phone: '450-661-2200', email: 'ventes@protoit.ca' },
  { id: 'sup-2', name: 'Aciers Québec Inc.', contactName: 'Réjean Bouchard', phone: '514-388-4477', email: 'commandes@aciersquebec.ca' },
  { id: 'sup-3', name: 'Rona l\'Entrepôt', phone: '1-866-283-3846' }
];

const initialInventory: InventoryItem[] = [
  { id: 'inv-1', name: 'Bardeau d\'asphalte Stratifié Noir', quantity: 450, unit: 'paquets', emoji: '🪵', minThreshold: 100 },
  { id: 'inv-2', name: 'Clous de toiture HD 1-1/4"', quantity: 15, unit: 'boîtes', emoji: '螺', minThreshold: 5 },
  { id: 'inv-3', name: 'Rouleaux Membrane sous-couche 15lb', quantity: 3, unit: 'rouleaux', emoji: '🛢️', minThreshold: 10 }, // Warning trigger! (3 < 10)
  { id: 'inv-4', name: 'Flashing d\'aluminium Brun Terre', quantity: 45, unit: 'sections', emoji: '📐', minThreshold: 20 },
  { id: 'inv-5', name: 'Scellant de silicone Premium Gris', quantity: 8, unit: 'tubes', emoji: '🩹', minThreshold: 12 } // Warning trigger! (8 < 12)
];

const initialClients: Client[] = [
  { id: 'cli-1', name: 'Hydro-Québec (Rénovations)', company: 'Hydro-Québec', email: 'repartitions@hydro.qc.ca', phone: '514-879-1111', address: '75 Boul. René-Lévesque O, Montréal' },
  { id: 'cli-2', name: 'Sogeprim Immobilier Inc.', company: 'Sogeprim', email: 'compta@sogeprim.ca', phone: '450-444-2391', address: '500 Boul. Taschereau, Brossard' },
  { id: 'cli-3', name: 'Jean Larouche', company: 'Particulier', email: 'j.larouche@gmail.com', phone: '819-223-1029', address: '675 Chemin de la Forêt, Mont-Tremblant' }
];

const initialExpenses: ExpenseRecord[] = [
  { id: 'exp-1', provider: 'Rona l\'Entrepôt', category: 'materials', projectId: 'proj-1', amount: 1540.00, tax: 230.62, date: '2026-06-01', notes: 'Bois de charpente et clous' },
  { id: 'exp-2', provider: 'Petro-Canada', category: 'fuel', projectId: 'proj-1', amount: 120.00, tax: 17.97, date: '2026-06-03', notes: 'Carburant pickup Patrick' },
  { id: 'exp-3', provider: 'Hilti Canada', category: 'tools', projectId: 'proj-2', amount: 480.00, tax: 71.88, date: '2026-05-15', notes: 'Perceuse à percussion neuve' },
  { id: 'exp-4', provider: 'Sling-Choker Montréal', category: 'rental', projectId: 'proj-1', amount: 350.00, tax: 52.41, date: '2026-06-02', notes: 'Location harnais et monte-charge' }
];

const initialPayrollPayments: PayrollPayment[] = [
  { id: 'pay-1', employeeId: 'emp-2', employeeName: 'Mathieu Côté', period: '2026-06', amount: 2280.00, status: 'paid', date: '2026-06-01' },
  { id: 'pay-2', employeeId: 'emp-1', employeeName: 'Patrick Bisaillon', period: '2026-06', amount: 3600.00, status: 'approved', date: '2026-06-02' }
];

const demoCompanyInfo: CompanyInfo = {
  name: 'Hailite Xteriors Inc.',
  address: '1200 Rue Saint-Denis, Montréal, QC, H2X 3J6',
  phone: '514-388-XTER',
  email: 'info@hailitexteriors.ca',
  gstNumber: 'GST-102938475-RT0001',
  qstNumber: 'QST-1002938475-TQ0001',
  wcbNumber: 'WCB-CNESST-20394812',
  bnNumber: 'NEQ-1172938472',
  logo: 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&q=80&w=150&h=150', // placeholder badge construction
  interacEmail: 'paiement@hailitexteriors.ca',
  bankDetails: {
    bank: 'Banque Nationale du Canada',
    transit: '10293',
    institution: '006',
    account: '1234-567-890'
  },
  geofencingEnabled: true,
  vacationRate: 4, // 4% de paye de vacances légale
  legalMinimumWage: 15.75, // minimum québécois
  voiceReminderVolume: 80,
  voiceReminderSchedule: '08:00, 12:00, 17:00',
  paymentTerms: 'Paiement net 30 jours',
  country: 'CA', region: 'AB', currency: 'CAD', unitSystem: 'imperial', dateLocale: 'fr-CA',
  taxRate1: 0.05, taxRate2: 0, localTaxRate: 0, taxRate1Name: 'TPS (5%)', taxRate2Name: 'Taxe provinciale',
  dataStorageMode: 'hybrid', cloudSyncConsent: true, cloudRegion: 'ca-central-1', retentionMonths: 84
};

// En production, aucune identité, coordonnée bancaire ou inscription fiscale
// fictive ne doit être embarquée comme valeur par défaut. L'identité réelle est
// chargée depuis le tenant après le démarrage sécurisé.
const initialCompanyInfo: CompanyInfo = LOCAL_TEST_MODE ? demoCompanyInfo : {
  name: 'Hailite Manager',
  address: '',
  phone: '',
  email: '',
  gstNumber: '',
  qstNumber: '',
  wcbNumber: '',
  bnNumber: '',
  logo: '',
  interacEmail: '',
  bankDetails: { bank: '', transit: '', institution: '', account: '' },
  geofencingEnabled: false,
  vacationRate: 0,
  legalMinimumWage: 0,
  voiceReminderVolume: 80,
  voiceReminderSchedule: '08:00, 12:00, 17:00',
  paymentTerms: '',
  country: 'CA',
  region: '',
  currency: 'CAD',
  unitSystem: 'imperial',
  dateLocale: 'fr-CA',
  taxRate1: 0,
  taxRate2: 0,
  localTaxRate: 0,
  taxRate1Name: '',
  taxRate2Name: '',
  dataStorageMode: 'supabase',
  cloudSyncConsent: false,
  cloudRegion: 'ca-central-1',
  retentionMonths: 84
};

const initialHRAlerts: HRAlert[] = [
  {
    id: 'hr-1',
    type: 'warning',
    title: 'Inventaire critique',
    message: 'Le stock de "Rouleaux Membrane sous-couche 15lb" est de 3, sous le seuil minimum de 10.',
    date: '2026-06-03T10:00:00Z',
    resolved: false
  },
  {
    id: 'hr-2',
    type: 'danger',
    title: 'Certification professionnelle expirée',
    message: 'Le certificat de compétence de Stéphane Roy nécessite une mise à jour administrative (Expiré depuis 2 jours).',
    date: '2026-06-01T08:00:00Z',
    employeeId: 'emp-3',
    employeeName: 'Stéphane Roy',
    resolved: false
  },
  {
    id: 'hr-3',
    type: 'info',
    title: 'Régulation Heures Supplémentaires',
    message: 'Mathieu Côté a cumulé 38 heures de chantier cette semaine. Approche de la limite légale de 40h.',
    date: '2026-06-03T16:30:00Z',
    employeeId: 'emp-2',
    employeeName: 'Mathieu Côté',
    resolved: false
  }
];

// Seed historical punch sessions (e.g., Mathieu has worked a few sessions, Stéphane also)
const initialPunchSessions: PunchSession[] = [
  {
    id: 'punch-h1',
    employeeId: 'emp-2',
    employeeName: 'Mathieu Côté',
    projectId: 'proj-1',
    projectName: 'Chantier Hydro-Québec',
    payMode: 'horaire',
    rate: 28.5,
    startTime: '2026-06-01T08:00:00Z',
    endTime: '2026-06-01T16:30:00Z', // 8.5 hours total (with 30 mins unpaid pause)
    pausedAt: null,
    totalPauseMinutes: 30,
    withinGeofence: true,
    totalWorkedHours: 8.0,
    revenue: 228.00 // 8 hours paid * 28.5
  },
  {
    id: 'punch-h2',
    employeeId: 'emp-3',
    employeeName: 'Stéphane Roy',
    projectId: 'proj-2',
    projectName: 'Condos Concorde Brossard',
    payMode: 'surface',
    rate: 12.50, // rate per pi²
    startTime: '2026-06-01T07:30:00Z',
    endTime: '2026-06-01T17:00:00Z',
    pausedAt: null,
    totalPauseMinutes: 45,
    withinGeofence: true,
    surfaceMaterials: [
      { name: 'Revêtement d\'acier Hailite Rustique', quantity: 50, unitPrice: 12.50, emoji: '🧱' }
    ],
    totalWorkedHours: 8.75,
    revenue: 625.00 // 50 pi² * 12.50
  },
  {
    id: 'punch-h3',
    employeeId: 'emp-2',
    employeeName: 'Mathieu Côté',
    projectId: 'proj-2',
    projectName: 'Condos Concorde Brossard',
    payMode: 'horaire',
    rate: 28.5,
    startTime: '2026-06-02T08:00:00Z',
    endTime: '2026-06-02T17:00:00Z', // 9 hours, 45 mins pause
    pausedAt: null,
    totalPauseMinutes: 45,
    withinGeofence: true,
    totalWorkedHours: 8.25,
    revenue: 235.13 // 8.25 worked hours * 28.5 $
  },
  {
    id: 'punch-h4',
    employeeId: 'emp-3',
    employeeName: 'Stéphane Roy',
    projectId: 'proj-1',
    projectName: 'Chantier Hydro-Québec',
    payMode: 'forfait',
    rate: 450.0, // Forfait pour la journée
    startTime: '2026-06-02T07:00:00Z',
    endTime: '2026-06-02T16:00:00Z',
    pausedAt: null,
    totalPauseMinutes: 60,
    withinGeofence: true,
    totalWorkedHours: 8.0,
    revenue: 450.00
  }
];

const initialInvoices: Invoice[] = [
  {
    id: 'inv-h1',
    employeeId: 'emp-2',
    employeeName: 'Mathieu Côté',
    invoiceNumber: 'INV-2026-0001',
    date: '2026-06-02',
    sessionIds: ['punch-h1', 'punch-h3'],
    totalHours: 16.25,
    amount: 463.13,
    gstAmount: 23.16,
    qstAmount: 46.20,
    totalWithTaxes: 532.49,
    status: 'pending',
    taxIncluded: false,
    notes: 'Revenus accumulés pourHydro-Québec et Concorde Brossard.'
  },
  {
    id: 'inv-h2',
    employeeId: 'emp-3',
    employeeName: 'Stéphane Roy',
    invoiceNumber: 'INV-2026-0002',
    date: '2026-06-02',
    sessionIds: ['punch-h2', 'punch-h4'],
    totalHours: 18.5,
    amount: 1075.00,
    gstAmount: 53.75,
    qstAmount: 107.23,
    totalWithTaxes: 1235.98,
    status: 'paid',
    taxIncluded: false,
    notes: 'Paiement effectué par Virement Interac.'
  }
];

const initialDocuments: GCPDocument[] = [
  {
    id: 'doc-1',
    type: 'invoice',
    number: 'FAC-2026-0001',
    date: '2026-05-15',
    dueDate: '2026-06-15',
    status: 'paid',
    clientId: 'cli-1',
    clientName: 'Hydro-Québec (Rénovations)',
    clientAddress: '75 Boul. René-Lévesque Ouest, Montréal, QC',
    clientEmail: 'repartitions@hydro.qc.ca',
    clientPhone: '514-879-1111',
    siteAddress: 'Centrale d\'Iberville, QC',
    isSimpleLayout: true,
    lineItems: [
      { id: 'li-1', description: 'Pose revêtement façade nord', qty: 350, unit: 'pi²', unitPrice: 28.50, total: 9975 }
    ],
    materialLines: [],
    labourLines: [],
    otherLines: [],
    subcontractLines: [],
    subtotal: 9975,
    discountPct: 0,
    taxRate: 14.975,
    taxAmount: 1493.76,
    total: 11468.76,
    holdbackPct: 10,
    holdbackAmount: 1146.88,
    depositAmount: 2500,
    balanceDue: 0,
    acceptedPayments: ['virement', 'etransfer'],
    lateInterestPct: 2,
    depositPct: 25,
    paymentMidPct: 25,
    paymentFinalPct: 50,
    ownerName: 'Patrick Bisaillon',
    paymentsHistory: [
      { id: 'pay-1', date: '2026-05-15', amount: 2500, method: 'virement', notes: 'Acompte reçu de Hydro-Québec' },
      { id: 'pay-2', date: '2026-06-01', amount: 7821.88, method: 'virement', notes: 'Paiement final reçu, libération de retenue en cours' }
    ],
    quoteValidDays: 30,
    permitBy: 'na',
    warrantyYears: 2,
    hasInsurance: true,
    subcontractAuthorized: true
  },
  {
    id: 'doc-2',
    type: 'quote',
    number: 'DEV-2026-0001',
    date: '2026-06-01',
    dueDate: '2026-07-01',
    status: 'accepted',
    clientId: 'cli-3',
    clientName: 'Jean Larouche',
    clientAddress: '675 Chemin de la Forêt, Mont-Tremblant, QC',
    clientEmail: 'j.larouche@gmail.com',
    clientPhone: '819-223-1029',
    siteAddress: 'Chalet Tremblant, QC',
    isSimpleLayout: false,
    lineItems: [],
    materialLines: [
      { id: 'ml-1', claddingType: 'Revêtement d\'acier Hailite Rustique', brand: 'James Hardie', thickness: '1/2"', qtySqft: 850, supplier: 'Gentek', unitPrice: 12.50, total: 10625 }
    ],
    labourLines: [
      { id: 'lbl-1', task: 'Installation', estimatedHours: 45, rate: 45, isFlatRate: false, total: 2025 }
    ],
    otherLines: [
      { id: 'ol-1', description: 'Location nacelle', amount: 350 }
    ],
    subcontractLines: [],
    subtotal: 13000,
    discountPct: 5,
    taxRate: 14.975,
    taxAmount: 1849.41,
    total: 14199.41,
    holdbackPct: 0,
    holdbackAmount: 0,
    depositAmount: 3500,
    balanceDue: 14199.41,
    acceptedPayments: ['virement', 'cheque'],
    lateInterestPct: 2,
    depositPct: 25,
    paymentMidPct: 25,
    paymentFinalPct: 50,
    ownerName: 'Patrick Bisaillon',
    paymentsHistory: [],
    quoteValidDays: 30,
    permitBy: 'contractor',
    warrantyYears: 2,
    hasInsurance: true,
    subcontractAuthorized: true
  }
];

const initialOrders: SupplierOrder[] = [
  {
    id: 'ord-1',
    supplierName: 'Distribution Pro-Toit Ltée',
    date: '2026-06-01',
    items: [
      { name: 'Bardeau Stratifié Noir', quantity: 120, price: 28.00 },
      { name: 'Soffites d\'aluminium Blanc', quantity: 30, price: 15.50 }
    ],
    status: 'received',
    totalAmount: 3825.00
  },
  {
    id: 'ord-2',
    supplierName: 'Aciers Québec Inc.',
    date: '2026-06-03',
    items: [
      { name: 'Sections Acier Rustique Hailite', quantity: 80, price: 65.00 },
      { name: 'Vis industrielles toiture (boîtes)', quantity: 20, price: 18.00 }
    ],
    status: 'ordered',
    totalAmount: 5560.00
  }
];

const getStartOfWeekISO = () => {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  // getDay/getDate travaillent déjà en heure locale : on garde la même journée
  // en la formatant localement plutôt qu'en UTC, sinon le lundi calculé pouvait
  // ressortir en dimanche pour les fuseaux à l'ouest de Greenwich.
  return localDayKey(monday);
};

const initialMotivationTeams: MotivationTeam[] = [
  {
    id: 'team-1',
    name: 'Poseurs de Toiture Élite',
    memberIds: ['emp-1', 'emp-2'],
    color: '#06b6d4',
    active: true,
    createdAt: '2026-05-01T12:00:00Z',
    leaderId: 'emp-1',
    projectIds: ['proj-1']
  },
  {
    id: 'team-2',
    name: 'Gardiens Modernes du Revêtement',
    memberIds: ['emp-3', 'emp-4'],
    color: '#a855f7',
    active: true,
    createdAt: '2026-05-10T14:30:00Z',
    leaderId: 'emp-3',
    projectIds: ['proj-1']
  }
];

const initialMotivationGoals: MotivationGoal[] = [
  {
    id: 'goal-1',
    title: 'Chiffre d\'Affaires Global',
    scope: 'company',
    metric: 'revenue',
    target: 20000,
    current: 4890,
    startDate: '2026-06-01',
    rewardType: 'bonus',
    rewardTitle: 'Prime collective de 150$/employé',
    rewardDescription: 'Viser ensemble 20K$ de revenus de punch.',
    status: 'active'
  },
  {
    id: 'goal-2',
    title: 'Heures de Chantier Élite',
    scope: 'team',
    teamId: 'team-1',
    metric: 'hours',
    target: 80,
    current: 32,
    startDate: '2026-06-01',
    rewardType: 'lunch',
    rewardTitle: 'Dîner BBQ payé au complet',
    rewardDescription: 'L\'équipe de Mathieu et Patrick réalise 80 heures sur le chantier.',
    status: 'active'
  },
  {
    id: 'goal-3',
    title: 'Objectif Chantier Propre - Jessica',
    scope: 'individual',
    employeeId: 'emp-2',
    metric: 'jobs_completed',
    target: 6,
    current: 3,
    startDate: '2026-06-01',
    rewardType: 'gift',
    rewardTitle: 'Carte cadeau chantier de 50$',
    rewardDescription: 'Jessica atteint 6 fiches d\'intervention validées sur place.',
    status: 'active'
  }
];

const initialWeeklyGoals: WeeklyGoal[] = [
  { employeeId: 'emp-1', targetAmount: 2500, currentAmount: 1800, weekStart: getStartOfWeekISO(), xpPoints: 2450, level: 5, streak: 4, lastPunchDate: '2026-06-02' },
  { employeeId: 'emp-2', targetAmount: 1200, currentAmount: 680, weekStart: getStartOfWeekISO(), xpPoints: 680, level: 2, streak: 2, lastPunchDate: '2026-06-02' },
  { employeeId: 'emp-3', targetAmount: 1800, currentAmount: 1200, weekStart: getStartOfWeekISO(), xpPoints: 1850, level: 4, streak: 3, lastPunchDate: '2026-06-02' },
  { employeeId: 'emp-4', targetAmount: 1000, currentAmount: 400, weekStart: getStartOfWeekISO(), xpPoints: 1200, level: 3, streak: 1, lastPunchDate: '2026-06-02' }
];

// Helper to load state from localStorage or use defaults
// Prochain numéro séquentiel basé sur le plus grand numéro déjà émis parmi une
// liste de numéros existants (et non sur le nombre d'éléments restants), pour
// éviter des collisions après la suppression d'un document/d'une facture.
const nextSequentialNumber = (existingNumbers: string[], prefix: string): string => {
  const maxSeq = existingNumbers.reduce((max, num) => {
    const match = num.match(/-(\d+)$/);
    const seq = match ? parseInt(match[1], 10) : 0;
    return Math.max(max, seq);
  }, 0);
  return `${prefix}-${new Date().getFullYear()}-${String(maxSeq + 1).padStart(4, '0')}`;
};

const getNextDocNumber = (documents: GCPDocument[], type: GCPDocument['type'], prefix: string): string =>
  nextSequentialNumber(documents.filter(d => d.type === type).map(d => d.number), prefix);

const getSavedState = <T>(key: string, defaultValue: T): T => {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return defaultValue;
    const parsed = JSON.parse(saved);
    const candidate = browserStorageValue(key, parsed, LOCAL_TEST_MODE);
    if (!candidate.allowed) {
      localStorage.removeItem(key);
      return defaultValue;
    }
    if (key === 'gcp_companyInfo' && defaultValue && typeof defaultValue === 'object') {
      return { ...(defaultValue as object), ...(candidate.value as object) } as T;
    }
    return candidate.value as T;
  } catch {
    return defaultValue;
  }
};

const saveState = (key: string, value: any) => {
  // Le mode démo est volontairement volatil : ni localStorage ni sauvegarde
  // personnelle ne doivent conserver une copie de ses données fictives.
  if (isDemoSandboxIsolationActive()) return;
  try {
    const candidate = browserStorageValue(key, value, LOCAL_TEST_MODE);
    if (!candidate.allowed) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify(candidate.value));
    // Les écritures restent immédiatement locales. Lorsque le propriétaire a
    // autorisé un fichier personnel, une sauvegarde différée regroupe les
    // changements sans ralentir chaque bouton de l’application.
    scheduleConfiguredBackup();
  } catch (err) {
    console.error('Failed to save state to localStorage', err);
  }
};

export const getXPRequiredForLevel = (level: number): number => {
  if (level <= 1) return 0;
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += i * 1000 + (i - 1) * 500;
  }
  return total;
};

export const getLevelFromXP = (xp: number): number => {
  let level = 1;
  while (xp >= getXPRequiredForLevel(level + 1)) {
    level++;
  }
  return level;
};

// ---------------------------------------------------------------------------
// Propagation d'une correction d'heures vers les factures
// ---------------------------------------------------------------------------
// Corriger un pointage sans toucher aux factures laissait deux chiffres
// différents dans l'application. On recalcule donc les factures **brouillons**
// qui contiennent le pointage. Une facture déjà envoyée ou payée n'est jamais
// modifiée en silence : elle est signalée à la gestion par une alerte.
type StoreGet = () => AppState;
type StoreSet = (partial: Partial<AppState>) => void;

function recalculateInvoicesForPunch(get: StoreGet, set: StoreSet, punchId: string): {
  updatedInvoiceNumbers: string[];
  lockedInvoiceNumbers: string[];
} {
  const { invoices, punchSessions, companyInfo } = get();
  const concerned = invoices.filter(invoice => invoice.sessionIds.includes(punchId));
  if (concerned.length === 0) return { updatedInvoiceNumbers: [], lockedInvoiceNumbers: [] };

  const gstRate = companyInfo.taxRate1 !== undefined ? companyInfo.taxRate1 : 0;
  const qstRate = companyInfo.taxRate2 !== undefined ? companyInfo.taxRate2 : 0;
  const localRate = companyInfo.localTaxRate !== undefined ? companyInfo.localTaxRate : 0;

  const updatedInvoiceNumbers: string[] = [];
  const lockedInvoiceNumbers: string[] = [];

  const nextInvoices = invoices.map(invoice => {
    if (!invoice.sessionIds.includes(punchId)) return invoice;
    if (invoice.status !== 'draft') {
      lockedInvoiceNumbers.push(invoice.invoiceNumber);
      return invoice;
    }
    const sessions = punchSessions.filter(punch => invoice.sessionIds.includes(punch.id));
    const totalHours = sessions.reduce((sum, punch) => sum + (punch.totalWorkedHours || 0), 0);
    const amount = Number(sessions.reduce((sum, punch) => sum + (punch.revenue || 0), 0).toFixed(2));
    const gstAmount = Number((amount * gstRate).toFixed(2));
    const qstAmount = Number((amount * qstRate).toFixed(2));
    const localTaxAmount = Number((amount * localRate).toFixed(2));
    const recomputed: Invoice = {
      ...invoice,
      totalHours: Number(totalHours.toFixed(2)),
      amount,
      gstAmount,
      qstAmount,
      localTaxAmount,
      totalWithTaxes: Number((amount + gstAmount + qstAmount + localTaxAmount).toFixed(2))
    };
    updatedInvoiceNumbers.push(invoice.invoiceNumber);
    syncUpdate('payroll_entries', recomputed.id, invoiceToRow(recomputed));
    return recomputed;
  });

  if (updatedInvoiceNumbers.length > 0) {
    set({ invoices: nextInvoices });
    saveState('gcp_invoices', nextInvoices);
  }

  // Une facture verrouillée doit être reprise à la main : on laisse une trace
  // visible plutôt que de modifier un document déjà transmis.
  for (const number of lockedInvoiceNumbers) {
    const invoice = concerned.find(candidate => candidate.invoiceNumber === number);
    get().addHRAlert({
      type: 'warning',
      title: 'Facture à revoir après correction des heures',
      message: `Les heures d'un pointage de la facture ${number} ont été corrigées, `
        + `mais cette facture n'est plus un brouillon (${invoice?.status}). `
        + `Vérifiez le montant avant paiement.`,
      employeeId: invoice?.employeeId || '',
      employeeName: invoice?.employeeName || ''
    });
  }

  return { updatedInvoiceNumbers, lockedInvoiceNumbers };
}

// Le fuseau des journées de travail est appliqué avant la création du store :
// les totaux calculés au premier rendu doivent déjà utiliser le bon fuseau.
setAppTimeZone(getSavedState<CompanyInfo>('gcp_companyInfo', initialCompanyInfo).timeZone);

/**
 * Enregistre l'empreinte du NIP sur l'appareil, en mode hors serveur seulement.
 *
 * Le calcul est volontairement lent (210 000 tours), donc il ne peut pas être
 * fait dans l'action synchrone qui enregistre la fiche : elle rendrait la main
 * une demi-seconde plus tard et le bouton paraîtrait figé. La fiche est donc
 * écrite tout de suite, et l'empreinte la rejoint juste après.
 *
 * En mode Supabase, cette fonction ne fait rien : c'est le serveur qui détient
 * l'empreinte, et en garder une seconde ici créerait deux vérités.
 */
async function storeLocalAccessCode(employeeId: string, accessCode: string): Promise<void> {
  if (!accessCode || readStoragePersistence() !== 'offline') return;
  try {
    const accessCodeHash = await hashAccessCode(accessCode);
    const employees = useAppStore.getState().employees.map(
      employee => employee.id === employeeId ? { ...employee, accessCodeHash, nip: '' } : employee
    );
    useAppStore.setState({ employees });
    saveState('gcp_employees', employees);
  } catch (error) {
    // Un NIP refusé (trop court) ou une plateforme sans WebCrypto : la fiche
    // reste créée, mais la personne ne pourra pas se connecter tant qu'un NIP
    // valide n'aura pas été enregistré. Mieux vaut ça qu'une fiche perdue.
    console.error('Le NIP n’a pas pu être enregistré sur cet appareil :', error);
  }
}

// Le nuage personnel n'a pas plus de serveur que le mode local : dans les deux
// cas il n'y a rien à interroger. Les confondre avec un mode serveur lançait
// des hydratations contre le vide.
const isServerBackedMode = (mode: unknown): boolean =>
  mode !== 'local' && mode !== 'personal_cloud';

export const useAppStore = create<AppState>((set, get) => ({
  // En production, les données métier partent vides et sont hydratées depuis le
  // serveur après authentification. Les jeux fictifs n'existent qu'en mode dev.
  employees: getSavedState('gcp_employees', LOCAL_TEST_MODE ? TEST_EMPLOYEES : initialEmployees),
  projects: getSavedState('gcp_projects', LOCAL_TEST_MODE ? initialProjects : []),
  punchSessions: getSavedState('gcp_punchSessions', LOCAL_TEST_MODE ? initialPunchSessions : []),
  invoices: getSavedState('gcp_invoices', LOCAL_TEST_MODE ? initialInvoices : []),
  catalogue: getSavedState('gcp_catalogue', LOCAL_TEST_MODE ? initialCatalogue : []),
  suppliers: getSavedState('gcp_suppliers', LOCAL_TEST_MODE ? initialSuppliers : []),
  inventory: getSavedState('gcp_inventory', LOCAL_TEST_MODE ? initialInventory : []),
  toolAssets: getSavedState('gcp_toolAssets', []),
  toolTheftReports: getSavedState('gcp_toolTheftReports', []),
  orders: getSavedState('gcp_orders', LOCAL_TEST_MODE ? initialOrders : []),
  clients: getSavedState('gcp_clients', LOCAL_TEST_MODE ? initialClients : []),
  companyInfo: getSavedState('gcp_companyInfo', initialCompanyInfo),
  hrAlerts: getSavedState('gcp_hrAlerts', LOCAL_TEST_MODE ? initialHRAlerts : []),
  documents: getSavedState('gcp_documents', LOCAL_TEST_MODE ? initialDocuments : []),
  expenses: getSavedState('gcp_expenses', LOCAL_TEST_MODE ? initialExpenses : []),
  projectPhotos: getSavedState('gcp_projectPhotos', []),
  changeOrders: getSavedState('gcp_changeOrders', []),
  insuranceClaims: getSavedState('gcp_insuranceClaims', []),
  leads: getSavedState('gcp_leads', []),
  shiftAssignments: getSavedState('gcp_shiftAssignments', []),
  safetyRecords: getSavedState('gcp_safetyRecords', []),
  personalExpenses: getSavedState('gcp_personalExpenses', []),
  payrollPayments: getSavedState('gcp_payrollPayments', LOCAL_TEST_MODE ? initialPayrollPayments : []),
  motivationTeams: getSavedState('gcp_motivationTeams', LOCAL_TEST_MODE ? initialMotivationTeams : []),
  motivationGoals: getSavedState('gcp_motivationGoals', LOCAL_TEST_MODE ? initialMotivationGoals : []),
  weeklyGoals: getSavedState('gcp_weeklyGoals', LOCAL_TEST_MODE ? initialWeeklyGoals : []),
  
  activeEmployee: null,
  currentLanguage: getSavedState('gcp_currentLanguage', 'FR') as 'FR' | 'EN',
  currentTheme: getSavedState('gcp_currentTheme', 'quantum') as VisualTheme,
  offlineSyncStatus: 'synced',
  isOnboarded: getSavedState('gcp_isOnboarded', false),
  demoSandboxActive: false,
  demoSandboxSummary: null,

  // Actions
  setIsOnboarded: (val) => {
    set({ isOnboarded: val });
    saveState('gcp_isOnboarded', val);
  },

  activateDemoSandbox: async () => {
    const state = get();
    if (!state.activeEmployee || state.activeEmployee.role !== 'admin') return false;
    if (!demoSnapshot) demoSnapshot = captureDemoSnapshot(state);
    const { createFiveYearDemoDataset } = await import('./demoSandbox');
    const demo = createFiveYearDemoDataset(demoSnapshot.activeEmployee || state.activeEmployee);
    const { summary, activeEmployee, ...data } = demo;
    setDemoSandboxIsolation(true);
    set({
      ...data,
      activeEmployee,
      demoSandboxActive: true,
      demoSandboxSummary: summary,
      offlineSyncStatus: 'offline'
    });
    return true;
  },

  resetDemoSandbox: async () => {
    const state = get();
    const realAdministrator = demoSnapshot?.activeEmployee;
    if (!state.demoSandboxActive || !realAdministrator || realAdministrator.role !== 'admin') return false;
    const { createFiveYearDemoDataset } = await import('./demoSandbox');
    const demo = createFiveYearDemoDataset(realAdministrator);
    const { summary, activeEmployee, ...data } = demo;
    setDemoSandboxIsolation(true);
    set({
      ...data,
      activeEmployee,
      demoSandboxSummary: summary,
      offlineSyncStatus: 'offline'
    });
    return true;
  },

  deactivateDemoSandbox: async () => {
    const snapshot = demoSnapshot;
    demoSnapshot = null;
    setDemoSandboxIsolation(false);
    if (!snapshot) {
      set({ demoSandboxActive: false, demoSandboxSummary: null });
      return;
    }
    set({
      ...snapshot,
      demoSandboxActive: false,
      demoSandboxSummary: null
    });
    setCloudSyncAllowed(isServerBackedMode(snapshot.companyInfo.dataStorageMode));
    await get().hydrateCloud();
  },

  setLanguage: (currentLanguage) => {
    set({ currentLanguage });
    saveState('gcp_currentLanguage', currentLanguage);
  },
  
  setTheme: (currentTheme) => {
    set({ currentTheme });
    saveState('gcp_currentTheme', currentTheme);
  },

  login: async (nip, employeeId) => {
    const { employees, currentLanguage } = get();
    const emp = employees.find(e => e.id === employeeId);

    if (!emp) {
      return {
        success: false,
        message: currentLanguage === 'FR' ? 'Employé non trouvé.' : 'Employee not found.'
      };
    }

    // Hors serveur, il n'y a personne à interroger : la vérification se fait
    // sur l'appareil, contre l'empreinte dérivée du NIP. Ce chemin n'existe que
    // pour le client qui a choisi de ne créer aucun compte chez personne; en
    // mode Supabase, le serveur reste l'unique autorité.
    if (readStoragePersistence() === 'offline') {
      if (!(await verifyAccessCode(nip, emp.accessCodeHash))) {
        return {
          success: false,
          message: currentLanguage === 'FR' ? 'NIP incorrect.' : 'Incorrect PIN.'
        };
      }
      // Aucune remise à zéro des données ici, contrairement au chemin serveur :
      // il n'y a pas d'hydratation qui suivrait pour les remettre.
      set({ activeEmployee: { ...emp, nip: '' } });
      return {
        success: true,
        message: currentLanguage === 'FR' ? `Bienvenue, ${emp.name} !` : `Welcome, ${emp.name}!`
      };
    }

    // Le serveur est l'unique source d'authentification, y compris pour les
    // profils de démonstration. Une panne réseau ne peut jamais ouvrir une session.
    const server = await authLogin(employeeId, nip);
    if (server.status === 'ok' && server.user) {
      // Les consentements viennent du serveur dès la connexion : l'écran d'avis
      // de confidentialité ne doit réapparaître que pour quelqu'un qui ne l'a
      // réellement jamais accepté, jamais parce que l'hydratation tarde.
      const authenticatedEmployee: Employee = {
        ...emp,
        id: server.user.id,
        name: server.user.name || emp.name,
        role: normalizeAppRole(server.user.role),
        nip: '',
        privacyNoticeVersion: server.user.privacyNoticeVersion || undefined,
        privacyNoticeAcknowledgedAt: server.user.privacyNoticeAcknowledgedAt || undefined,
        locationNoticeAcknowledgedAt: server.user.locationNoticeAcknowledgedAt || undefined
      };
      set({
        activeEmployee: authenticatedEmployee,
        projects: [], punchSessions: [], invoices: [], catalogue: [], suppliers: [],
        inventory: [], toolAssets: [], toolTheftReports: [], orders: [], clients: [],
        hrAlerts: [], documents: [], expenses: [], projectPhotos: [], changeOrders: [],
        insuranceClaims: [], leads: [], shiftAssignments: [], safetyRecords: [],
        payrollPayments: [], motivationTeams: [], motivationGoals: [], weeklyGoals: []
      });
      // Recharge les données maintenant que la session est établie
      void get().hydrateCloud();
      return {
        success: true,
        message: currentLanguage === 'FR'
          ? `Bienvenue, ${authenticatedEmployee.name} !`
          : `Welcome, ${authenticatedEmployee.name}!`
      };
    }
    if (server.status === 'invalid') {
      return {
        success: false,
        message: currentLanguage === 'FR' ? 'NIP incorrect.' : 'Incorrect PIN.'
      };
    }
    if (server.status === 'expired') {
      return {
        success: false,
        message: currentLanguage === 'FR'
          ? 'Votre accès temporaire est arrivé à échéance. Contactez l’administrateur.'
          : 'Your temporary access has expired. Contact the administrator.'
      };
    }
    if (server.status === 'throttled') {
      return {
        success: false,
        message: currentLanguage === 'FR'
          ? 'Trop de tentatives. Réessayez dans quelques minutes.'
          : 'Too many attempts. Try again in a few minutes.'
      };
    }

    return {
      success: false,
      message: currentLanguage === 'FR'
        ? 'Connexion sécurisée indisponible. Réessayez lorsque le serveur est accessible.'
        : 'Secure sign-in is unavailable. Try again when the server is reachable.'
    };
  },

  logout: () => {
    demoSnapshot = null;
    setDemoSandboxIsolation(false);
    void authLogout();
    // Hors serveur, l'appareil est la seule copie : tout vider à la
    // déconnexion effacerait l'entreprise, et l'écran de connexion n'aurait
    // plus personne à proposer. On ne referme que la session.
    if (readStoragePersistence() === 'offline') {
      set({ activeEmployee: null, demoSandboxActive: false, demoSandboxSummary: null });
      return;
    }

    set({
      activeEmployee: null, employees: [], projects: [], punchSessions: [], invoices: [],
      catalogue: [], suppliers: [], inventory: [], toolAssets: [], toolTheftReports: [],
      orders: [], clients: [], hrAlerts: [], documents: [], expenses: [], projectPhotos: [],
      changeOrders: [], insuranceClaims: [], leads: [], shiftAssignments: [], safetyRecords: [],
      personalExpenses: [], payrollPayments: [], motivationTeams: [], motivationGoals: [], weeklyGoals: [],
      demoSandboxActive: false, demoSandboxSummary: null
    });
    void fetchLoginDirectory().then(directory => {
      if (get().activeEmployee || directory.length === 0) return;
      set({ employees: directory.map(user => ({
        id: user.id, name: user.name, nip: '', role: 'employee', hourlyRate: 0,
        workerType: '', asNumber: '', phone: '', address: '', hireDate: '',
        avatar: user.avatar || '', level: 1, xp: 0
      })) });
    });
  },

  // Employees CRUD
  addEmployee: (emp) => {
    const { employees } = get();
    const employeeForServer: Employee = {
      ...emp,
      id: genId(),
      level: 1,
      xp: 0
    };
    const newEmp: Employee = { ...employeeForServer, nip: '' };
    const updated = [...employees, newEmp];
    set({ employees: updated });
    saveState('gcp_employees', updated);
    if (!LOCAL_TEST_MODE) syncInsert('app_users', employeeToRow(employeeForServer));
    void storeLocalAccessCode(newEmp.id, emp.nip);

    // Auto trigger alert
    get().addHRAlert({
      type: 'info',
      title: 'Nouvel employé embauché',
      message: `L'employé ${newEmp.name} (${newEmp.workerType}) a été ajouté administrativement.`,
      employeeId: newEmp.id,
      employeeName: newEmp.name
    });
  },

  updateEmployee: (emp) => {
    const { employees, activeEmployee } = get();
    const employeeForServer = emp;
    // L'empreinte déjà enregistrée est conservée : une modification de fiche
    // qui laisse le champ NIP vide ne doit pas verrouiller la personne dehors.
    const previous = employees.find(e => e.id === emp.id);
    const safeEmployee = {
      ...emp,
      nip: '',
      accessCodeHash: emp.accessCodeHash || previous?.accessCodeHash
    };
    const updated = employees.map(e => e.id === emp.id ? safeEmployee : e);
    set({ employees: updated });
    saveState('gcp_employees', updated);
    if (!LOCAL_TEST_MODE) syncUpdate('app_users', emp.id, employeeToRow(employeeForServer));
    void storeLocalAccessCode(emp.id, emp.nip);

    if (activeEmployee && activeEmployee.id === emp.id) {
      set({ activeEmployee: safeEmployee });
    }
  },

  acknowledgePrivacyNotice: async () => {
    const employee = get().activeEmployee;
    if (!employee) throw new Error('Aucun employé connecté');

    const acknowledgement = LOCAL_TEST_MODE
      ? (() => {
          const now = new Date().toISOString();
          return {
            privacyNoticeVersion: USER_PRIVACY_NOTICE_VERSION,
            privacyNoticeAcknowledgedAt: now,
            locationNoticeAcknowledgedAt: now
          };
        })()
      : await savePrivacyNoticeAcknowledgement();

    // La session peut avoir été fermée pendant la requête. Dans ce cas, ne
    // réactive jamais localement l'ancien utilisateur après sa déconnexion.
    const current = get().activeEmployee;
    if (!current || current.id !== employee.id) return;
    const updated = { ...current, ...acknowledgement };
    set(state => ({
      activeEmployee: updated,
      employees: state.employees.map(item => item.id === updated.id ? updated : item)
    }));
  },

  // Le travailleur soumet sa propre carte. C'est le serveur qui décide de la
  // ligne écrite et impose le statut « soumise » : le navigateur n'envoie que
  // le contenu de la carte, jamais son identifiant d'employé ni son verdict.
  submitOwnCredential: async (submission) => {
    const employee = get().activeEmployee;
    if (!employee) throw new Error('Aucun employé connecté');

    const credential = LOCAL_TEST_MODE
      ? buildSubmittedCredential(submission, employee.id, `local-${Date.now()}`)
      : await submitCredential(submission);

    // La session a pu se fermer pendant l'envoi : on ne fait pas réapparaître
    // un utilisateur déconnecté.
    const current = get().activeEmployee;
    if (!current || current.id !== employee.id) return;
    const updated = { ...current, credentials: [...(current.credentials || []), credential] };
    set(state => ({
      activeEmployee: updated,
      employees: state.employees.map(item => item.id === updated.id ? updated : item)
    }));
    saveState('gcp_employees', get().employees);
  },

  reviewEmployeeCredential: async (employeeId, credentialId, decision) => {
    const reviewer = get().activeEmployee;
    if (!reviewer) throw new Error('Aucun employé connecté');

    const target = get().employees.find(item => item.id === employeeId);
    const existing = (target?.credentials || []).find(item => item.id === credentialId);
    if (!existing) throw new Error('Carte introuvable');

    const decided = LOCAL_TEST_MODE
      ? applyReview(existing, {
          approved: decision.approved,
          reviewerId: reviewer.id,
          method: decision.method as any,
          note: decision.note
        })
      : await reviewCredential(employeeId, credentialId, decision);

    set(state => ({
      employees: state.employees.map(item => item.id === employeeId
        ? { ...item, credentials: (item.credentials || []).map(c => c.id === credentialId ? decided : c) }
        : item),
      activeEmployee: state.activeEmployee?.id === employeeId
        ? { ...state.activeEmployee, credentials: (state.activeEmployee.credentials || []).map(c => c.id === credentialId ? decided : c) }
        : state.activeEmployee
    }));
    saveState('gcp_employees', get().employees);
  },

  deleteEmployee: (id) => {
    const { employees, activeEmployee, projects, motivationTeams, weeklyGoals } = get();
    const updated = employees.filter(e => e.id !== id);
    set({ employees: updated });
    saveState('gcp_employees', updated);
    if (!LOCAL_TEST_MODE) syncDelete('app_users', id);

    // Nettoie les références à l'employé supprimé pour éviter des données fantômes
    const updatedProjects = projects.map(p => ({
      ...p,
      assignedEmployees: p.assignedEmployees.filter(empId => empId !== id)
    }));
    set({ projects: updatedProjects });
    saveState('gcp_projects', updatedProjects);
    updatedProjects.forEach((p, idx) => {
      if (p.assignedEmployees.length !== projects[idx].assignedEmployees.length) syncProjectChildren(p);
    });

    const updatedTeams = motivationTeams.map(team => ({
      ...team,
      memberIds: team.memberIds.filter(empId => empId !== id),
      leaderId: team.leaderId === id ? undefined : team.leaderId
    }));
    set({ motivationTeams: updatedTeams });
    saveState('gcp_motivationTeams', updatedTeams);
    updatedTeams.forEach((team, idx) => {
      if (team.memberIds.length !== motivationTeams[idx].memberIds.length || team.leaderId !== motivationTeams[idx].leaderId) {
        syncUpdate('motivation_teams', team.id, motivationTeamToRow(team));
      }
    });

    const updatedWeeklyGoals = weeklyGoals.filter(wg => wg.employeeId !== id);
    set({ weeklyGoals: updatedWeeklyGoals });
    saveState('gcp_weeklyGoals', updatedWeeklyGoals);
    syncDelete('weekly_goals', id);

    // Déconnecte la session active si l'employé supprimé était celui connecté
    if (activeEmployee && activeEmployee.id === id) {
      void authLogout();
      set({ activeEmployee: null });
    }
  },

  addXP: (employeeId, amount) => {
    const { employees, activeEmployee } = get();
    const updated = employees.map(e => {
      if (e.id === employeeId) {
        const newXp = e.xp + amount;
        const newLevel = getLevelFromXP(newXp);
        return {
          ...e,
          xp: newXp,
          level: newLevel > e.level ? newLevel : e.level
        };
      }
      return e;
    });
    set({ employees: updated });
    saveState('gcp_employees', updated);
    const changedEmp = updated.find(e => e.id === employeeId);
    if (changedEmp) syncUpdate('app_users', employeeId, { xp: changedEmp.xp, level: changedEmp.level });

    // Sync active session if this is the active employee
    if (activeEmployee && activeEmployee.id === employeeId) {
      const updatedActive = updated.find(e => e.id === employeeId) || null;
      set({ activeEmployee: updatedActive });
    }

    get().recomputeGoalsAndStreaks();
  },

  // Teams Action
  addMotivationTeam: (team) => {
    const { motivationTeams } = get();
    const newTeam: MotivationTeam = {
      ...team,
      id: genId(),
      active: true,
      createdAt: new Date().toISOString()
    };
    const updated = [...motivationTeams, newTeam];
    set({ motivationTeams: updated });
    saveState('gcp_motivationTeams', updated);
    syncInsert('motivation_teams', motivationTeamToRow(newTeam));
    get().recomputeGoalsAndStreaks();
  },

  updateMotivationTeam: (team) => {
    const { motivationTeams } = get();
    const updated = motivationTeams.map(t => t.id === team.id ? team : t);
    set({ motivationTeams: updated });
    saveState('gcp_motivationTeams', updated);
    syncUpdate('motivation_teams', team.id, motivationTeamToRow(team));
    get().recomputeGoalsAndStreaks();
  },

  deleteMotivationTeam: (id) => {
    const { motivationTeams } = get();
    const updated = motivationTeams.filter(t => t.id !== id);
    set({ motivationTeams: updated });
    saveState('gcp_motivationTeams', updated);
    syncDelete('motivation_teams', id);
    get().recomputeGoalsAndStreaks();
  },

  // Motivation Goals Action
  addMotivationGoal: (goal) => {
    const { motivationGoals } = get();
    const newGoal: MotivationGoal = {
      ...goal,
      id: genId(),
      startDate: todayKey(),
      current: 0,
      status: 'active'
    };
    const updated = [...motivationGoals, newGoal];
    set({ motivationGoals: updated });
    saveState('gcp_motivationGoals', updated);
    syncInsert('motivation_goals', motivationGoalToRow(newGoal));
    get().recomputeGoalsAndStreaks();
  },

  updateMotivationGoal: (goal) => {
    const { motivationGoals } = get();
    const updated = motivationGoals.map(g => g.id === goal.id ? goal : g);
    set({ motivationGoals: updated });
    saveState('gcp_motivationGoals', updated);
    syncUpdate('motivation_goals', goal.id, motivationGoalToRow(goal));
    get().recomputeGoalsAndStreaks();
  },

  deleteMotivationGoal: (id) => {
    const { motivationGoals } = get();
    const updated = motivationGoals.filter(g => g.id !== id);
    set({ motivationGoals: updated });
    saveState('gcp_motivationGoals', updated);
    syncDelete('motivation_goals', id);
    get().recomputeGoalsAndStreaks();
  },

  manualProgressGoal: (goalId, increment) => {
    const { motivationGoals } = get();
    const updated = motivationGoals.map(g => {
      if (g.id === goalId) {
        const nextVal = Math.max(0, g.current + increment);
        const achievedStatus = nextVal >= g.target ? 'achieved' : g.status === 'achieved' && nextVal < g.target ? 'active' : g.status;
        return { ...g, current: nextVal, status: achievedStatus };
      }
      return g;
    });
    set({ motivationGoals: updated });
    saveState('gcp_motivationGoals', updated);
    const changedGoal = updated.find(g => g.id === goalId);
    if (changedGoal) syncUpdate('motivation_goals', goalId, motivationGoalToRow(changedGoal));
    get().recomputeGoalsAndStreaks();
  },

  recomputeGoalsAndStreaks: () => {
    const { punchSessions, employees, motivationTeams, motivationGoals, weeklyGoals } = get();
    const currentMonday = getStartOfWeekISO();
    
    // 1. Update WeeklyGoals
    const updatedWeeklyGoals = [...weeklyGoals];
    
    employees.forEach(emp => {
      let wgIdx = updatedWeeklyGoals.findIndex(wg => wg.employeeId === emp.id);
      
      // If none exists, create default
      if (wgIdx === -1) {
        updatedWeeklyGoals.push({
          employeeId: emp.id,
          targetAmount: emp.role === 'admin' ? 3000 : 1500, // default target
          currentAmount: 0,
          weekStart: currentMonday,
          xpPoints: emp.xp,
          level: emp.level,
          streak: 1,
          lastPunchDate: null
        });
        wgIdx = updatedWeeklyGoals.length - 1;
      }
      
      // Clone avant mutation : l'entrée peut être la même référence que dans
      // l'état précédent (weeklyGoals), la muter directement corromprait l'ancien snapshot.
      const wg = { ...updatedWeeklyGoals[wgIdx] };
      updatedWeeklyGoals[wgIdx] = wg;

      // Reset on new week
      if (wg.weekStart !== currentMonday) {
        wg.weekStart = currentMonday;
        wg.currentAmount = 0;
      }
      
      // Compute current week revenue
      const empPunchesThisWeek = punchSessions.filter(p => {
        if (p.employeeId !== emp.id) return false;
        const punchDate = localDayKey(p.startTime);
        return punchDate >= currentMonday;
      });
      
      const weeklyRevenue = empPunchesThisWeek.reduce((sum, p) => sum + (p.revenue || 0), 0);
      wg.currentAmount = Number(weeklyRevenue.toFixed(2));
      
      // Sync XP and Level
      wg.xpPoints = emp.xp;
      wg.level = emp.level;
      
      // Streak logic
      const empPunches = punchSessions.filter(p => p.employeeId === emp.id && p.endTime !== null);
      if (empPunches.length > 0) {
        const sortedPunches = [...empPunches].sort((a,b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
        // Les journées viennent du fuseau local et incluent les deux journées
        // d'un pointage de nuit : une série ne doit pas se briser parce qu'un
        // quart s'est terminé après minuit.
        const uniqueDates = Array.from(new Set(sortedPunches.flatMap(p => punchDayKeys(p))))
          .sort((a, b) => b.localeCompare(a));

        let streak = 0;
        let todayStr = todayKey();
        let yesterdayStr = localDayKey(Date.now() - 86400000);
        
        if (uniqueDates[0] === todayStr || uniqueDates[0] === yesterdayStr) {
          streak = 1;
          for (let i = 0; i < uniqueDates.length - 1; i++) {
            const currentD = new Date(uniqueDates[i]);
            const prevD = new Date(uniqueDates[i+1]);
            const diffTime = Math.abs(currentD.getTime() - prevD.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays === 1) {
              streak++;
            } else if (diffDays > 1) {
              break;
            }
          }
        } else {
          streak = 0;
        }
        wg.streak = Math.max(1, streak);
        wg.lastPunchDate = uniqueDates[0] || null;
      }
    });
    
    // 2. Update Motivation Goals
    const updatedMotivationGoals = motivationGoals.map(goal => {
      let computedVal = goal.current;
      let relevantPunches = punchSessions.filter(p => p.endTime !== null);
      
      if (goal.scope === 'individual' && goal.employeeId) {
        relevantPunches = relevantPunches.filter(p => p.employeeId === goal.employeeId);
      } else if (goal.scope === 'team' && goal.teamId) {
        const team = motivationTeams.find(t => t.id === goal.teamId);
        if (team) {
          relevantPunches = relevantPunches.filter(p => team.memberIds.includes(p.employeeId));
        } else {
          relevantPunches = [];
        }
      }
      
      if (goal.metric === 'revenue') {
        computedVal = Number(relevantPunches.reduce((sum, p) => sum + (p.revenue || 0), 0).toFixed(2));
      } else if (goal.metric === 'hours') {
        computedVal = Number(relevantPunches.reduce((sum, p) => sum + (p.totalWorkedHours || 0), 0).toFixed(1));
      } else if (goal.metric === 'jobs_completed') {
        computedVal = relevantPunches.length;
      } else if (goal.metric === 'checklist_done') {
        computedVal = relevantPunches.reduce((sum, p) => sum + (p.surfaceMaterials?.reduce((s, m) => s + m.quantity, 0) || 0), 0);
      } else if (goal.metric === 'safety_days') {
        const safePunches = relevantPunches.filter(p => !p.attemptedOutsideGeofence);
        const uniqueSafeDates = new Set(safePunches.flatMap(p => punchDayKeys(p)));
        computedVal = uniqueSafeDates.size;
      } else {
        computedVal = goal.current;
      }
      
      let status = goal.status;
      if (status === 'active' && computedVal >= goal.target) {
        status = 'achieved';
        
        // Push notification simulation
        // Award XP on success
        if (goal.scope === 'individual' && goal.employeeId) {
          setTimeout(() => {
            get().addXP(goal.employeeId!, 500);
          }, 10);
        } else if (goal.scope === 'team' && goal.teamId) {
          const team = motivationTeams.find(t => t.id === goal.teamId);
          if (team) {
            setTimeout(() => {
              team.memberIds.forEach(mId => get().addXP(mId, 300));
            }, 10);
          }
        } else if (goal.scope === 'company') {
          setTimeout(() => {
            employees.forEach(e => get().addXP(e.id, 200));
          }, 10);
        }
      }
      
      return { ...goal, current: computedVal, status };
    });
    
    set({ weeklyGoals: updatedWeeklyGoals, motivationGoals: updatedMotivationGoals });
    saveState('gcp_weeklyGoals', updatedWeeklyGoals);
    saveState('gcp_motivationGoals', updatedMotivationGoals);
    updatedWeeklyGoals.forEach(wg => syncUpsert('weekly_goals', weeklyGoalToRow(wg)));
    updatedMotivationGoals.forEach(g => syncUpdate('motivation_goals', g.id, motivationGoalToRow(g)));
  },

  // Projects CRUD
  addProject: (proj) => {
    const { projects } = get();
    const newProj: Project = {
      ...proj,
      id: genId()
    };
    const updated = [...projects, newProj];
    set({ projects: updated });
    saveState('gcp_projects', updated);
    syncProjectInsert(newProj);
  },

  updateProject: (proj) => {
    const { projects } = get();
    const updated = projects.map(p => p.id === proj.id ? proj : p);
    set({ projects: updated });
    saveState('gcp_projects', updated);
    syncUpdate('projects', proj.id, projectToRow(proj));
    syncProjectChildren(proj);
  },

  deleteProject: (id) => {
    const { projects, motivationTeams } = get();
    const updated = projects.filter(p => p.id !== id);
    set({ projects: updated });
    saveState('gcp_projects', updated);
    // Les enfants sont supprimés par les clés étrangères ON DELETE CASCADE.
    syncDelete('projects', id);

    // Retire toute référence au chantier supprimé dans les équipes de motivation
    const updatedTeams = motivationTeams.map(team => ({
      ...team,
      projectIds: team.projectIds?.filter(projId => projId !== id)
    }));
    set({ motivationTeams: updatedTeams });
    saveState('gcp_motivationTeams', updatedTeams);
  },

  // Catalogue CRUD
  addCatalogueMaterial: (item) => {
    const { catalogue } = get();
    const newItem: CatalogueMaterial = {
      ...item,
      id: genId()
    };
    const updated = [...catalogue, newItem];
    set({ catalogue: updated });
    saveState('gcp_catalogue', updated);
    syncInsert('catalog_items', catalogueToRow(newItem));
  },

  updateCatalogueMaterial: (item) => {
    const { catalogue } = get();
    const updated = catalogue.map(c => c.id === item.id ? item : c);
    set({ catalogue: updated });
    saveState('gcp_catalogue', updated);
    syncUpdate('catalog_items', item.id, catalogueToRow(item));
  },

  deleteCatalogueMaterial: (id) => {
    const { catalogue } = get();
    const updated = catalogue.filter(c => c.id !== id);
    set({ catalogue: updated });
    saveState('gcp_catalogue', updated);
    syncDelete('catalog_items', id);
  },

  // Supplier CRUD
  addSupplier: (supplier) => {
    const { suppliers } = get();
    const newSupplier: Supplier = {
      ...supplier,
      id: genId()
    };
    const updated = [...suppliers, newSupplier];
    set({ suppliers: updated });
    saveState('gcp_suppliers', updated);
    syncInsert('suppliers', supplierToRow(newSupplier));
  },

  updateSupplier: (supplier) => {
    const { suppliers } = get();
    const updated = suppliers.map(s => s.id === supplier.id ? supplier : s);
    set({ suppliers: updated });
    saveState('gcp_suppliers', updated);
    syncUpdate('suppliers', supplier.id, supplierToRow(supplier));
  },

  deleteSupplier: (id) => {
    const { suppliers } = get();
    const updated = suppliers.filter(s => s.id !== id);
    set({ suppliers: updated });
    saveState('gcp_suppliers', updated);
    syncDelete('suppliers', id);
  },

  // Inventory CRUD
  addInventoryItem: (item) => {
    const { inventory } = get();
    const newItem: InventoryItem = {
      ...item,
      id: genId()
    };
    const updated = [...inventory, newItem];
    set({ inventory: updated });
    saveState('gcp_inventory', updated);
    syncInsert('inventory_items', inventoryToRow(newItem));
  },

  updateInventoryItem: (item) => {
    const { inventory } = get();
    const updated = inventory.map(i => i.id === item.id ? item : i);
    set({ inventory: updated });
    saveState('gcp_inventory', updated);
    syncUpdate('inventory_items', item.id, inventoryToRow(item));

    // Trigger alert if stock is critical
    if (item.quantity < item.minThreshold) {
      get().addHRAlert({
        type: 'warning',
        title: 'Stock critique détecté',
        message: `Le matériau "${item.name}" (${item.quantity} ${item.unit}) est passé sous le seuil minimum de ${item.minThreshold}.`
      });
    }
  },

  deleteInventoryItem: (id) => {
    const { inventory } = get();
    const updated = inventory.filter(i => i.id !== id);
    set({ inventory: updated });
    saveState('gcp_inventory', updated);
    syncDelete('inventory_items', id);
  },


  addToolAsset: (tool) => {
    const { toolAssets } = get();
    const now = new Date().toISOString();
    const newTool: ToolAsset = { ...tool, id: genId(), createdAt: now, updatedAt: now };
    const updated = [newTool, ...toolAssets];
    set({ toolAssets: updated });
    saveState('gcp_toolAssets', updated);
    syncInsert('tool_assets', toolAssetToRow(newTool));
  },

  updateToolAsset: (tool) => {
    const { toolAssets } = get();
    const normalized = { ...tool, updatedAt: tool.updatedAt || new Date().toISOString() };
    const updated = toolAssets.map(item => item.id === normalized.id ? normalized : item);
    set({ toolAssets: updated });
    saveState('gcp_toolAssets', updated);
    syncUpdate('tool_assets', normalized.id, toolAssetToRow(normalized));
  },

  deleteToolAsset: (id) => {
    const { toolAssets } = get();
    const updated = toolAssets.filter(tool => tool.id !== id);
    set({ toolAssets: updated });
    saveState('gcp_toolAssets', updated);
    syncDelete('tool_assets', id);
  },

  addToolTheftReport: (report) => {
    const { toolTheftReports } = get();
    const now = new Date().toISOString();
    const newReport: ToolTheftReport = { ...report, id: genId(), createdAt: now, updatedAt: now };
    const updated = [newReport, ...toolTheftReports];
    set({ toolTheftReports: updated });
    saveState('gcp_toolTheftReports', updated);
    syncInsert('tool_theft_reports', toolTheftReportToRow(newReport));
  },

  updateToolTheftReport: (report) => {
    const { toolTheftReports } = get();
    const normalized = { ...report, updatedAt: report.updatedAt || new Date().toISOString() };
    const updated = toolTheftReports.map(item => item.id === normalized.id ? normalized : item);
    set({ toolTheftReports: updated });
    saveState('gcp_toolTheftReports', updated);
    syncUpdate('tool_theft_reports', normalized.id, toolTheftReportToRow(normalized));
  },

  deleteToolTheftReport: (id) => {
    const { toolTheftReports } = get();
    const updated = toolTheftReports.filter(report => report.id !== id);
    set({ toolTheftReports: updated });
    saveState('gcp_toolTheftReports', updated);
    syncDelete('tool_theft_reports', id);
  },

  // Orders CRUD
  addSupplierOrder: (order) => {
    const { orders, inventory } = get();
    const newOrder: SupplierOrder = {
      ...order,
      id: genId()
    };
    const updatedOrders = [...orders, newOrder];
    set({ orders: updatedOrders });
    saveState('gcp_orders', updatedOrders);
    syncInsert('supplier_orders', supplierOrderToRow(newOrder));
    syncOrderItems(newOrder);

    // If order received, update stock
    if (newOrder.status === 'received') {
      const updatedInventory = inventory.map(invItem => {
        const orderItem = newOrder.items.find(item => item.name.toLowerCase() === invItem.name.toLowerCase());
        if (orderItem) {
          const nextItem = { ...invItem, quantity: invItem.quantity + orderItem.quantity };
          syncUpdate('inventory_items', nextItem.id, inventoryToRow(nextItem));
          return nextItem;
        }
        return invItem;
      });
      set({ inventory: updatedInventory });
      saveState('gcp_inventory', updatedInventory);
    }
  },

  updateSupplierOrder: (order) => {
    const { orders, inventory } = get();
    // Check if status changed to received
    const original = orders.find(o => o.id === order.id);
    const updatedOrders = orders.map(o => o.id === order.id ? order : o);
    set({ orders: updatedOrders });
    saveState('gcp_orders', updatedOrders);
    syncUpdate('supplier_orders', order.id, supplierOrderToRow(order));
    syncOrderItems(order);

    if (original && original.status !== 'received' && order.status === 'received') {
      // Add items to stock
      const updatedInventory = inventory.map(invItem => {
        const orderItem = order.items.find(item => item.name.toLowerCase() === invItem.name.toLowerCase());
        if (orderItem) {
          const nextItem = { ...invItem, quantity: invItem.quantity + orderItem.quantity };
          syncUpdate('inventory_items', nextItem.id, inventoryToRow(nextItem));
          return nextItem;
        }
        return invItem;
      });
      set({ inventory: updatedInventory });
      saveState('gcp_inventory', updatedInventory);
    }
  },

  // Clients CRUD
  addClient: (cli) => {
    const { clients } = get();
    const newCli: Client = {
      ...cli,
      id: genId()
    };
    const updated = [...clients, newCli];
    set({ clients: updated });
    saveState('gcp_clients', updated);
    syncInsert('clients', clientToRow(newCli));
  },

  updateClient: (cli) => {
    const { clients } = get();
    const updated = clients.map(c => c.id === cli.id ? cli : c);
    set({ clients: updated });
    saveState('gcp_clients', updated);
    syncUpdate('clients', cli.id, clientToRow(cli));
  },

  deleteClient: (id) => {
    const { clients } = get();
    const updated = clients.filter(c => c.id !== id);
    set({ clients: updated });
    saveState('gcp_clients', updated);
    syncDelete('clients', id);
  },

  // Company Info Update
  updateCompanyInfo: (info) => {
    const { companyInfo } = get();
    const updated = { ...companyInfo, ...info };
    set({ companyInfo: updated });
    saveState('gcp_companyInfo', updated);
    setCloudSyncAllowed(isServerBackedMode(updated.dataStorageMode));
    // Les journées de travail suivent le fuseau de la compagnie dès qu'il est
    // défini; sinon celui de l'appareil continue de s'appliquer.
    setAppTimeZone(updated.timeZone);
    const companyId = getCompanyId();
    if (companyId) syncUpdate('companies', companyId, companyInfoToRow(updated));
  },

  // HR Alerts
  addHRAlert: (alert) => {
    const { hrAlerts } = get();
    const newAlert: HRAlert = {
      ...alert,
      id: genId(),
      date: new Date().toISOString(),
      resolved: false
    };
    const updated = [newAlert, ...hrAlerts];
    set({ hrAlerts: updated });
    saveState('gcp_hrAlerts', updated);
    syncInsert('hr_alerts', hrAlertToRow(newAlert));
  },

  resolveHRAlert: (id) => {
    const { hrAlerts } = get();
    const updated = hrAlerts.map(h => h.id === id ? { ...h, resolved: true } : h);
    set({ hrAlerts: updated });
    saveState('gcp_hrAlerts', updated);
    syncUpdate('hr_alerts', id, { resolved: true });
  },

  // Punch Sessions
  startPunchSession: ({ employeeId, projectId, payMode, rate, withinGeofence, attemptedOutsideGeofence, outsideDetails, latitude, longitude, needsApproval }) => {
    const { punchSessions, employees, projects } = get();
    const emp = employees.find(e => e.id === employeeId);
    const proj = projects.find(p => p.id === projectId);
    
    if (!emp || !proj) return;

    // Check if employee already has active punch
    const active = punchSessions.find(p => p.employeeId === employeeId && p.endTime === null);
    if (active) return; // Prevent multiple active punches

    const newPunch: PunchSession = {
      id: genId(),
      employeeId,
      employeeName: emp.name,
      projectId,
      projectName: proj.name,
      payMode,
      rate,
      startTime: new Date().toISOString(),
      endTime: null,
      pausedAt: null,
      totalPauseMinutes: 0,
      withinGeofence,
      attemptedOutsideGeofence,
      outsideDetails,
      latitude,
      longitude,
      revenue: 0,
      // Sans position vérifiable, le quart ne peut pas se déclarer conforme :
      // il part explicitement en attente de vérification du bureau.
      approvalStatus: needsApproval ? 'pending' : undefined
    };

    const updated = [newPunch, ...punchSessions];
    set({ punchSessions: updated });
    saveState('gcp_punchSessions', updated);
    syncInsert('punches', punchToRow(newPunch));

    // If attempted outside geofence, log infraction as HR alert
    if (attemptedOutsideGeofence) {
      get().addHRAlert({
        type: 'danger',
        title: 'Tentative de Punch hors-zone',
        message: `${emp.name} a tenté de puncher sur le chantier "${proj.name}" mais était ${outsideDetails || 'hors zone'}.`,
        employeeId: emp.id,
        employeeName: emp.name
      });
    }
  },

  pausePunchSession: (id) => {
    const { punchSessions } = get();
    const updated = punchSessions.map(p => {
      if (p.id === id) {
        return {
          ...p,
          pausedAt: new Date().toISOString()
        };
      }
      return p;
    });
    set({ punchSessions: updated });
    saveState('gcp_punchSessions', updated);
    const paused = updated.find(p => p.id === id);
    if (paused) syncUpdate('punches', id, { paused_at: paused.pausedAt });
  },

  resumePunchSession: (id) => {
    const { punchSessions } = get();
    const updated = punchSessions.map(p => {
      if (p.id === id && p.pausedAt) {
        const pauseStart = new Date(p.pausedAt).getTime();
        const pauseEnd = new Date().getTime();
        const diffMinutes = Math.max(0, (pauseEnd - pauseStart) / 60000);
        return {
          ...p,
          pausedAt: null,
          totalPauseMinutes: p.totalPauseMinutes + diffMinutes
        };
      }
      return p;
    });
    set({ punchSessions: updated });
    saveState('gcp_punchSessions', updated);
    const resumed = updated.find(p => p.id === id);
    if (resumed) syncUpdate('punches', id, { paused_at: null, total_pause_minutes: resumed.totalPauseMinutes });
  },

  stopPunchSession: (id, surfaceMaterials) => {
    const { punchSessions } = get();
    // Idempotence : un second appel (double clic, retour réseau, rejeu hors
    // ligne) ne doit ni rallonger les heures, ni redonner l'XP, ni retirer une
    // deuxième fois les matériaux de l'inventaire. On sort avant tout effet.
    const target = punchSessions.find(p => p.id === id);
    if (!target || target.endTime !== null) return;

    const updated = punchSessions.map(p => {
      if (p.id === id) {
        const endTime = new Date().toISOString();
        const end = new Date(endTime).getTime();

        // Si la session est toujours en pause au moment de l'arrêt, on compte
        // le temps de pause en cours pour ne pas le facturer comme du travail.
        let totalPauseMinutes = p.totalPauseMinutes;
        if (p.pausedAt) {
          const pauseStart = new Date(p.pausedAt).getTime();
          totalPauseMinutes += Math.max(0, (end - pauseStart) / 60000);
        }

        // Heures et montant viennent de la formule commune : l'arrêt du
        // pointage et la correction administrative doivent toujours produire
        // le même résultat pour les mêmes bornes.
        const closed = { ...p, endTime, pausedAt: null, totalPauseMinutes, surfaceMaterials };
        const totals = recomputePunchTotals(closed);

        return {
          ...closed,
          ...totals,
          // Un quart fermé attend la vérification du bureau avant de servir de
          // base ferme à la paie et à la facturation.
          approvalStatus: 'pending' as const
        };
      }
      return p;
    });

    set({ punchSessions: updated });
    saveState('gcp_punchSessions', updated);

    // Give some XP for completing work session!
    const stoppedPunch = updated.find(p => p.id === id);
    if (stoppedPunch) {
      syncUpdate('punches', id, punchToRow(stoppedPunch));
      const xpPoints = stoppedPunch.payMode === 'surface' ? 350 : Math.ceil((stoppedPunch.totalWorkedHours || 0) * 50);
      get().addXP(stoppedPunch.employeeId, xpPoints);

      // Save a log of inventory material removal if surface materials were declared
      if (surfaceMaterials && surfaceMaterials.length > 0) {
        const { inventory } = get();
        const updatedInventory = inventory.map(item => {
          const used = surfaceMaterials.find(m => m.name.toLowerCase() === item.name.toLowerCase());
          if (used) {
            const newQty = Math.max(0, item.quantity - used.quantity);
            const nextItem = { ...item, quantity: newQty };
            syncUpdate('inventory_items', nextItem.id, inventoryToRow(nextItem));
            return nextItem;
          }
          return item;
        });
        set({ inventory: updatedInventory });
        saveState('gcp_inventory', updatedInventory);
      }
    }
  },

  // ---------------------------------------------------------------------
  // Validation administrative des heures
  // ---------------------------------------------------------------------
  // Un pointage erroné (oubli de punch out, mauvais chantier) était jusqu'ici
  // irréparable : personne, pas même l'administrateur, ne pouvait corriger.
  // La correction recalcule les totaux avec la même formule que l'arrêt du
  // pointage, journalise l'auteur et propage aux factures brouillons.
  correctPunchSession: (id, changes, note) => {
    const { punchSessions, activeEmployee, currentLanguage } = get();
    const isFR = currentLanguage === 'FR';
    const editor = activeEmployee;
    if (!editor || (editor.role !== 'admin' && editor.role !== 'secretary')) {
      return { ok: false, message: isFR ? 'Correction réservée à la gestion.' : 'Corrections are reserved for management.' };
    }
    const target = punchSessions.find(p => p.id === id);
    if (!target) {
      return { ok: false, message: isFR ? 'Pointage introuvable.' : 'Punch not found.' };
    }
    if (!target.endTime) {
      return { ok: false, message: isFR ? 'Terminez le pointage avant de le corriger.' : 'Close the punch before correcting it.' };
    }

    const nextStart = changes.startTime || target.startTime;
    const nextEnd = changes.endTime || target.endTime;
    const nextPause = changes.totalPauseMinutes === undefined
      ? target.totalPauseMinutes
      : Math.max(0, changes.totalPauseMinutes);

    if (Number.isNaN(new Date(nextStart).getTime()) || Number.isNaN(new Date(nextEnd).getTime())) {
      return { ok: false, message: isFR ? 'Date ou heure invalide.' : 'Invalid date or time.' };
    }
    if (new Date(nextEnd).getTime() <= new Date(nextStart).getTime()) {
      return { ok: false, message: isFR ? 'La fin doit suivre le début.' : 'End must come after start.' };
    }
    const elapsedMinutes = (new Date(nextEnd).getTime() - new Date(nextStart).getTime()) / 60000;
    if (nextPause > elapsedMinutes) {
      return { ok: false, message: isFR ? 'La pause dépasse la durée du quart.' : 'Break exceeds the shift length.' };
    }

    const at = new Date().toISOString();
    const trace: PunchCorrection[] = [];
    const noter = (field: PunchCorrection['field'], before: string, after: string) => {
      if (before === after) return;
      trace.push({ at, byId: editor.id, byName: editor.name, field, before, after, note });
    };
    noter('startTime', target.startTime, nextStart);
    noter('endTime', target.endTime, nextEnd);
    noter('pauseMinutes', String(target.totalPauseMinutes), String(nextPause));

    if (trace.length === 0) {
      return { ok: false, message: isFR ? 'Aucun changement à enregistrer.' : 'Nothing to change.' };
    }

    const draft: PunchSession = { ...target, startTime: nextStart, endTime: nextEnd, totalPauseMinutes: nextPause };
    const totals = recomputePunchTotals(draft);
    const corrected: PunchSession = {
      ...draft,
      ...totals,
      approvalStatus: 'corrected',
      corrections: [...(target.corrections || []), ...trace]
    };

    const updated = punchSessions.map(p => (p.id === id ? corrected : p));
    set({ punchSessions: updated });
    saveState('gcp_punchSessions', updated);
    syncUpdate('punches', id, punchToRow(corrected));

    get().recomputeGoalsAndStreaks();
    const cascade = recalculateInvoicesForPunch(get, set, id);

    return {
      ok: true,
      message: cascade.lockedInvoiceNumbers.length > 0
        ? (isFR
            ? `Heures corrigées. Facture déjà émise à revoir : ${cascade.lockedInvoiceNumbers.join(', ')}.`
            : `Hours corrected. Already-issued invoice needs review: ${cascade.lockedInvoiceNumbers.join(', ')}.`)
        : (isFR ? 'Heures corrigées et facture brouillon mise à jour.' : 'Hours corrected and draft invoice updated.')
    };
  },

  approvePunchSession: (id) => {
    const { punchSessions, activeEmployee, currentLanguage } = get();
    const isFR = currentLanguage === 'FR';
    const editor = activeEmployee;
    if (!editor || (editor.role !== 'admin' && editor.role !== 'secretary')) {
      return { ok: false, message: isFR ? 'Approbation réservée à la gestion.' : 'Approval is reserved for management.' };
    }
    const target = punchSessions.find(p => p.id === id);
    if (!target) return { ok: false, message: isFR ? 'Pointage introuvable.' : 'Punch not found.' };
    if (!target.endTime) {
      return { ok: false, message: isFR ? 'Terminez le pointage avant de l’approuver.' : 'Close the punch before approving it.' };
    }
    if (target.approvalStatus === 'approved') {
      return { ok: false, message: isFR ? 'Ce pointage est déjà approuvé.' : 'This punch is already approved.' };
    }

    const at = new Date().toISOString();
    const approved: PunchSession = {
      ...target,
      approvalStatus: 'approved',
      approvedById: editor.id,
      approvedByName: editor.name,
      approvedAt: at,
      corrections: [...(target.corrections || []), {
        at, byId: editor.id, byName: editor.name,
        field: 'approval', before: target.approvalStatus || 'pending', after: 'approved'
      }]
    };
    const updated = punchSessions.map(p => (p.id === id ? approved : p));
    set({ punchSessions: updated });
    saveState('gcp_punchSessions', updated);
    syncUpdate('punches', id, punchToRow(approved));
    return { ok: true, message: isFR ? 'Pointage approuvé.' : 'Punch approved.' };
  },

  // Invoices actions
  addInvoice: (inv) => {
    const { invoices } = get();
    const newInvoice: Invoice = {
      ...inv,
      id: genId(),
      invoiceNumber: nextSequentialNumber(invoices.map(i => i.invoiceNumber), 'INV')
    };
    const updated = [newInvoice, ...invoices];
    set({ invoices: updated });
    saveState('gcp_invoices', updated);
    syncInsert('payroll_entries', invoiceToRow(newInvoice));
  },

  updateInvoice: (inv) => {
    const { invoices } = get();
    const updated = invoices.map(i => i.id === inv.id ? inv : i);
    set({ invoices: updated });
    saveState('gcp_invoices', updated);
    syncUpdate('payroll_entries', inv.id, invoiceToRow(inv));
  },

  generateDraftInvoiceForEmployee: (employeeId) => {
    const { punchSessions, invoices, employees, companyInfo } = get();
    const emp = employees.find(e => e.id === employeeId);
    if (!emp) return;

    // Find all completed punch sessions for this employee that are not yet in any invoice
    const invoicedSessionIds = new Set(invoices.flatMap(inv => inv.sessionIds));
    const unInvoicedPunches = punchSessions.filter(p => 
      p.employeeId === employeeId && 
      p.endTime !== null && 
      !invoicedSessionIds.has(p.id)
    );

    if (unInvoicedPunches.length === 0) return;

    const totalHours = unInvoicedPunches.reduce((sum, p) => sum + (p.totalWorkedHours || 0), 0);
    const amount = unInvoicedPunches.reduce((sum, p) => sum + p.revenue, 0);
    const comp = get().companyInfo;
    const gstRate = comp.taxRate1 !== undefined ? comp.taxRate1 : 0;
    const qstRate = comp.taxRate2 !== undefined ? comp.taxRate2 : 0;
    const localRate = comp.localTaxRate !== undefined ? comp.localTaxRate : 0;
    
    const gstAmount = Number((amount * gstRate).toFixed(2));
    const qstAmount = Number((amount * qstRate).toFixed(2));
    const localTaxAmount = Number((amount * localRate).toFixed(2));
    const totalWithTaxes = Number((amount + gstAmount + qstAmount + localTaxAmount).toFixed(2));

    const newInvoice: Invoice = {
      id: genId(),
      employeeId,
      employeeName: emp.name,
      invoiceNumber: nextSequentialNumber(invoices.map(i => i.invoiceNumber), 'INV'),
      date: todayKey(),
      sessionIds: unInvoicedPunches.map(p => p.id),
      totalHours: Number(totalHours.toFixed(2)),
      amount: Number(amount.toFixed(2)),
      gstAmount,
      qstAmount,
      totalWithTaxes,
      status: 'draft',
      taxIncluded: false,
      notes: `Facture brouillon auto-générée le ${new Date().toLocaleDateString('fr-CA')}.`,
      currency: comp.currency || (comp.country === 'US' ? 'USD' : 'CAD'),
      taxRate1: gstRate, taxRate2: qstRate, localTaxRate: localRate, localTaxAmount,
      taxRate1Name: comp.taxRate1Name || 'Tax 1', taxRate2Name: comp.taxRate2Name || 'Tax 2',
      issuerName: emp.businessName || emp.name, issuerAddress: emp.address,
      issuerTaxNumber: emp.gstNumber || emp.asNumber, issuerLogo: emp.businessLogo || emp.avatar,
      recipientName: comp.name
    };

    const updated = [newInvoice, ...invoices];
    set({ invoices: updated });
    saveState('gcp_invoices', updated);
    syncInsert('payroll_entries', invoiceToRow(newInvoice));
  },

  // System A: Client Documents actions implementation with auto-calculations
  addGCPDocument: (doc) => {
    const { documents } = get();
    const prefix = doc.type === 'invoice' ? 'FAC' : doc.type === 'quote' ? 'DEV' : 'CON';
    const number = getNextDocNumber(documents, doc.type, prefix);

    // Auto-calculate financial variables
    let subtotal = 0;
    if (doc.isSimpleLayout) {
      subtotal = doc.lineItems.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0);
    } else {
      const mat = doc.materialLines.reduce((sum, item) => sum + (item.qtySqft * item.unitPrice), 0);
      const lab = doc.labourLines.reduce((sum, item) => sum + (item.isFlatRate ? item.rate : item.estimatedHours * item.rate), 0);
      const oth = doc.otherLines.reduce((sum, item) => sum + item.amount, 0);
      const sub = doc.subcontractLines.reduce((sum, item) => sum + item.amount, 0);
      subtotal = mat + lab + oth + sub;
    }

    const discountAmount = subtotal * (doc.discountPct / 100);
    const taxable = subtotal - discountAmount;
    const taxAmount = Number((taxable * (doc.taxRate / 100)).toFixed(2));
    const total = Number((taxable + taxAmount).toFixed(2));
    const holdbackAmount = Number((total * (doc.holdbackPct / 100)).toFixed(2));
    
    const paidSum = doc.paymentsHistory?.reduce((sum, p) => sum + p.amount, 0) || 0;
    const balanceDue = Number((total - holdbackAmount - paidSum).toFixed(2));

    const newDoc: GCPDocument = {
      ...doc,
      id: genId(),
      number,
      subtotal: Number(subtotal.toFixed(2)),
      taxAmount,
      total,
      holdbackAmount,
      balanceDue
    };

    const updated = [newDoc, ...documents];
    set({ documents: updated });
    saveState('gcp_documents', updated);
    syncDocumentInsert(newDoc);
  },

  updateGCPDocument: (doc) => {
    const { documents } = get();

    // SIGNED_CONTRACT_CONTENT_LOCK — les données juridiques et financières
    // d’un contrat signé restent un instantané immuable. Seule la progression
    // opérationnelle vers « completed » est acceptée après la signature.
    const existingDocument = documents.find(item => item.id === doc.id);
    const existingIsSignedContract = Boolean(
      existingDocument?.type === 'contract' &&
      existingDocument.clientSignature &&
      existingDocument.ownerSignature &&
      existingDocument.signedAt
    );
    if (existingDocument && existingIsSignedContract) {
      if (existingDocument.status === 'accepted' && doc.status === 'completed') {
        const lifecycleDocument: GCPDocument = { ...existingDocument, status: 'completed' };
        const lifecycleDocuments = documents.map(item => item.id === doc.id ? lifecycleDocument : item);
        set({ documents: lifecycleDocuments });
        saveState('gcp_documents', lifecycleDocuments);
        syncUpdate('documents', doc.id, documentToRow(lifecycleDocument));
      }
      return;
    }
    
    // Recompute on update to keep financials robust and fresh
    let subtotal = 0;
    if (doc.isSimpleLayout) {
      subtotal = doc.lineItems.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0);
    } else {
      const mat = doc.materialLines.reduce((sum, item) => sum + (item.qtySqft * item.unitPrice), 0);
      const lab = doc.labourLines.reduce((sum, item) => sum + (item.isFlatRate ? item.rate : item.estimatedHours * item.rate), 0);
      const oth = doc.otherLines.reduce((sum, item) => sum + item.amount, 0);
      const sub = doc.subcontractLines.reduce((sum, item) => sum + item.amount, 0);
      subtotal = mat + lab + oth + sub;
    }

    const discountAmount = subtotal * (doc.discountPct / 100);
    const taxable = subtotal - discountAmount;
    const taxAmount = Number((taxable * (doc.taxRate / 100)).toFixed(2));
    const total = Number((taxable + taxAmount).toFixed(2));
    const holdbackAmount = Number((total * (doc.holdbackPct / 100)).toFixed(2));
    
    const paidSum = doc.paymentsHistory?.reduce((sum, p) => sum + p.amount, 0) || 0;
    const balanceDue = Number((total - holdbackAmount - paidSum).toFixed(2));

    const updatedGCPDoc: GCPDocument = {
      ...doc,
      subtotal: Number(subtotal.toFixed(2)),
      taxAmount,
      total,
      holdbackAmount,
      balanceDue
    };

    const updated = documents.map(d => d.id === doc.id ? updatedGCPDoc : d);
    set({ documents: updated });
    saveState('gcp_documents', updated);
    syncUpdate('documents', doc.id, documentToRow(updatedGCPDoc));
    syncDocumentLines(updatedGCPDoc);
  },

  deleteGCPDocument: (id) => {
    const { documents } = get();
    const target = documents.find(item => item.id === id);
    const targetIsSignedContract = Boolean(
      target?.type === 'contract' && target.clientSignature && target.ownerSignature && target.signedAt
    );
    if (targetIsSignedContract) return;
    const updated = documents.filter(d => d.id !== id);
    set({ documents: updated });
    saveState('gcp_documents', updated);
    syncDelete('documents', id);
  },

  convertQuoteToInvoice: (quoteId) => {
    const { documents } = get();
    const quote = documents.find(d => d.id === quoteId && d.type === 'quote');
    if (!quote) return;

    const number = getNextDocNumber(documents, 'invoice', 'FAC');

    const invoice: GCPDocument = {
      ...quote,
      id: genId(),
      type: 'invoice',
      number,
      status: 'draft',
      refQuote: quote.number,
      date: todayKey(),
      dueDate: localDayKey(Date.now() + 30 * 24 * 3600000),
      // Régénère les identifiants des lignes copiées du devis : elles gardaient sinon
      // les mêmes id que les lignes du devis, ce qui provoquait une collision de clé
      // primaire lors de la synchronisation cloud (document_items.id est unique).
      lineItems: quote.lineItems.map(l => ({ ...l, id: genId() })),
      materialLines: quote.materialLines.map(l => ({ ...l, id: genId() })),
      labourLines: quote.labourLines.map(l => ({ ...l, id: genId() })),
      otherLines: quote.otherLines.map(l => ({ ...l, id: genId() })),
      subcontractLines: quote.subcontractLines.map(l => ({ ...l, id: genId() }))
    };

    const updated = [invoice, ...documents];
    set({ documents: updated });
    saveState('gcp_documents', updated);
    syncDocumentInsert(invoice);
  },

  addPartialPayment: (id, amount, method, notes) => {
    const { documents } = get();
    const doc = documents.find(d => d.id === id);
    if (!doc) return;

    const newPayment: GCPDocumentPaymentHistoryEntry = {
      id: genId(),
      date: todayKey(),
      amount,
      method,
      notes: notes || 'Paiement partiel enregistré'
    };

    const updatedHistory = [...(doc.paymentsHistory || []), newPayment];
    
    // Compute new balance
    const totalPaid = updatedHistory.reduce((sum, p) => sum + p.amount, 0);
    const balanceDue = Number((doc.total - doc.holdbackAmount - totalPaid).toFixed(2));
    
    // Auto status transition to paid if balance is zero or less
    const status = balanceDue <= 0 ? 'paid' : doc.status;

    const updatedDoc: GCPDocument = {
      ...doc,
      paymentsHistory: updatedHistory,
      balanceDue,
      status
    };

    const updated = documents.map(d => d.id === id ? updatedDoc : d);
    set({ documents: updated });
    saveState('gcp_documents', updated);
    syncUpdate('documents', id, { balance_due: balanceDue, status });
    syncInsert('document_payments', documentPaymentToRow(newPayment, id));
  },

  // Photos de chantier : dossier avant / pendant / après, synchronisé au nuage
  // Ordres de changement : extras constatés et signés sur le chantier
  // Réclamations d'assurance : suivi du dossier et des montants
  // Prospects : pipeline avant le devis
  // Planification : affectation d'un employé à un chantier pour une journée
  // Sécurité de chantier : causeries et analyses de risques signées
  addSafetyRecord: (record) => {
    const { safetyRecords } = get();
    const newRecord: SafetyRecord = { ...record, id: genId() };
    const updated = [newRecord, ...safetyRecords];
    set({ safetyRecords: updated });
    saveState('gcp_safetyRecords', updated);
    syncInsert('safety_records', safetyRecordToRow(newRecord));
  },

  updateSafetyRecord: (record) => {
    const { safetyRecords } = get();
    const updated = safetyRecords.map(r => (r.id === record.id ? record : r));
    set({ safetyRecords: updated });
    saveState('gcp_safetyRecords', updated);
    syncUpdate('safety_records', record.id, safetyRecordToRow(record));
  },

  deleteSafetyRecord: (id) => {
    const { safetyRecords } = get();
    const updated = safetyRecords.filter(r => r.id !== id);
    set({ safetyRecords: updated });
    saveState('gcp_safetyRecords', updated);
    syncDelete('safety_records', id);
  },

  addShiftAssignment: (assignment) => {
    const { shiftAssignments } = get();
    const newAssignment: ShiftAssignment = { ...assignment, id: genId() };
    const updated = [newAssignment, ...shiftAssignments];
    set({ shiftAssignments: updated });
    saveState('gcp_shiftAssignments', updated);
    syncInsert('shift_assignments', shiftAssignmentToRow(newAssignment));
  },

  deleteShiftAssignment: (id) => {
    const { shiftAssignments } = get();
    const updated = shiftAssignments.filter(a => a.id !== id);
    set({ shiftAssignments: updated });
    saveState('gcp_shiftAssignments', updated);
    syncDelete('shift_assignments', id);
  },

  addLead: (lead) => {
    const { leads } = get();
    const newLead: Lead = { ...lead, id: genId() };
    const updated = [newLead, ...leads];
    set({ leads: updated });
    saveState('gcp_leads', updated);
    syncInsert('leads', leadToRow(newLead));
  },

  updateLead: (lead) => {
    const { leads } = get();
    const updated = leads.map(l => (l.id === lead.id ? lead : l));
    set({ leads: updated });
    saveState('gcp_leads', updated);
    syncUpdate('leads', lead.id, leadToRow(lead));
  },

  deleteLead: (id) => {
    const { leads } = get();
    const updated = leads.filter(l => l.id !== id);
    set({ leads: updated });
    saveState('gcp_leads', updated);
    syncDelete('leads', id);
  },

  addInsuranceClaim: (claim) => {
    const { insuranceClaims } = get();
    const newClaim: InsuranceClaim = { ...claim, id: genId() };
    const updated = [newClaim, ...insuranceClaims];
    set({ insuranceClaims: updated });
    saveState('gcp_insuranceClaims', updated);
    syncInsert('insurance_claims', insuranceClaimToRow(newClaim));
  },

  updateInsuranceClaim: (claim) => {
    const { insuranceClaims } = get();
    const updated = insuranceClaims.map(c => (c.id === claim.id ? claim : c));
    set({ insuranceClaims: updated });
    saveState('gcp_insuranceClaims', updated);
    syncUpdate('insurance_claims', claim.id, insuranceClaimToRow(claim));
  },

  deleteInsuranceClaim: (id) => {
    const { insuranceClaims } = get();
    const updated = insuranceClaims.filter(c => c.id !== id);
    set({ insuranceClaims: updated });
    saveState('gcp_insuranceClaims', updated);
    syncDelete('insurance_claims', id);
  },

  addChangeOrder: (order) => {
    const { changeOrders } = get();
    const newOrder: ChangeOrder = { ...order, id: genId() };
    const updated = [newOrder, ...changeOrders];
    set({ changeOrders: updated });
    saveState('gcp_changeOrders', updated);
    syncInsert('change_orders', changeOrderToRow(newOrder));
  },

  updateChangeOrder: (order) => {
    const { changeOrders } = get();
    const updated = changeOrders.map(o => (o.id === order.id ? order : o));
    set({ changeOrders: updated });
    saveState('gcp_changeOrders', updated);
    syncUpdate('change_orders', order.id, changeOrderToRow(order));
  },

  deleteChangeOrder: (id) => {
    const { changeOrders } = get();
    const updated = changeOrders.filter(o => o.id !== id);
    set({ changeOrders: updated });
    saveState('gcp_changeOrders', updated);
    syncDelete('change_orders', id);
  },

  addProjectPhoto: (photo) => {
    const { projectPhotos } = get();
    const newPhoto: ProjectPhoto = { ...photo, id: genId() };
    const updated = [newPhoto, ...projectPhotos];
    set({ projectPhotos: updated });
    saveState('gcp_projectPhotos', updated);
    syncInsert('project_photos', projectPhotoToRow(newPhoto));
  },

  updateProjectPhoto: (photo) => {
    const { projectPhotos } = get();
    const updated = projectPhotos.map(p => (p.id === photo.id ? photo : p));
    set({ projectPhotos: updated });
    saveState('gcp_projectPhotos', updated);
    syncUpdate('project_photos', photo.id, projectPhotoToRow(photo));
  },

  deleteProjectPhoto: (id) => {
    const { projectPhotos } = get();
    const updated = projectPhotos.filter(p => p.id !== id);
    set({ projectPhotos: updated });
    saveState('gcp_projectPhotos', updated);
    syncDelete('project_photos', id);
  },

  addExpense: (exp) => {
    const { expenses } = get();
    const newExp: ExpenseRecord = {
      ...exp,
      id: genId()
    };
    const updated = [newExp, ...expenses];
    set({ expenses: updated });
    saveState('gcp_expenses', updated);
    syncInsert('expenses', expenseToRow(newExp));
  },

  deleteExpense: (id) => {
    const { expenses } = get();
    const updated = expenses.filter(e => e.id !== id);
    set({ expenses: updated });
    saveState('gcp_expenses', updated);
    syncDelete('expenses', id);
  },

  // Dépense personnelle : reste dans les informations de l'employé, sur cet
  // appareil seulement — aucune synchronisation cloud, par choix de vie privée.
  addPersonalExpense: (exp) => {
    const { personalExpenses } = get();
    const updated: ExpenseRecord[] = [{ ...exp, id: genId() }, ...personalExpenses];
    set({ personalExpenses: updated });
    saveState('gcp_personalExpenses', updated);
  },

  deletePersonalExpense: (id) => {
    const { personalExpenses } = get();
    const updated = personalExpenses.filter(e => e.id !== id);
    set({ personalExpenses: updated });
    saveState('gcp_personalExpenses', updated);
  },

  addPayrollPayment: (pay) => {
    const { payrollPayments, employees } = get();
    // On fige la nature du travailleur au moment du versement. Sans cet
    // instantané, l'export fiscal reclasse l'historique d'après la fiche
    // actuelle : embaucher comme salarié un ancien sous-traitant effacerait ses
    // paiements passés d'un T5018 déjà produit.
    const payee = employees.find(employee => employee.id === pay.employeeId);
    const newPay: PayrollPayment = {
      ...pay,
      workerTypeAtPayment: pay.workerTypeAtPayment || payee?.workerType || undefined,
      id: genId()
    };
    const updated = [newPay, ...payrollPayments];
    set({ payrollPayments: updated });
    saveState('gcp_payrollPayments', updated);
    syncInsert('payroll_payments', payrollPaymentToRow(newPay));
  },

  deletePayrollPayment: (id) => {
    const { payrollPayments } = get();
    const updated = payrollPayments.filter(p => p.id !== id);
    set({ payrollPayments: updated });
    saveState('gcp_payrollPayments', updated);
    syncDelete('payroll_payments', id);
  },

  hydrateCloud: async () => {
    if (get().demoSandboxActive || isDemoSandboxIsolationActive()) {
      set({ offlineSyncStatus: 'offline' });
      return;
    }
    if (LOCAL_TEST_MODE) {
      set({ offlineSyncStatus: 'offline' });
      return;
    }
    // Garde anti-écrasement : si l'utilisateur vient tout juste de modifier des
    // données (écriture cloud récente ou en vol), on reporte l'hydratation au
    // prochain cycle — sinon l'instantané cloud, encore en retard, écraserait la
    // saisie en cours (ex: tâches/outils de chantier tout juste ajoutés).
    const RECENT_MUTATION_MS = 20000;
    if (msSinceLastMutation() < RECENT_MUTATION_MS) return;

    const result = await hydrateFromCloud();
    if (!result.enabled) {
      set({ offlineSyncStatus: 'offline' });
      if (result.needsAuth) {
        // Un cookie absent ou expiré détruit immédiatement toute donnée d'une
        // session précédente avant d'afficher l'annuaire public minimal.
        set({
          activeEmployee: null, employees: [], projects: [], punchSessions: [], invoices: [],
          catalogue: [], suppliers: [], inventory: [], toolAssets: [], toolTheftReports: [],
          orders: [], clients: [], hrAlerts: [], documents: [], expenses: [], projectPhotos: [],
          changeOrders: [], insuranceClaims: [], leads: [], shiftAssignments: [], safetyRecords: [],
          personalExpenses: [], payrollPayments: [], motivationTeams: [], motivationGoals: [], weeklyGoals: []
        });
        const dir = await fetchLoginDirectory();
        if (dir.length > 0) {
          set({ employees: dir.map(user => ({
            id: user.id, name: user.name, nip: '', role: 'employee', hourlyRate: 0,
            workerType: '', asNumber: '', phone: '', address: '', hireDate: '',
            avatar: user.avatar || '', level: 1, xp: 0
          })) });
        }
      }
      return;
    }
    // Re-vérifie après le voyage réseau : une modification a pu survenir pendant
    // le chargement — dans ce cas l'instantané reçu est déjà périmé, on l'ignore.
    if (msSinceLastMutation() < RECENT_MUTATION_MS) return;
    const t = result.tables;
    const employees = (t.app_users || []).map(rowToEmployee);
    const assignments = t.project_assignments || [];
    const tasks = t.project_tasks || [];
    const tools = t.project_tools || [];
    const projects = (t.projects || []).map((r: any) => rowToProject(r, tasks, tools, assignments));
    const punchSessions = (t.punches || []).map(rowToPunch);
    const invoices = (t.payroll_entries || []).map(rowToInvoice);
    const catalogue = (t.catalog_items || []).map(rowToCatalogue);
    const suppliers = (t.suppliers || []).map(rowToSupplier);
    const inventory = (t.inventory_items || []).map(rowToInventory);
    const toolAssets = (t.tool_assets || []).map(rowToToolAsset);
    const toolTheftReports = (t.tool_theft_reports || []).map(rowToToolTheftReport);
    const orderItems = t.supplier_order_items || [];
    const orders = (t.supplier_orders || []).map((r: any) => rowToSupplierOrder(r, orderItems));
    const clients = (t.clients || []).map(rowToClient);
    const hrAlerts = (t.hr_alerts || []).map(rowToHRAlert);
    const documentItems = t.document_items || [];
    const documentPayments = t.document_payments || [];
    const documents = (t.documents || []).map((r: any) => rowToDocument(r, documentItems, documentPayments));
    const expenses = (t.expenses || []).map(rowToExpense);
    const projectPhotos = (t.project_photos || []).map(rowToProjectPhoto);
    const changeOrders = (t.change_orders || []).map(rowToChangeOrder);
    const insuranceClaims = (t.insurance_claims || []).map(rowToInsuranceClaim);
    const leads = (t.leads || []).map(rowToLead);
    const shiftAssignments = (t.shift_assignments || []).map(rowToShiftAssignment);
    const safetyRecords = (t.safety_records || []).map(rowToSafetyRecord);
    const payrollPayments = (t.payroll_payments || []).map(rowToPayrollPayment);
    const motivationTeams = (t.motivation_teams || []).map(rowToMotivationTeam);
    const motivationGoals = (t.motivation_goals || []).map(rowToMotivationGoal);
    const weeklyGoals = (t.weekly_goals || []).map(rowToWeeklyGoal);
    const companyRow = (t.companies || [])[0];
    const currentOnboardingState = get();
    const onboardingResolution = companyRow
      ? resolveOnboardingState(
          currentOnboardingState.companyInfo,
          currentOnboardingState.isOnboarded,
          rowToCompanyInfo(companyRow)
        )
      : null;
    // Le profil actif est reconstruit par un module dédié : il garantit qu'un
    // consentement déjà accordé ne peut pas être effacé par une lecture, ce qui
    // faisait réapparaître l'avis de confidentialité (voir viewerProfile.ts).
    const viewerEmployee = resolveViewerProfile(
      employees,
      result.viewer,
      normalizeAppRole(result.viewer?.role),
      currentOnboardingState.activeEmployee
    );

    set(() => {
      const next: Partial<AppState> = {
        offlineSyncStatus: 'synced',
        activeEmployee: viewerEmployee,
        employees,
        projects,
        punchSessions,
        invoices,
        catalogue,
        suppliers,
        inventory,
        toolAssets,
        toolTheftReports,
        orders,
        clients,
        hrAlerts,
        documents,
        expenses,
        projectPhotos,
        changeOrders,
        insuranceClaims,
        leads,
        shiftAssignments,
        safetyRecords,
        payrollPayments,
        motivationTeams,
        motivationGoals,
        weeklyGoals
      };
      if (onboardingResolution) {
        next.companyInfo = onboardingResolution.companyInfo as CompanyInfo;
        next.isOnboarded = onboardingResolution.isOnboarded;
      }
      return next as AppState;
    });

    if (onboardingResolution) {
      saveState('gcp_companyInfo', onboardingResolution.companyInfo);
      saveState('gcp_isOnboarded', onboardingResolution.isOnboarded);
      // La compagnie hydratée depuis le cloud peut imposer son propre fuseau.
      setAppTimeZone((onboardingResolution.companyInfo as CompanyInfo).timeZone);

      // Au premier login, l'onboarding vient d'être terminé avant que la session
      // sécurisée existe. On le pousse maintenant, puis les appareils suivants
      // liront directement la configuration terminée depuis le cloud.
      //
      // Réservé à l'administrateur : seul son rôle peut écrire la fiche de
      // compagnie. Sans ce garde, la session d'un employé rejouait la même
      // écriture à chaque hydratation — refusée chaque fois, toutes les
      // quarante-cinq secondes, sans le moindre espoir d'aboutir.
      if (onboardingResolution.shouldSyncLocalCompletion && result.companyId && viewerEmployee?.role === 'admin') {
        syncUpdate(
          'companies',
          result.companyId,
          companyInfoToRow(onboardingResolution.companyInfo as CompanyInfo)
        );
      }
    }
  }
}));

// ---------------------------------------------------------------------------
// Ce que la sauvegarde personnelle doit réellement contenir
// ---------------------------------------------------------------------------
// Les données d'affaires n'atteignent jamais le stockage du navigateur : la
// politique de sécurité les refuse et une purge les efface au démarrage. Le
// magasin en mémoire est donc le seul endroit où elles existent côté client.
// Sans ce branchement, le fichier déposé sur le nuage du client ne contient
// que sa langue et son thème.
//
// Le NIP est vidé au passage par le module de sauvegarde : un code d'accès ne
// part jamais dans un fichier déposé chez un tiers.
const BACKUP_STATE_KEYS: Record<string, keyof AppState> = {
  gcp_employees: 'employees',
  gcp_projects: 'projects',
  gcp_punchSessions: 'punchSessions',
  gcp_invoices: 'invoices',
  gcp_catalogue: 'catalogue',
  gcp_suppliers: 'suppliers',
  gcp_inventory: 'inventory',
  gcp_toolAssets: 'toolAssets',
  gcp_toolTheftReports: 'toolTheftReports',
  gcp_orders: 'orders',
  gcp_clients: 'clients',
  gcp_companyInfo: 'companyInfo',
  gcp_hrAlerts: 'hrAlerts',
  gcp_documents: 'documents',
  gcp_expenses: 'expenses',
  gcp_projectPhotos: 'projectPhotos',
  gcp_changeOrders: 'changeOrders',
  gcp_insuranceClaims: 'insuranceClaims',
  gcp_leads: 'leads',
  gcp_shiftAssignments: 'shiftAssignments',
  gcp_safetyRecords: 'safetyRecords',
  gcp_personalExpenses: 'personalExpenses',
  gcp_payrollPayments: 'payrollPayments',
  gcp_motivationTeams: 'motivationTeams',
  gcp_motivationGoals: 'motivationGoals',
  gcp_weeklyGoals: 'weeklyGoals',
  gcp_currentLanguage: 'currentLanguage',
  gcp_currentTheme: 'currentTheme',
  gcp_isOnboarded: 'isOnboarded'
};

export function backupSnapshot(): Record<string, unknown> {
  const state = useAppStore.getState();
  // Le bac à sable de démonstration contient des chiffres inventés. Les écrire
  // dans la sauvegarde du client remplacerait sa vraie entreprise par une
  // fiction au moment où il en aurait le plus besoin.
  if (state.demoSandboxActive) return {};

  const snapshot: Record<string, unknown> = {};
  for (const [storageKey, stateKey] of Object.entries(BACKUP_STATE_KEYS)) {
    snapshot[storageKey] = state[stateKey];
  }
  return snapshot;
}

registerBackupSnapshotProvider(backupSnapshot);

export default useAppStore;
