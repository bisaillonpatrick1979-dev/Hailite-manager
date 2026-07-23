import type {
  CatalogueMaterial, Client, Employee, ExpenseRecord, GCPDocument, InventoryItem,
  PayrollPayment, Project, PunchSession, Supplier, ToolAsset
} from './types';

export type MigrationDataType =
  | 'clients'
  | 'projects'
  | 'employees'
  | 'punches'
  | 'documents'
  | 'expenses'
  | 'payroll'
  | 'suppliers'
  | 'catalogue'
  | 'inventory'
  | 'tools';

export interface MigrationFieldDefinition {
  key: string;
  labelFR: string;
  labelEN: string;
  required?: boolean;
  aliases: string[];
}

export interface ParsedMigrationFile {
  fileName: string;
  format: 'csv' | 'json';
  rows: Record<string, unknown>[];
  columns: string[];
  detectedType?: MigrationDataType;
}

export interface MigrationImportResult {
  ok: boolean;
  imported: number;
  skipped: number;
  storageKey?: string;
  message: string;
}

const DEFINITIONS: Record<MigrationDataType, MigrationFieldDefinition[]> = {
  clients: [
    { key: 'name', labelFR: 'Nom du client', labelEN: 'Client name', required: true, aliases: ['name','nom','client','client_name','customer','customer_name'] },
    { key: 'company', labelFR: 'Compagnie', labelEN: 'Company', aliases: ['company','compagnie','business','business_name'] },
    { key: 'email', labelFR: 'Courriel', labelEN: 'Email', aliases: ['email','courriel','email_address'] },
    { key: 'phone', labelFR: 'Téléphone', labelEN: 'Phone', aliases: ['phone','telephone','téléphone','tel','mobile'] },
    { key: 'address', labelFR: 'Adresse', labelEN: 'Address', aliases: ['address','adresse','street','billing_address'] }
  ],
  projects: [
    { key: 'name', labelFR: 'Nom du chantier', labelEN: 'Project name', required: true, aliases: ['name','nom','project','project_name','job','job_name','chantier'] },
    { key: 'clientName', labelFR: 'Client', labelEN: 'Client', aliases: ['client','client_name','customer','customer_name'] },
    { key: 'address', labelFR: 'Adresse du chantier', labelEN: 'Job address', aliases: ['address','adresse','site_address','job_address','location'] },
    { key: 'status', labelFR: 'Statut', labelEN: 'Status', aliases: ['status','statut','state'] }
  ],
  employees: [
    { key: 'name', labelFR: 'Nom', labelEN: 'Name', required: true, aliases: ['name','nom','employee','employee_name','worker','worker_name'] },
    { key: 'email', labelFR: 'Courriel', labelEN: 'Email', aliases: ['email','courriel'] },
    { key: 'phone', labelFR: 'Téléphone', labelEN: 'Phone', aliases: ['phone','telephone','téléphone','mobile'] },
    { key: 'hourlyRate', labelFR: 'Taux horaire', labelEN: 'Hourly rate', aliases: ['hourly_rate','rate','taux','taux_horaire','wage'] },
    { key: 'workerType', labelFR: 'Type de travailleur', labelEN: 'Worker type', aliases: ['worker_type','type','role','job_title','trade'] },
    { key: 'hireDate', labelFR: 'Date d’embauche', labelEN: 'Hire date', aliases: ['hire_date','date_embauche','start_date'] }
  ],
  punches: [
    { key: 'employeeName', labelFR: 'Employé', labelEN: 'Employee', required: true, aliases: ['employee','employee_name','worker','worker_name','employe'] },
    { key: 'projectName', labelFR: 'Chantier', labelEN: 'Project', aliases: ['project','project_name','job','job_name','chantier'] },
    { key: 'startTime', labelFR: 'Début', labelEN: 'Start', required: true, aliases: ['start','start_time','clock_in','punch_in','debut'] },
    { key: 'endTime', labelFR: 'Fin', labelEN: 'End', aliases: ['end','end_time','clock_out','punch_out','fin'] },
    { key: 'hours', labelFR: 'Heures', labelEN: 'Hours', aliases: ['hours','total_hours','heures','duration'] },
    { key: 'rate', labelFR: 'Taux', labelEN: 'Rate', aliases: ['rate','hourly_rate','taux'] },
    { key: 'amount', labelFR: 'Montant', labelEN: 'Amount', aliases: ['amount','revenue','total','montant','pay'] }
  ],
  documents: [
    { key: 'type', labelFR: 'Type', labelEN: 'Type', aliases: ['type','document_type','kind'] },
    { key: 'number', labelFR: 'Numéro', labelEN: 'Number', required: true, aliases: ['number','numero','document_number','invoice_number','contract_number','quote_number'] },
    { key: 'date', labelFR: 'Date', labelEN: 'Date', aliases: ['date','issue_date','created_date'] },
    { key: 'dueDate', labelFR: 'Échéance', labelEN: 'Due date', aliases: ['due_date','duedate','echeance'] },
    { key: 'status', labelFR: 'Statut', labelEN: 'Status', aliases: ['status','statut'] },
    { key: 'clientName', labelFR: 'Client', labelEN: 'Client', aliases: ['client','client_name','customer','customer_name'] },
    { key: 'description', labelFR: 'Description', labelEN: 'Description', aliases: ['description','details','notes','scope'] },
    { key: 'subtotal', labelFR: 'Sous-total', labelEN: 'Subtotal', aliases: ['subtotal','sous_total','before_tax'] },
    { key: 'taxAmount', labelFR: 'Taxes', labelEN: 'Taxes', aliases: ['tax','taxes','tax_amount'] },
    { key: 'total', labelFR: 'Total', labelEN: 'Total', aliases: ['total','amount','montant','grand_total'] }
  ],
  expenses: [
    { key: 'provider', labelFR: 'Fournisseur', labelEN: 'Provider', required: true, aliases: ['provider','supplier','vendor','fournisseur','merchant'] },
    { key: 'date', labelFR: 'Date', labelEN: 'Date', required: true, aliases: ['date','expense_date','transaction_date'] },
    { key: 'category', labelFR: 'Catégorie', labelEN: 'Category', aliases: ['category','categorie','type'] },
    { key: 'amount', labelFR: 'Montant', labelEN: 'Amount', required: true, aliases: ['amount','total','montant'] },
    { key: 'tax', labelFR: 'Taxes', labelEN: 'Tax', aliases: ['tax','taxes','tax_amount'] },
    { key: 'project', labelFR: 'Chantier', labelEN: 'Project', aliases: ['project','project_name','job','chantier'] },
    { key: 'notes', labelFR: 'Notes', labelEN: 'Notes', aliases: ['notes','description','memo'] }
  ],
  payroll: [
    { key: 'employeeName', labelFR: 'Employé', labelEN: 'Employee', required: true, aliases: ['employee','employee_name','worker','employe'] },
    { key: 'period', labelFR: 'Période', labelEN: 'Period', required: true, aliases: ['period','pay_period','periode'] },
    { key: 'date', labelFR: 'Date', labelEN: 'Date', aliases: ['date','payment_date','pay_date'] },
    { key: 'hours', labelFR: 'Heures', labelEN: 'Hours', aliases: ['hours','heures','total_hours'] },
    { key: 'amount', labelFR: 'Montant', labelEN: 'Amount', required: true, aliases: ['amount','net_pay','gross_pay','total','montant'] },
    { key: 'status', labelFR: 'Statut', labelEN: 'Status', aliases: ['status','statut'] }
  ],
  suppliers: [
    { key: 'name', labelFR: 'Nom', labelEN: 'Name', required: true, aliases: ['name','nom','supplier','supplier_name','vendor'] },
    { key: 'contactName', labelFR: 'Contact', labelEN: 'Contact', aliases: ['contact','contact_name'] },
    { key: 'phone', labelFR: 'Téléphone', labelEN: 'Phone', aliases: ['phone','telephone','mobile'] },
    { key: 'email', labelFR: 'Courriel', labelEN: 'Email', aliases: ['email','courriel'] },
    { key: 'notes', labelFR: 'Notes', labelEN: 'Notes', aliases: ['notes','description'] }
  ],
  catalogue: [
    { key: 'name', labelFR: 'Produit', labelEN: 'Product', required: true, aliases: ['name','nom','product','item','material'] },
    { key: 'unit', labelFR: 'Unité', labelEN: 'Unit', aliases: ['unit','unite','uom'] },
    { key: 'supplierPrice', labelFR: 'Coût fournisseur', labelEN: 'Supplier cost', aliases: ['supplier_price','cost','cout','purchase_price'] },
    { key: 'clientPrice', labelFR: 'Prix client', labelEN: 'Client price', aliases: ['client_price','sale_price','price','prix'] },
    { key: 'labourPrice', labelFR: 'Prix main-d’œuvre', labelEN: 'Labour price', aliases: ['labour_price','labor_price','install_price','price_per_sqft'] }
  ],
  inventory: [
    { key: 'name', labelFR: 'Article', labelEN: 'Item', required: true, aliases: ['name','nom','item','material','product'] },
    { key: 'quantity', labelFR: 'Quantité', labelEN: 'Quantity', aliases: ['quantity','qty','quantite','stock'] },
    { key: 'unit', labelFR: 'Unité', labelEN: 'Unit', aliases: ['unit','unite','uom'] },
    { key: 'minThreshold', labelFR: 'Seuil minimum', labelEN: 'Minimum threshold', aliases: ['minimum','min_threshold','reorder_point','seuil'] }
  ],
  tools: [
    { key: 'name', labelFR: 'Outil', labelEN: 'Tool', required: true, aliases: ['name','nom','tool','tool_name','equipment'] },
    { key: 'brand', labelFR: 'Marque', labelEN: 'Brand', aliases: ['brand','marque','manufacturer'] },
    { key: 'model', labelFR: 'Modèle', labelEN: 'Model', aliases: ['model','modele'] },
    { key: 'serialNumber', labelFR: 'Numéro de série', labelEN: 'Serial number', aliases: ['serial','serial_number','numero_serie','no_serie'] },
    { key: 'purchaseDate', labelFR: 'Date d’achat', labelEN: 'Purchase date', aliases: ['purchase_date','date_achat','bought_at'] },
    { key: 'purchasePrice', labelFR: 'Prix payé', labelEN: 'Purchase price', aliases: ['purchase_price','price','cost','prix'] },
    { key: 'replacementValue', labelFR: 'Valeur remplacement', labelEN: 'Replacement value', aliases: ['replacement_value','current_value','valeur'] },
    { key: 'location', labelFR: 'Emplacement', labelEN: 'Location', aliases: ['location','current_location','emplacement'] }
  ]
};

export const MIGRATION_TYPE_LABELS: Record<MigrationDataType, { fr: string; en: string }> = {
  clients: { fr: 'Clients', en: 'Clients' },
  projects: { fr: 'Chantiers', en: 'Projects' },
  employees: { fr: 'Employés / sous-traitants', en: 'Employees / subcontractors' },
  punches: { fr: 'Pointages et heures', en: 'Time punches and hours' },
  documents: { fr: 'Contrats, devis et factures', en: 'Contracts, quotes, and invoices' },
  expenses: { fr: 'Dépenses', en: 'Expenses' },
  payroll: { fr: 'Paie', en: 'Payroll' },
  suppliers: { fr: 'Fournisseurs', en: 'Suppliers' },
  catalogue: { fr: 'Catalogue et prix', en: 'Catalogue and pricing' },
  inventory: { fr: 'Inventaire de matériaux', en: 'Material inventory' },
  tools: { fr: 'Registre d’outils', en: 'Tool registry' }
};

export function getMigrationFields(type: MigrationDataType): MigrationFieldDefinition[] {
  return DEFINITIONS[type];
}

function normalizeColumn(value: string): string {
  return value
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function parseCsv(text: string): Record<string, unknown>[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];
  const candidates = [',', ';', '\t'];
  const delimiter = candidates
    .map(value => ({ value, count: (lines[0].match(new RegExp(value === '\t' ? '\\t' : `\\${value}`, 'g')) || []).length }))
    .sort((a, b) => b.count - a.count)[0].value;
  const headers = parseCsvLine(lines[0], delimiter).map((header, index) => header || `column_${index + 1}`);
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line, delimiter);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

function flattenJsonRows(value: unknown): { rows: Record<string, unknown>[]; detectedType?: MigrationDataType } {
  if (Array.isArray(value)) return { rows: value.filter(item => item && typeof item === 'object') as Record<string, unknown>[] };
  if (!value || typeof value !== 'object') return { rows: [] };
  const object = value as Record<string, unknown>;
  const aliases: Record<string, MigrationDataType> = {
    clients: 'clients', customers: 'clients', projects: 'projects', jobs: 'projects',
    employees: 'employees', workers: 'employees', punches: 'punches', timeEntries: 'punches',
    invoices: 'documents', documents: 'documents', contracts: 'documents', quotes: 'documents',
    expenses: 'expenses', payroll: 'payroll', payrollPayments: 'payroll', suppliers: 'suppliers',
    catalogue: 'catalogue', catalog: 'catalogue', inventory: 'inventory', tools: 'tools', toolAssets: 'tools'
  };
  for (const [key, type] of Object.entries(aliases)) {
    if (Array.isArray(object[key])) return { rows: object[key] as Record<string, unknown>[], detectedType: type };
  }
  return { rows: [object] };
}

export async function parseMigrationFile(file: File): Promise<ParsedMigrationFile> {
  if (file.size > 50 * 1024 * 1024) throw new Error('FILE_TOO_LARGE');
  const extension = file.name.split('.').pop()?.toLowerCase();
  const text = await file.text();
  const format = extension === 'json' || file.type.includes('json') ? 'json' : 'csv';
  const parsed = format === 'json' ? flattenJsonRows(JSON.parse(text)) : { rows: parseCsv(text) };
  const columns = Array.from(new Set(parsed.rows.flatMap(row => Object.keys(row))));
  return { fileName: file.name, format, rows: parsed.rows, columns, detectedType: parsed.detectedType };
}

export function suggestMigrationMapping(type: MigrationDataType, columns: string[]): Record<string, string> {
  const normalized = new Map(columns.map(column => [normalizeColumn(column), column]));
  const mapping: Record<string, string> = {};
  for (const field of DEFINITIONS[type]) {
    for (const alias of [field.key, ...field.aliases]) {
      const match = normalized.get(normalizeColumn(alias));
      if (match) {
        mapping[field.key] = match;
        break;
      }
    }
  }
  return mapping;
}

export function detectMigrationType(columns: string[]): MigrationDataType {
  let best: MigrationDataType = 'clients';
  let bestScore = -1;
  for (const type of Object.keys(DEFINITIONS) as MigrationDataType[]) {
    const suggested = suggestMigrationMapping(type, columns);
    const score = Object.keys(suggested).length + DEFINITIONS[type].filter(field => field.required && suggested[field.key]).length * 2;
    if (score > bestScore) {
      best = type;
      bestScore = score;
    }
  }
  return best;
}

const id = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID()
  : `mig-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const text = (value: unknown) => String(value ?? '').trim();
const number = (value: unknown) => {
  const cleaned = String(value ?? '').replace(/[^0-9,.-]/g, '').replace(',', '.');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};
const date = (value: unknown) => {
  const raw = text(value);
  if (!raw) return '';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
};
const iso = (value: unknown) => {
  const raw = text(value);
  if (!raw) return '';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
};

function mapped(row: Record<string, unknown>, mapping: Record<string, string>, key: string): unknown {
  const column = mapping[key];
  return column ? row[column] : undefined;
}

function storageKey(type: MigrationDataType): string {
  return {
    clients: 'gcp_clients', projects: 'gcp_projects', employees: 'gcp_employees',
    punches: 'gcp_punchSessions', documents: 'gcp_documents', expenses: 'gcp_expenses',
    payroll: 'gcp_payrollPayments', suppliers: 'gcp_suppliers', catalogue: 'gcp_catalogue',
    inventory: 'gcp_inventory', tools: 'gcp_toolAssets'
  }[type];
}

function convert(type: MigrationDataType, row: Record<string, unknown>, mapping: Record<string, string>): any | null {
  const get = (key: string) => mapped(row, mapping, key);
  const today = new Date().toISOString().slice(0, 10);
  if (type === 'clients') {
    const name = text(get('name')); if (!name) return null;
    return { id: id(), name, company: text(get('company')), email: text(get('email')), phone: text(get('phone')), address: text(get('address')) } satisfies Client;
  }
  if (type === 'projects') {
    const name = text(get('name')); if (!name) return null;
    const statusRaw = text(get('status')).toLowerCase();
    const status: Project['status'] = /complete|closed|termine/.test(statusRaw) ? 'completed' : /hold|pause/.test(statusRaw) ? 'on-hold' : 'active';
    return { id: id(), name, clientName: text(get('clientName')), address: text(get('address')), latitude: 0, longitude: 0, radius: 100, assignedEmployees: [], status } satisfies Project;
  }
  if (type === 'employees') {
    const name = text(get('name')); if (!name) return null;
    return { id: id(), name, nip: String(Math.floor(1000 + Math.random() * 9000)), role: 'employee', hourlyRate: number(get('hourlyRate')), workerType: text(get('workerType')) || 'Employé importé', asNumber: '', phone: text(get('phone')), address: '', hireDate: date(get('hireDate')) || today, avatar: '', level: 1, xp: 0, email: text(get('email')), workMode: 'hour' } satisfies Employee;
  }
  if (type === 'punches') {
    const employeeName = text(get('employeeName')); const startTime = iso(get('startTime')); if (!employeeName || !startTime) return null;
    const hours = number(get('hours')); const rate = number(get('rate')); const amount = number(get('amount')) || hours * rate;
    return { id: id(), employeeId: '', employeeName, projectId: '', projectName: text(get('projectName')), payMode: 'horaire', rate, startTime, endTime: iso(get('endTime')) || null, pausedAt: null, totalPauseMinutes: 0, withinGeofence: true, revenue: amount, totalWorkedHours: hours } satisfies PunchSession;
  }
  if (type === 'documents') {
    const documentNumber = text(get('number')); if (!documentNumber) return null;
    const rawType = text(get('type')).toLowerCase();
    const documentType: GCPDocument['type'] = /contract|contrat/.test(rawType) ? 'contract' : /quote|estimate|devis/.test(rawType) ? 'quote' : 'invoice';
    const rawStatus = text(get('status')).toLowerCase();
    const status: GCPDocument['status'] = /paid|paye/.test(rawStatus) ? 'paid' : /accept/.test(rawStatus) ? 'accepted' : /sent|envoye/.test(rawStatus) ? 'sent' : /overdue|retard/.test(rawStatus) ? 'overdue' : 'draft';
    const subtotal = number(get('subtotal')); const taxAmount = number(get('taxAmount')); const total = number(get('total')) || subtotal + taxAmount;
    const description = text(get('description'));
    return { id: id(), type: documentType, number: documentNumber, date: date(get('date')) || today, dueDate: date(get('dueDate')) || date(get('date')) || today, status, clientId: '', clientName: text(get('clientName')), clientAddress: '', clientEmail: '', clientPhone: '', isSimpleLayout: true, lineItems: description ? [{ id: id(), description, qty: 1, unit: 'forfait', unitPrice: subtotal || total, total: subtotal || total }] : [], materialLines: [], labourLines: [], otherLines: [], subcontractLines: [], subtotal: subtotal || total - taxAmount, discountPct: 0, taxRate: subtotal ? (taxAmount / subtotal) * 100 : 0, taxAmount, total, holdbackPct: 0, holdbackAmount: 0, depositAmount: 0, balanceDue: /paid|paye/.test(rawStatus) ? 0 : total, acceptedPayments: ['cheque','etransfer','virement'], lateInterestPct: 0, depositPct: 0, paymentMidPct: 0, paymentFinalPct: 100, quoteValidDays: 30, permitBy: 'na', warrantyYears: 0, hasInsurance: false, subcontractAuthorized: false, ownerName: '', paymentsHistory: [] } satisfies GCPDocument;
  }
  if (type === 'expenses') {
    const provider = text(get('provider')); const amount = number(get('amount')); if (!provider || !amount) return null;
    const categoryRaw = text(get('category')).toLowerCase();
    const category: ExpenseRecord['category'] = /tool|outil/.test(categoryRaw) ? 'tools' : /fuel|gas|essence/.test(categoryRaw) ? 'fuel' : /rent|location/.test(categoryRaw) ? 'rental' : /subcontract|sous/.test(categoryRaw) ? 'subcontractor' : /admin|office/.test(categoryRaw) ? 'admin' : /material|materiau/.test(categoryRaw) ? 'materials' : 'other';
    return { id: id(), provider, category, projectId: text(get('project')), amount, tax: number(get('tax')), date: date(get('date')) || today, notes: text(get('notes')) } satisfies ExpenseRecord;
  }
  if (type === 'payroll') {
    const employeeName = text(get('employeeName')); const amount = number(get('amount')); if (!employeeName || !amount) return null;
    const statusRaw = text(get('status')).toLowerCase();
    const status: PayrollPayment['status'] = /paid|paye/.test(statusRaw) ? 'paid' : /approved|approuve/.test(statusRaw) ? 'approved' : 'draft';
    return { id: id(), employeeId: '', employeeName, period: text(get('period')), amount, status, date: date(get('date')) || today, hours: number(get('hours')) } satisfies PayrollPayment;
  }
  if (type === 'suppliers') {
    const name = text(get('name')); if (!name) return null;
    return { id: id(), name, contactName: text(get('contactName')), phone: text(get('phone')), email: text(get('email')), notes: text(get('notes')) } satisfies Supplier;
  }
  if (type === 'catalogue') {
    const name = text(get('name')); if (!name) return null;
    const rawUnit = text(get('unit')).toLowerCase();
    const unit: CatalogueMaterial['unit'] = /lin/.test(rawUnit) ? 'pi_lin' : /box|boite/.test(rawUnit) ? 'boite' : /roll|rouleau/.test(rawUnit) ? 'rouleau' : /unit|unite/.test(rawUnit) ? 'unite' : /lot/.test(rawUnit) ? 'lot' : 'pi2';
    return { id: id(), name, emoji: '📦', pricePerSqFt: number(get('labourPrice')), supplierPrice: number(get('supplierPrice')), clientPrice: number(get('clientPrice')), unit } satisfies CatalogueMaterial;
  }
  if (type === 'inventory') {
    const name = text(get('name')); if (!name) return null;
    return { id: id(), name, quantity: number(get('quantity')), unit: text(get('unit')) || 'unité', emoji: '📦', minThreshold: number(get('minThreshold')) } satisfies InventoryItem;
  }
  if (type === 'tools') {
    const name = text(get('name')); if (!name) return null;
    const now = new Date().toISOString();
    return { id: id(), name, category: 'Autre', brand: text(get('brand')), model: text(get('model')), serialNumber: text(get('serialNumber')), assetTag: '', purchaseDate: date(get('purchaseDate')), purchasePrice: number(get('purchasePrice')), replacementValue: number(get('replacementValue')), seller: '', warrantyExpiry: '', currentLocation: text(get('location')), status: 'in_service', notes: 'Importé depuis une ancienne application', createdAt: now, updatedAt: now } satisfies ToolAsset;
  }
  return null;
}

export function importMappedMigrationRows(params: {
  type: MigrationDataType;
  rows: Record<string, unknown>[];
  mapping: Record<string, string>;
}): MigrationImportResult {
  const required = DEFINITIONS[params.type].filter(field => field.required);
  const missing = required.filter(field => !params.mapping[field.key]);
  if (missing.length) return { ok: false, imported: 0, skipped: params.rows.length, message: `Champs obligatoires non associés : ${missing.map(field => field.labelFR).join(', ')}` };
  const converted = params.rows.map(row => convert(params.type, row, params.mapping)).filter(Boolean);
  const key = storageKey(params.type);
  let existing: any[] = [];
  try { existing = JSON.parse(localStorage.getItem(key) || '[]'); } catch { existing = []; }
  const merged = [...existing, ...converted];
  localStorage.setItem(key, JSON.stringify(merged));

  const queueKey = 'gcp_pendingLegacyMigration';
  let queue: Record<string, any[]> = {};
  try { queue = JSON.parse(localStorage.getItem(queueKey) || '{}'); } catch { queue = {}; }
  queue[params.type] = [...(queue[params.type] || []), ...converted];
  localStorage.setItem(queueKey, JSON.stringify(queue));

  return {
    ok: converted.length > 0,
    imported: converted.length,
    skipped: params.rows.length - converted.length,
    storageKey: key,
    message: `${converted.length} éléments importés; ${params.rows.length - converted.length} ignorés.`
  };
}
