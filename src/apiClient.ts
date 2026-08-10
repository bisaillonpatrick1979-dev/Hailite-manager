// Couche de synchronisation avec la base de données Supabase (voir server.ts /api/db,
// /api/hydrate, et db.ts). Les changements sont reflétés immédiatement en mémoire,
// mais les données métier ne sont plus persistées dans localStorage. Tout échec cloud
// déclenche un état visible dans l'interface afin que l'utilisateur sache que la
// sauvegarde distante n'a pas abouti.
import type {
  Employee, Project, PunchSession, Invoice, Supplier, CatalogueMaterial, InventoryItem, ToolAsset, ToolTheftReport,
  SupplierOrder, Client, CompanyInfo, WeeklyGoal, MotivationTeam, MotivationGoal, HRAlert,
  GCPDocument, ExpenseRecord, PayrollPayment, ProjectPhoto, ChangeOrder, InsuranceClaim, Lead,
  ShiftAssignment, SafetyRecord
} from './types';
import { normalizeToolAssetStatus } from './types';
import { LOCAL_CLOUD_SYNC_TEST_MODE, LOCAL_TEST_MODE } from './testProfiles';
import { apiFetch, isNativeRuntime } from './runtimeConfig';

// Génère un identifiant compatible avec les colonnes uuid de Supabase (les anciens
// identifiants "prefix-Date.now()" ne sont pas des UUID valides et feraient échouer
// tout insert distant).
export function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------------------------------------------------------------------------
// Session : le serveur place le JWT dans un cookie HttpOnly SameSite=Strict.
// JavaScript ne peut donc ni le lire ni l'exfiltrer depuis localStorage.
// ---------------------------------------------------------------------------
let authenticatedSession = false;
let nativeSessionToken = '';

export function setAuthenticatedSession(active: boolean, sessionToken?: string) {
  authenticatedSession = active;
  if (!active) nativeSessionToken = '';
  if (active && isNativeRuntime && sessionToken) nativeSessionToken = sessionToken;
  // Purge les jetons lisibles laissés par les versions précédentes.
  try {
    localStorage.removeItem('gcp_authToken');
    localStorage.removeItem('gcp_auth_token');
    localStorage.removeItem('gcp_ai_token');
  } catch { /* stockage local indisponible */ }
}
export function hasAuthenticatedSession(): boolean { return authenticatedSession; }

export function authHeaders(): Record<string, string> {
  return nativeSessionToken ? { Authorization: `Bearer ${nativeSessionToken}` } : {};
}

export type AuthLoginStatus = 'ok' | 'invalid' | 'throttled' | 'unavailable';

// Identité renvoyée par la connexion. Les trois champs de consentement sont
// inclus pour que le client sache immédiatement si les avis ont déjà été
// acceptés, sans attendre l'hydratation.
export interface AuthLoginUser {
  id: string;
  name: string;
  role: string;
  privacyNoticeVersion?: string;
  privacyNoticeAcknowledgedAt?: string;
  locationNoticeAcknowledgedAt?: string;
}

// Connexion vérifiée côté serveur : le cookie HttpOnly est mémorisé par le navigateur.
export async function authLogin(employeeId: string, nip: string):
  Promise<{ status: AuthLoginStatus; user?: AuthLoginUser }> {
  try {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId, nip })
    });
    if (res.ok) {
      const data = await res.json();
      setAuthenticatedSession(true, typeof data.sessionToken === 'string' ? data.sessionToken : undefined);
      return { status: 'ok', user: data.user };
    }
    if (res.status === 401) return { status: 'invalid' };
    if (res.status === 429) return { status: 'throttled' };
    return { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function authLogout(): Promise<void> {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST', headers: authHeaders(), credentials: 'same-origin' });
  } catch { /* le cookie expirera côté serveur même si le réseau est coupé */ }
  setAuthenticatedSession(false);
}

// Annuaire minimal (sans NIP/NAS/salaire) pour l'écran de connexion, avant authentification
export interface DirectoryUser { id: string; name: string; avatar: string }
export async function fetchLoginDirectory(): Promise<DirectoryUser[]> {
  if (!cloudSyncAllowed || demoSandboxIsolation) return [];
  try {
    const res = await apiFetch('/api/auth/directory', { credentials: 'same-origin' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.users) ? data.users : [];
  } catch {
    return [];
  }
}

let cloudEnabled = false;
const localTestModeEnabled = () => LOCAL_TEST_MODE;
// Le bac à sable de cinq ans vit exclusivement dans la mémoire du navigateur.
// Cette garde est vérifiée au plus bas niveau (juste avant chaque fetch) afin
// qu'une action déclenchée par un écran ou par l'assistant ne puisse jamais
// écrire les données fictives dans Supabase.
let demoSandboxIsolation = false;
export function setDemoSandboxIsolation(active: boolean): void {
  demoSandboxIsolation = active;
  if (active) cloudEnabled = false;
}
export function isDemoSandboxIsolationActive(): boolean { return demoSandboxIsolation; }

let cloudSyncAllowed = (() => {
  if (localTestModeEnabled()) return false;
  try {
    const company = JSON.parse(localStorage.getItem('gcp_companyInfo') || '{}');
    return ['supabase', 'hybrid', 'cloud'].includes(company?.dataStorageMode);
  } catch { return true; }
})();
export function isCloudEnabled() { return cloudEnabled && cloudSyncAllowed && !demoSandboxIsolation; }
export function setCloudSyncAllowed(allowed: boolean) {
  cloudSyncAllowed = localTestModeEnabled() && !LOCAL_CLOUD_SYNC_TEST_MODE ? false : allowed;
  if (!cloudSyncAllowed || demoSandboxIsolation) cloudEnabled = false;
}
export function isCloudSyncAllowed() { return cloudSyncAllowed && !demoSandboxIsolation; }

let cachedCompanyId: string | null = null;
export function getCompanyId() { return cachedCompanyId; }

async function dbList(table: string): Promise<any[]> {
  if (demoSandboxIsolation) return [];
  if (!cloudSyncAllowed) throw new Error('Cloud sync disabled by company settings');
  const res = await apiFetch(`/api/db/${table}?limit=500`, { headers: authHeaders(), credentials: 'same-origin' });
  if (!res.ok) throw new Error(`GET ${table} → ${res.status}`);
  return res.json();
}

async function dbInsert(table: string, row: Record<string, any>): Promise<any> {
  if (demoSandboxIsolation) return { demo: true };
  if (!cloudSyncAllowed) throw new Error('Cloud sync disabled by company settings');
  const res = await apiFetch(`/api/db/${table}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(row)
  });
  if (!res.ok) throw new Error(`POST ${table} → ${res.status}`);
  return res.json();
}

async function dbUpsert(table: string, row: Record<string, any>): Promise<any> {
  if (demoSandboxIsolation) return { demo: true };
  if (!cloudSyncAllowed) throw new Error('Cloud sync disabled by company settings');
  const res = await apiFetch(`/api/db/${table}`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(row)
  });
  if (!res.ok) throw new Error(`PUT ${table} → ${res.status}`);
  return res.json();
}

async function dbUpdate(table: string, id: string, row: Record<string, any>): Promise<any> {
  if (demoSandboxIsolation) return { demo: true };
  if (!cloudSyncAllowed) throw new Error('Cloud sync disabled by company settings');
  const res = await apiFetch(`/api/db/${table}/${id}`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(row)
  });
  if (!res.ok) throw new Error(`PATCH ${table}/${id} → ${res.status}`);
  return res.json();
}

async function dbDelete(table: string, id: string): Promise<void> {
  if (demoSandboxIsolation) return;
  if (!cloudSyncAllowed) throw new Error('Cloud sync disabled by company settings');
  const res = await apiFetch(`/api/db/${table}/${id}`, { method: 'DELETE', headers: authHeaders(), credentials: 'same-origin' });
  if (!res.ok) throw new Error(`DELETE ${table}/${id} → ${res.status}`);
}

// Horodatage de la dernière écriture locale vers le cloud. L'hydratation
// périodique (voir store.hydrateCloud) se met en pause tant qu'une modification
// est récente ou en vol, pour ne jamais écraser une saisie en cours avec un
// instantané cloud encore en retard (ex: tâches de chantier tout juste ajoutées).
let lastMutationAt = 0;
export function noteMutation() { lastMutationAt = Date.now(); }
export function msSinceLastMutation() { return Date.now() - lastMutationAt; }

export interface CloudSyncStatusDetail {
  status: 'pending' | 'synced' | 'error';
  label: string;
  message?: string;
}

function notifySync(detail: CloudSyncStatusDetail): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<CloudSyncStatusDetail>('gcp:sync-status', { detail }));
  }
}

// Les actions locales restent instantanées, mais un échec distant est désormais
// visible dans l'interface au lieu d'être caché uniquement dans la console.
function bestEffort(promise: Promise<any>, label: string): Promise<void> {
  if (demoSandboxIsolation) return promise.then(() => undefined, () => undefined);
  noteMutation();
  notifySync({ status: 'pending', label });
  return promise
    .then(() => { notifySync({ status: 'synced', label }); })
    .catch(err => {
      const message = String(err?.message || 'Erreur de synchronisation');
      console.warn(`[cloud-sync] ${label} a échoué :`, message);
      notifySync({ status: 'error', label, message });
    })
    .finally(noteMutation);
}

export interface PrivacyNoticeAcknowledgement {
  privacyNoticeVersion: string;
  privacyNoticeAcknowledgedAt: string;
  locationNoticeAcknowledgedAt: string;
}

// Contrairement aux écritures métier "best effort", l'avis ne disparaît pas
// tant que le serveur n'a pas confirmé sa sauvegarde. Aucun identifiant ni
// horodatage fourni par le navigateur n'est envoyé : la session et le serveur
// déterminent la ligne et les valeurs à écrire.
export async function savePrivacyNoticeAcknowledgement(): Promise<PrivacyNoticeAcknowledgement> {
  const label = 'consentement de confidentialité';
  if (demoSandboxIsolation) throw new Error('Confirmation indisponible dans le bac à sable de démonstration');
  if (!cloudSyncAllowed) throw new Error('La sauvegarde infonuagique est désactivée');
  noteMutation();
  notifySync({ status: 'pending', label });
  try {
    const res = await apiFetch('/api/auth/privacy-notice', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...authHeaders() }
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof payload.error === 'string' ? payload.error : `HTTP ${res.status}`);
    }
    if (
      typeof payload.privacyNoticeVersion !== 'string' ||
      typeof payload.privacyNoticeAcknowledgedAt !== 'string' ||
      typeof payload.locationNoticeAcknowledgedAt !== 'string'
    ) {
      throw new Error('Réponse de confirmation invalide');
    }
    notifySync({ status: 'synced', label });
    return payload as PrivacyNoticeAcknowledgement;
  } catch (error: any) {
    const message = String(error?.message || 'Erreur de synchronisation');
    notifySync({ status: 'error', label, message });
    throw error;
  } finally {
    noteMutation();
  }
}

// ---------------------------------------------------------------------------
// Mappers camelCase (app) <-> snake_case (base de données)
// ---------------------------------------------------------------------------

const workModeToPayMode: Record<string, string> = { hour: 'horaire', sqft: 'surface', flat: 'forfait' };
// Inclut les anciens formats écrits par la version ChatGPT de l'app (square_foot,
// hourly, fixed) encore présents dans la base de production.
const payModeToWorkMode: Record<string, string> = {
  horaire: 'hour', surface: 'sqft', forfait: 'flat',
  hourly: 'hour', square_foot: 'sqft', fixed: 'flat'
};

// Anciens rôles de la version ChatGPT ("owner", "subcontractor") vers les rôles actuels
const legacyRoleMap: Record<string, Employee['role']> = {
  admin: 'admin', owner: 'admin',
  employee: 'employee', subcontractor: 'employee',
  secretary: 'secretary', accountant: 'accountant'
};

// Normalisation des rôles hérités pour tout usage côté client (annuaire de
// connexion inclus) : "owner" doit donner accès admin dans l'interface.
export const normalizeAppRole = (r: string | null | undefined): Employee['role'] =>
  legacyRoleMap[String(r || '').toLowerCase()] || 'employee';

export function employeeToRow(e: Employee, companyId?: string) {
  return {
    id: e.id, company_id: companyId, full_name: e.name, avatar_initials: e.name.slice(0, 2).toUpperCase(),
    role: e.role,
    ...(/^\d{4}$/.test(e.nip || '') ? { access_code: e.nip } : {}),
    pay_mode: workModeToPayMode[e.workMode || 'hour'] || 'horaire',
    pay_rate: e.hourlyRate, is_active: true, worker_type: e.workerType, as_number: e.asNumber,
    phone: e.phone, address: e.address, hire_date: e.hireDate || null, avatar: e.avatar,
    level: e.level, xp: e.xp, contract_renewal_date: e.contractRenewalDate || null,
    vacation_rate_override: e.vacationRateOverride, email: e.email, city: e.city, province: e.province,
    postal_code: e.postalCode, emergency_contact_name: e.emergencyContactName,
    emergency_contact_phone: e.emergencyContactPhone, emergency_contact_relation: e.emergencyContactRelation,
    business_name: e.businessName, gst_number: e.gstNumber, sin: e.sin, employee_province: e.employeeProvince,
    pay_frequency: e.payFrequency, pay_period_start: e.payPeriodStart || null, annual_salary: e.annualSalary,
    credentials: e.credentials || [], business_logo: e.businessLogo,
    privacy_notice_version: e.privacyNoticeVersion, privacy_notice_acknowledged_at: e.privacyNoticeAcknowledgedAt || null,
    location_notice_acknowledged_at: e.locationNoticeAcknowledgedAt || null
  };
}

export function rowToEmployee(r: any): Employee {
  return {
    id: r.id, name: r.full_name,
    nip: '',
    role: legacyRoleMap[r.role] || 'employee', hourlyRate: r.pay_rate || 0,
    workerType: r.worker_type || '', asNumber: r.as_number || '', phone: r.phone || '', address: r.address || '',
    hireDate: r.hire_date || '', avatar: r.avatar || '', level: r.level || 1, xp: r.xp || 0,
    workMode: payModeToWorkMode[r.pay_mode] as any, contractRenewalDate: r.contract_renewal_date || undefined,
    vacationRateOverride: r.vacation_rate_override ?? undefined, email: r.email || undefined, city: r.city || undefined,
    province: r.province || undefined, postalCode: r.postal_code || undefined,
    emergencyContactName: r.emergency_contact_name || undefined, emergencyContactPhone: r.emergency_contact_phone || undefined,
    emergencyContactRelation: r.emergency_contact_relation || undefined, businessName: r.business_name || undefined,
    gstNumber: r.gst_number || undefined, sin: r.sin || undefined, employeeProvince: r.employee_province || undefined,
    payFrequency: r.pay_frequency || undefined, payPeriodStart: r.pay_period_start || undefined,
    annualSalary: r.annual_salary ?? undefined,
    credentials: Array.isArray(r.credentials) ? r.credentials : [], businessLogo: r.business_logo || undefined,
    privacyNoticeVersion: r.privacy_notice_version || undefined,
    privacyNoticeAcknowledgedAt: r.privacy_notice_acknowledged_at || undefined,
    locationNoticeAcknowledgedAt: r.location_notice_acknowledged_at || undefined
  };
}

export function projectToRow(p: Project, companyId?: string) {
  return {
    id: p.id, company_id: companyId, name: p.name, client_name: p.clientName, address: p.address,
    latitude: p.latitude, longitude: p.longitude, radius: p.radius, status: p.status
  };
}

export function rowToProject(r: any, tasks: any[], tools: any[], assignments: any[]): Project {
  return {
    id: r.id, name: r.name || '', clientName: r.client_name || '', address: r.address || '',
    latitude: r.latitude || 0, longitude: r.longitude || 0, radius: r.radius || 100,
    assignedEmployees: assignments.filter(a => a.project_id === r.id).map(a => a.user_id),
    status: r.status || 'active',
    tasks: tasks.filter(t => t.project_id === r.id).map(t => ({
      id: t.id, text: t.title || '', done: t.status === 'done', priority: t.priority || 'normal', createdAt: t.created_at || ''
    })),
    tools: tools.filter(t => t.project_id === r.id).map(t => ({ id: t.id, name: t.name || '', brought: !!t.brought }))
  };
}

// Les colonnes id de la base sont de type uuid : les anciens identifiants locaux
// ("task-172...", "li-172...") faisaient échouer chaque insert en silence, et le
// rafraîchissement cloud effaçait ensuite les listes locales. On les remplace par
// un UUID au moment de construire la ligne (les enfants étant resynchronisés en
// bloc "delete puis reinsert", l'identité exacte n'a pas d'importance côté cloud).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const asUuid = (id: string) => (UUID_RE.test(id) ? id : genId());

export function projectTasksToRows(p: Project) {
  return (p.tasks || []).map(t => ({ id: asUuid(t.id), project_id: p.id, title: t.text, status: t.done ? 'done' : 'todo', priority: t.priority }));
}
export function projectToolsToRows(p: Project) {
  return (p.tools || []).map(t => ({ id: asUuid(t.id), project_id: p.id, name: t.name, brought: t.brought }));
}
export function projectAssignmentsToRows(p: Project) {
  return p.assignedEmployees.map(empId => ({ project_id: p.id, user_id: empId }));
}

async function replaceProjectChildren(project: Project): Promise<void> {
  if (demoSandboxIsolation) return;
  const res = await apiFetch(`/api/projects/${encodeURIComponent(project.id)}/children`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      tasks: projectTasksToRows(project),
      tools: projectToolsToRows(project),
      assignments: projectAssignmentsToRows(project)
    })
  });
  if (!res.ok) throw new Error(`PUT project children → ${res.status}`);
}

// Une seule requête appelle une fonction Postgres transactionnelle : aucune
// fenêtre ne subsiste entre la suppression et la réinsertion des enfants.
export function syncProjectChildren(project: Project): Promise<void> {
  if (demoSandboxIsolation) return Promise.resolve();
  return bestEffort(replaceProjectChildren(project), `chantier ${project.id}`);
}

// Insère d'abord le chantier (contrainte de clé étrangère des tables enfants),
// puis synchronise tâches/outils/assignations — ne doivent pas partir en parallèle.
export function syncProjectInsert(project: Project): Promise<void> {
  if (demoSandboxIsolation) return Promise.resolve();
  return bestEffort(
    dbInsert('projects', projectToRow(project)).then(() => replaceProjectChildren(project)),
    `création chantier ${project.id}`
  );
}

export function punchToRow(p: PunchSession, companyId?: string) {
  return {
    id: p.id, company_id: companyId, employee_id: p.employeeId, employee_name: p.employeeName,
    project_id: p.projectId, project_name: p.projectName, pay_mode: p.payMode, rate: p.rate,
    start_time: p.startTime, end_time: p.endTime, paused_at: p.pausedAt, total_pause_minutes: p.totalPauseMinutes,
    within_geofence: p.withinGeofence, attempted_outside_geofence: p.attemptedOutsideGeofence || false,
    outside_details: p.outsideDetails, revenue: p.revenue, total_worked_hours: p.totalWorkedHours,
    surface_materials: p.surfaceMaterials || null
  };
}

export function rowToPunch(r: any): PunchSession {
  return {
    id: r.id, employeeId: r.employee_id, employeeName: r.employee_name || '', projectId: r.project_id,
    projectName: r.project_name || '', payMode: r.pay_mode, rate: r.rate || 0, startTime: r.start_time,
    endTime: r.end_time, pausedAt: r.paused_at, totalPauseMinutes: r.total_pause_minutes || 0,
    withinGeofence: r.within_geofence ?? true, attemptedOutsideGeofence: r.attempted_outside_geofence || false,
    outsideDetails: r.outside_details || undefined, surfaceMaterials: r.surface_materials || undefined,
    revenue: r.revenue || 0, totalWorkedHours: r.total_worked_hours ?? undefined
  };
}

export function invoiceToRow(i: Invoice, companyId?: string) {
  return {
    id: i.id, company_id: companyId, user_id: i.employeeId, employee_name: i.employeeName,
    invoice_number: i.invoiceNumber, date: i.date, session_ids: i.sessionIds, hours: i.totalHours,
    amount: i.amount, gst_amount: i.gstAmount, qst_amount: i.qstAmount, total_with_taxes: i.totalWithTaxes,
    status: i.status, notes: i.notes, tax_included: i.taxIncluded, employee_signature: i.employeeSignature,
    employee_signed_at: i.employeeSignedAt, currency: i.currency, tax_rate1: i.taxRate1, tax_rate2: i.taxRate2,
    local_tax_rate: i.localTaxRate, local_tax_amount: i.localTaxAmount, tax_rate1_name: i.taxRate1Name,
    tax_rate2_name: i.taxRate2Name, issuer_name: i.issuerName, issuer_address: i.issuerAddress,
    issuer_tax_number: i.issuerTaxNumber, issuer_logo: i.issuerLogo, recipient_name: i.recipientName
  };
}

export function rowToInvoice(r: any): Invoice {
  return {
    id: r.id, employeeId: r.user_id, employeeName: r.employee_name || '', invoiceNumber: r.invoice_number || '',
    date: r.date || '', sessionIds: r.session_ids || [], totalHours: r.hours || 0, amount: r.amount || 0,
    gstAmount: r.gst_amount || 0, qstAmount: r.qst_amount || 0, totalWithTaxes: r.total_with_taxes || 0,
    status: r.status || 'draft', notes: r.notes || undefined, taxIncluded: r.tax_included || false,
    employeeSignature: r.employee_signature || undefined, employeeSignedAt: r.employee_signed_at || undefined,
    currency: r.currency || undefined, taxRate1: r.tax_rate1 ?? undefined, taxRate2: r.tax_rate2 ?? undefined,
    localTaxRate: r.local_tax_rate ?? undefined, localTaxAmount: r.local_tax_amount ?? undefined,
    taxRate1Name: r.tax_rate1_name || undefined, taxRate2Name: r.tax_rate2_name || undefined,
    issuerName: r.issuer_name || undefined, issuerAddress: r.issuer_address || undefined,
    issuerTaxNumber: r.issuer_tax_number || undefined, issuerLogo: r.issuer_logo || undefined,
    recipientName: r.recipient_name || undefined
  };
}

export function supplierToRow(s: Supplier, companyId?: string) {
  return { id: s.id, company_id: companyId, name: s.name, contact_name: s.contactName, phone: s.phone, email: s.email, notes: s.notes };
}
export function rowToSupplier(r: any): Supplier {
  return { id: r.id, name: r.name || '', contactName: r.contact_name || undefined, phone: r.phone || undefined, email: r.email || undefined, notes: r.notes || undefined };
}

export function catalogueToRow(c: CatalogueMaterial, companyId?: string) {
  return {
    id: c.id, company_id: companyId, name: c.name, emoji: c.emoji, price_per_sqft: c.pricePerSqFt,
    supplier_price: c.supplierPrice, client_price: c.clientPrice, supplier_id: c.supplierId || null,
    unit: c.unit, unit_note: c.unitNote, image_url: c.imageUrl, image_alt: c.imageAlt
  };
}
export function rowToCatalogue(r: any): CatalogueMaterial {
  return {
    id: r.id, name: r.name || '', emoji: r.emoji || '📦', pricePerSqFt: r.price_per_sqft || 0,
    supplierPrice: r.supplier_price ?? undefined, clientPrice: r.client_price ?? undefined,
    supplierId: r.supplier_id || undefined, unit: r.unit || undefined, unitNote: r.unit_note || undefined,
    imageUrl: r.image_url || undefined, imageAlt: r.image_alt || undefined
  };
}

export function inventoryToRow(i: InventoryItem, companyId?: string) {
  return { id: i.id, company_id: companyId, name: i.name, quantity: i.quantity, unit: i.unit, emoji: i.emoji, min_threshold: i.minThreshold };
}
export function rowToInventory(r: any): InventoryItem {
  return { id: r.id, name: r.name || '', quantity: r.quantity || 0, unit: r.unit || '', emoji: r.emoji || '📦', minThreshold: r.min_threshold || 0 };
}


export function toolAssetToRow(tool: ToolAsset, companyId?: string) {
  return {
    id: tool.id, company_id: companyId, name: tool.name, category: tool.category,
    brand: tool.brand, model: tool.model, serial_number: tool.serialNumber,
    asset_tag: tool.assetTag, purchase_date: tool.purchaseDate || null,
    purchase_price: tool.purchasePrice, replacement_value: tool.replacementValue,
    seller: tool.seller, warranty_expiry: tool.warrantyExpiry || null,
    current_location: tool.currentLocation, assigned_employee_id: tool.assignedEmployeeId || null,
    assigned_employee_name: tool.assignedEmployeeName || null, status: tool.status, notes: tool.notes,
    tool_photo: tool.toolPhoto || null, serial_photo: tool.serialPhoto || null,
    receipt_photo: tool.receiptPhoto || null, receipt_file_name: tool.receiptFileName || null,
    created_at: tool.createdAt, updated_at: tool.updatedAt
  };
}

export function rowToToolAsset(r: any): ToolAsset {
  return {
    id: r.id, name: r.name || '', category: r.category || 'Autre', brand: r.brand || '',
    model: r.model || '', serialNumber: r.serial_number || '', assetTag: r.asset_tag || '',
    purchaseDate: r.purchase_date || '', purchasePrice: Number(r.purchase_price || 0),
    replacementValue: Number(r.replacement_value || 0), seller: r.seller || '',
    warrantyExpiry: r.warranty_expiry || '', currentLocation: r.current_location || '',
    assignedEmployeeId: r.assigned_employee_id || undefined,
    assignedEmployeeName: r.assigned_employee_name || undefined,
    // Un statut inconnu venu de la base faisait tomber tout l'onglet Outils :
    // la recherche du libellé retournait undefined puis plantait au rendu.
    status: normalizeToolAssetStatus(r.status), notes: r.notes || '', toolPhoto: r.tool_photo || undefined,
    serialPhoto: r.serial_photo || undefined, receiptPhoto: r.receipt_photo || undefined,
    receiptFileName: r.receipt_file_name || undefined,
    createdAt: r.created_at || new Date().toISOString(), updatedAt: r.updated_at || r.created_at || new Date().toISOString()
  };
}

export function toolTheftReportToRow(report: ToolTheftReport, companyId?: string) {
  return {
    id: report.id, company_id: companyId, incident_date: report.incidentDate,
    incident_time: report.incidentTime || null, incident_location: report.incidentLocation,
    circumstances: report.circumstances, discovered_by: report.discoveredBy,
    police_service: report.policeService, police_file_number: report.policeFileNumber,
    insurer: report.insurer, insurance_claim_number: report.insuranceClaimNumber,
    contact_name: report.contactName, contact_phone: report.contactPhone, contact_email: report.contactEmail,
    tool_ids: report.toolIds, tool_snapshots: report.toolSnapshots,
    total_replacement_value: report.totalReplacementValue, status: report.status,
    created_at: report.createdAt, updated_at: report.updatedAt
  };
}

export function rowToToolTheftReport(r: any): ToolTheftReport {
  return {
    id: r.id, incidentDate: r.incident_date || '', incidentTime: r.incident_time || '',
    incidentLocation: r.incident_location || '', circumstances: r.circumstances || '',
    discoveredBy: r.discovered_by || '', policeService: r.police_service || '',
    policeFileNumber: r.police_file_number || '', insurer: r.insurer || '',
    insuranceClaimNumber: r.insurance_claim_number || '', contactName: r.contact_name || '',
    contactPhone: r.contact_phone || '', contactEmail: r.contact_email || '',
    toolIds: Array.isArray(r.tool_ids) ? r.tool_ids : [],
    toolSnapshots: Array.isArray(r.tool_snapshots) ? r.tool_snapshots : [],
    totalReplacementValue: Number(r.total_replacement_value || 0), status: r.status || 'draft',
    createdAt: r.created_at || new Date().toISOString(), updatedAt: r.updated_at || r.created_at || new Date().toISOString()
  };
}

export function supplierOrderToRow(o: SupplierOrder, companyId?: string) {
  return { id: o.id, company_id: companyId, supplier_name: o.supplierName, date: o.date, status: o.status, total_amount: o.totalAmount };
}
export function rowToSupplierOrder(r: any, items: any[]): SupplierOrder {
  return {
    id: r.id, supplierName: r.supplier_name || '', date: r.date || '', status: r.status || 'ordered',
    totalAmount: r.total_amount || 0,
    items: items.filter(it => it.order_id === r.id).map(it => ({ name: it.name || '', quantity: it.quantity || 0, price: it.price || 0 }))
  };
}
export function orderItemsToRows(o: SupplierOrder) {
  return o.items.map(it => ({ order_id: o.id, name: it.name, quantity: it.quantity, price: it.price }));
}

async function replaceOrderItems(order: SupplierOrder): Promise<void> {
  const existing = await dbList('supplier_order_items');
  const stale = existing.filter((r: any) => r.order_id === order.id);
  await Promise.all(stale.map((r: any) => dbDelete('supplier_order_items', r.id)));
  await Promise.all(orderItemsToRows(order).map(row => dbInsert('supplier_order_items', row)));
}

export function syncOrderItems(order: SupplierOrder): Promise<void> {
  if (demoSandboxIsolation) return Promise.resolve();
  return bestEffort(replaceOrderItems(order), `articles commande ${order.id}`);
}

export function clientToRow(c: Client, companyId?: string) {
  return { id: c.id, company_id: companyId, name: c.name, company: c.company, email: c.email, phone: c.phone, address: c.address };
}
export function rowToClient(r: any): Client {
  return { id: r.id, name: r.name || '', company: r.company || undefined, email: r.email || '', phone: r.phone || '', address: r.address || '' };
}

export function companyInfoToRow(c: CompanyInfo) {
  return {
    name: c.name, address: c.address, phone: c.phone, email: c.email, gst_number: c.gstNumber,
    qst_number: c.qstNumber, wcb_number: c.wcbNumber, bn_number: c.bnNumber,
    construction_license_number: c.constructionLicenseNumber, logo: c.logo, interac_email: c.interacEmail,
    bank_name: c.bankDetails?.bank, bank_transit: c.bankDetails?.transit, bank_institution: c.bankDetails?.institution,
    bank_account: c.bankDetails?.account, geofencing_enabled: c.geofencingEnabled, vacation_rate: c.vacationRate,
    legal_minimum_wage: c.legalMinimumWage, voice_reminder_volume: c.voiceReminderVolume,
    voice_reminder_schedule: c.voiceReminderSchedule, payment_terms: c.paymentTerms,
    default_late_interest_pct: c.defaultLateInterestPct, default_warranty_years: c.defaultWarrantyYears,
    default_clause_change_order: c.defaultClauseChangeOrder, default_clause_resiliation: c.defaultClauseResiliation,
    payroll_vacation_rate: c.payrollVacationRate, payroll_health_insurance: c.payrollHealthInsurance,
    payroll_dental_insurance: c.payrollDentalInsurance, payroll_life_insurance: c.payrollLifeInsurance,
    payroll_ltd: c.payrollLTD, payroll_rrsp: c.payrollRRSP, payroll_eap: c.payrollEAP,
    payroll_custom1_name: c.payrollCustom1Name, payroll_custom1_amount: c.payrollCustom1Amount,
    payroll_custom2_name: c.payrollCustom2Name, payroll_custom2_amount: c.payrollCustom2Amount,
    is_onboarded: c.isOnboarded, country: c.country, region: c.region, tax_rate1: c.taxRate1, tax_rate2: c.taxRate2,
    tax_rate1_name: c.taxRate1Name, tax_rate2_name: c.taxRate2Name, payment_deposit_pct: c.paymentDepositPct,
    payment_mid_pct: c.paymentMidPct, payment_final_pct: c.paymentFinalPct, ai_provider: c.aiProvider,
    currency: c.currency, unit_system: c.unitSystem, date_locale: c.dateLocale, local_tax_rate: c.localTaxRate,
    tax_confirmed_at: c.taxConfirmedAt || null, tax_disclaimer_accepted_at: c.taxDisclaimerAcceptedAt || null,
    data_storage_mode: c.dataStorageMode, cloud_sync_consent: c.cloudSyncConsent, cloud_region: c.cloudRegion,
    privacy_policy_version: c.privacyPolicyVersion, privacy_policy_accepted_at: c.privacyPolicyAcceptedAt || null,
    privacy_contact_email: c.privacyContactEmail, privacy_officer_name: c.privacyOfficerName,
    retention_months: c.retentionMonths, employee_data_basis_confirmed: c.employeeDataBasisConfirmed,
    location_data_notice_confirmed: c.locationDataNoticeConfirmed,
    cross_border_transfer_acknowledged_at: c.crossBorderTransferAcknowledgedAt || null,
    processor_terms_accepted_at: c.processorTermsAcceptedAt || null, compliance_version: c.complianceVersion,
    personal_cloud_provider: c.personalCloudProvider || null,
    backup_folder_name: c.backupFolderName || null,
    backup_file_name: c.backupFileName || null,
    backup_connection_method: c.backupConnectionMethod || null,
    personal_backup_connected: c.personalBackupConnected ?? false,
    personal_backup_automatic: c.personalBackupAutomatic ?? false,
    last_personal_backup_at: c.lastPersonalBackupAt || null
  };
}

export function rowToCompanyInfo(r: any): Partial<CompanyInfo> {
  return {
    name: r.name || undefined, address: r.address || undefined, phone: r.phone || undefined, email: r.email || undefined,
    gstNumber: r.gst_number || undefined, qstNumber: r.qst_number || undefined, wcbNumber: r.wcb_number || undefined,
    bnNumber: r.bn_number || undefined, constructionLicenseNumber: r.construction_license_number || undefined,
    logo: r.logo || undefined, interacEmail: r.interac_email || undefined,
    bankDetails: { bank: r.bank_name || '', transit: r.bank_transit || '', institution: r.bank_institution || '', account: r.bank_account || '' },
    geofencingEnabled: r.geofencing_enabled ?? undefined, vacationRate: r.vacation_rate ?? undefined,
    legalMinimumWage: r.legal_minimum_wage ?? undefined, voiceReminderVolume: r.voice_reminder_volume ?? undefined,
    voiceReminderSchedule: r.voice_reminder_schedule || undefined, paymentTerms: r.payment_terms || undefined,
    defaultLateInterestPct: r.default_late_interest_pct ?? undefined, defaultWarrantyYears: r.default_warranty_years ?? undefined,
    defaultClauseChangeOrder: r.default_clause_change_order || undefined, defaultClauseResiliation: r.default_clause_resiliation || undefined,
    payrollVacationRate: r.payroll_vacation_rate ?? undefined, payrollHealthInsurance: r.payroll_health_insurance ?? undefined,
    payrollDentalInsurance: r.payroll_dental_insurance ?? undefined, payrollLifeInsurance: r.payroll_life_insurance ?? undefined,
    payrollLTD: r.payroll_ltd ?? undefined, payrollRRSP: r.payroll_rrsp ?? undefined, payrollEAP: r.payroll_eap ?? undefined,
    payrollCustom1Name: r.payroll_custom1_name || undefined, payrollCustom1Amount: r.payroll_custom1_amount ?? undefined,
    payrollCustom2Name: r.payroll_custom2_name || undefined, payrollCustom2Amount: r.payroll_custom2_amount ?? undefined,
    isOnboarded: r.is_onboarded ?? undefined, country: r.country || undefined, region: r.region || undefined,
    taxRate1: r.tax_rate1 ?? undefined, taxRate2: r.tax_rate2 ?? undefined, taxRate1Name: r.tax_rate1_name || undefined,
    taxRate2Name: r.tax_rate2_name || undefined, paymentDepositPct: r.payment_deposit_pct ?? undefined,
    paymentMidPct: r.payment_mid_pct ?? undefined, paymentFinalPct: r.payment_final_pct ?? undefined,
    aiProvider: r.ai_provider || undefined, currency: r.currency || undefined, unitSystem: r.unit_system || undefined,
    dateLocale: r.date_locale || undefined, localTaxRate: r.local_tax_rate ?? undefined,
    taxConfirmedAt: r.tax_confirmed_at || undefined, taxDisclaimerAcceptedAt: r.tax_disclaimer_accepted_at || undefined,
    dataStorageMode: r.data_storage_mode || undefined, cloudSyncConsent: r.cloud_sync_consent ?? undefined,
    cloudRegion: r.cloud_region || undefined, privacyPolicyVersion: r.privacy_policy_version || undefined,
    privacyPolicyAcceptedAt: r.privacy_policy_accepted_at || undefined, privacyContactEmail: r.privacy_contact_email || undefined,
    privacyOfficerName: r.privacy_officer_name || undefined, retentionMonths: r.retention_months ?? undefined,
    employeeDataBasisConfirmed: r.employee_data_basis_confirmed ?? undefined,
    locationDataNoticeConfirmed: r.location_data_notice_confirmed ?? undefined,
    crossBorderTransferAcknowledgedAt: r.cross_border_transfer_acknowledged_at || undefined,
    processorTermsAcceptedAt: r.processor_terms_accepted_at || undefined, complianceVersion: r.compliance_version || undefined,
    personalCloudProvider: r.personal_cloud_provider || undefined,
    backupFolderName: r.backup_folder_name || undefined,
    backupFileName: r.backup_file_name || undefined,
    backupConnectionMethod: r.backup_connection_method || undefined,
    personalBackupConnected: r.personal_backup_connected ?? undefined,
    personalBackupAutomatic: r.personal_backup_automatic ?? undefined,
    lastPersonalBackupAt: r.last_personal_backup_at || undefined
  };
}

export function weeklyGoalToRow(w: WeeklyGoal) {
  return {
    employee_id: w.employeeId, target_amount: w.targetAmount, current_amount: w.currentAmount,
    week_start: w.weekStart, xp_points: w.xpPoints, level: w.level, streak: w.streak, last_punch_date: w.lastPunchDate
  };
}
export function rowToWeeklyGoal(r: any): WeeklyGoal {
  return {
    employeeId: r.employee_id, targetAmount: r.target_amount || 0, currentAmount: r.current_amount || 0,
    weekStart: r.week_start || '', xpPoints: r.xp_points || 0, level: r.level || 1, streak: r.streak || 0,
    lastPunchDate: r.last_punch_date || null
  };
}

export function motivationTeamToRow(t: MotivationTeam, companyId?: string) {
  return {
    id: t.id, company_id: companyId, name: t.name, member_ids: t.memberIds, color: t.color,
    active: t.active, leader_id: t.leaderId || null, project_ids: t.projectIds || null
  };
}
export function rowToMotivationTeam(r: any): MotivationTeam {
  return {
    id: r.id, name: r.name || '', memberIds: r.member_ids || [], color: r.color || '#f97316',
    active: r.active ?? true, createdAt: r.created_at || '', leaderId: r.leader_id || undefined,
    projectIds: r.project_ids || undefined
  };
}

export function motivationGoalToRow(g: MotivationGoal, companyId?: string) {
  return {
    id: g.id, company_id: companyId, title: g.title, scope: g.scope, metric: g.metric, target: g.target,
    current: g.current, start_date: g.startDate, end_date: g.endDate || null, team_id: g.teamId || null,
    employee_id: g.employeeId || null, reward_type: g.rewardType, reward_title: g.rewardTitle,
    reward_description: g.rewardDescription, status: g.status
  };
}
export function rowToMotivationGoal(r: any): MotivationGoal {
  return {
    id: r.id, title: r.title || '', scope: r.scope, metric: r.metric, target: r.target || 0, current: r.current || 0,
    startDate: r.start_date || '', endDate: r.end_date || undefined, teamId: r.team_id || undefined,
    employeeId: r.employee_id || undefined, rewardType: r.reward_type, rewardTitle: r.reward_title || '',
    rewardDescription: r.reward_description || undefined, status: r.status || 'active'
  };
}

export function hrAlertToRow(a: HRAlert, companyId?: string) {
  return {
    id: a.id, company_id: companyId, type: a.type, title: a.title, message: a.message, date: a.date,
    employee_id: a.employeeId || null, employee_name: a.employeeName, resolved: a.resolved
  };
}
export function rowToHRAlert(r: any): HRAlert {
  return {
    id: r.id, type: r.type, title: r.title || '', message: r.message || '', date: r.date || '',
    employeeId: r.employee_id || undefined, employeeName: r.employee_name || undefined, resolved: r.resolved || false
  };
}

export function safetyRecordToRow(r: SafetyRecord, companyId?: string) {
  return {
    id: r.id, company_id: companyId, type: r.type, project_id: r.projectId,
    date: r.date, topic: r.topic, hazards: r.hazards || null,
    controls: r.controls || null, weather: r.weather || null, notes: r.notes || null,
    attendees: r.attendees || [], created_at: r.createdAt,
    created_by: r.createdById || null, created_by_name: r.createdByName || null
  };
}
export function rowToSafetyRecord(r: any): SafetyRecord {
  return {
    id: r.id,
    type: (r.type === 'hazard' ? 'hazard' : 'toolbox') as SafetyRecord['type'],
    projectId: r.project_id || '',
    date: r.date || '',
    topic: r.topic || '',
    hazards: Array.isArray(r.hazards) ? r.hazards : undefined,
    controls: r.controls || undefined,
    weather: r.weather || undefined,
    notes: r.notes || undefined,
    attendees: Array.isArray(r.attendees)
      ? r.attendees.map((a: any) => ({
          employeeId: String(a.employeeId || a.employee_id || ''),
          employeeName: String(a.employeeName || a.employee_name || ''),
          signature: a.signature || undefined,
          signedAt: a.signedAt || a.signed_at || undefined
        }))
      : [],
    createdAt: r.created_at || '',
    createdById: r.created_by || undefined,
    createdByName: r.created_by_name || undefined
  };
}

export function shiftAssignmentToRow(a: ShiftAssignment, companyId?: string) {
  return {
    id: a.id, company_id: companyId, date: a.date, project_id: a.projectId,
    employee_id: a.employeeId, employee_name: a.employeeName || null,
    note: a.note || null, created_at: a.createdAt,
    created_by: a.createdById || null, created_by_name: a.createdByName || null
  };
}
export function rowToShiftAssignment(r: any): ShiftAssignment {
  return {
    id: r.id,
    date: r.date || '',
    projectId: r.project_id || '',
    employeeId: r.employee_id || '',
    employeeName: r.employee_name || undefined,
    note: r.note || undefined,
    createdAt: r.created_at || '',
    createdById: r.created_by || undefined,
    createdByName: r.created_by_name || undefined
  };
}

export function leadToRow(l: Lead, companyId?: string) {
  return {
    id: l.id, company_id: companyId, name: l.name, phone: l.phone || null,
    email: l.email || null, address: l.address || null, source: l.source, status: l.status,
    estimated_value: l.estimatedValue ?? null, next_follow_up: l.nextFollowUp || null,
    notes: l.notes || null, lost_reason: l.lostReason || null, created_at: l.createdAt,
    created_by: l.createdById || null, created_by_name: l.createdByName || null,
    converted_client_id: l.convertedClientId || null,
    converted_project_id: l.convertedProjectId || null
  };
}
export function rowToLead(r: any): Lead {
  const statuses = ['new', 'contacted', 'inspection', 'quoted', 'won', 'lost'];
  const sources = ['referral', 'phone', 'website', 'door', 'repeat', 'insurance', 'other'];
  return {
    id: r.id,
    name: r.name || '',
    phone: r.phone || undefined,
    email: r.email || undefined,
    address: r.address || undefined,
    source: (sources.includes(r.source) ? r.source : 'other') as Lead['source'],
    status: (statuses.includes(r.status) ? r.status : 'new') as Lead['status'],
    estimatedValue: r.estimated_value === null || r.estimated_value === undefined ? undefined : Number(r.estimated_value),
    nextFollowUp: r.next_follow_up || undefined,
    notes: r.notes || undefined,
    lostReason: r.lost_reason || undefined,
    createdAt: r.created_at || '',
    createdById: r.created_by || undefined,
    createdByName: r.created_by_name || undefined,
    convertedClientId: r.converted_client_id || undefined,
    convertedProjectId: r.converted_project_id || undefined
  };
}

export function insuranceClaimToRow(c: InsuranceClaim, companyId?: string) {
  return {
    id: c.id, company_id: companyId, project_id: c.projectId, insurer: c.insurer,
    claim_number: c.claimNumber || '', policy_number: c.policyNumber || null,
    loss_type: c.lossType, loss_date: c.lossDate || null,
    adjuster_name: c.adjusterName || null, adjuster_phone: c.adjusterPhone || null,
    adjuster_email: c.adjusterEmail || null,
    deductible: c.deductible ?? null, acv: c.acv ?? null, rcv: c.rcv ?? null,
    supplement_amount: c.supplementAmount ?? null, approved_amount: c.approvedAmount ?? null,
    status: c.status, notes: c.notes || null, created_at: c.createdAt,
    created_by: c.createdById || null, created_by_name: c.createdByName || null
  };
}
export function rowToInsuranceClaim(r: any): InsuranceClaim {
  const losses = ['hail', 'wind', 'water', 'fire', 'other'];
  const statuses = ['open', 'submitted', 'approved', 'partial', 'denied', 'closed'];
  const opt = (v: any) => (v === null || v === undefined ? undefined : Number(v));
  return {
    id: r.id,
    projectId: r.project_id || '',
    insurer: r.insurer || '',
    claimNumber: r.claim_number || '',
    policyNumber: r.policy_number || undefined,
    lossType: (losses.includes(r.loss_type) ? r.loss_type : 'other') as InsuranceClaim['lossType'],
    lossDate: r.loss_date || undefined,
    adjusterName: r.adjuster_name || undefined,
    adjusterPhone: r.adjuster_phone || undefined,
    adjusterEmail: r.adjuster_email || undefined,
    deductible: opt(r.deductible), acv: opt(r.acv), rcv: opt(r.rcv),
    supplementAmount: opt(r.supplement_amount), approvedAmount: opt(r.approved_amount),
    status: (statuses.includes(r.status) ? r.status : 'open') as InsuranceClaim['status'],
    notes: r.notes || undefined,
    createdAt: r.created_at || '',
    createdById: r.created_by || undefined,
    createdByName: r.created_by_name || undefined
  };
}

export function changeOrderToRow(o: ChangeOrder, companyId?: string) {
  return {
    id: o.id, company_id: companyId, project_id: o.projectId, number: o.number,
    description: o.description, reason: o.reason || null, amount: o.amount,
    photo_url: o.photoUrl || null, status: o.status, created_at: o.createdAt,
    created_by: o.createdById || null, created_by_name: o.createdByName || null,
    client_name: o.clientName || null, client_signature: o.clientSignature || null,
    signed_at: o.signedAt || null
  };
}
export function rowToChangeOrder(r: any): ChangeOrder {
  const statuses = ['pending', 'approved', 'refused', 'invoiced'];
  return {
    id: r.id,
    projectId: r.project_id || '',
    number: r.number || '',
    description: r.description || '',
    reason: r.reason || undefined,
    amount: Number(r.amount || 0),
    photoUrl: r.photo_url || undefined,
    status: (statuses.includes(r.status) ? r.status : 'pending') as ChangeOrder['status'],
    createdAt: r.created_at || '',
    createdById: r.created_by || undefined,
    createdByName: r.created_by_name || undefined,
    clientName: r.client_name || undefined,
    clientSignature: r.client_signature || undefined,
    signedAt: r.signed_at || undefined
  };
}

export function projectPhotoToRow(p: ProjectPhoto, companyId?: string) {
  const row: Record<string, unknown> = {
    id: p.id, company_id: companyId, project_id: p.projectId, phase: p.phase,
    caption: p.caption || null, taken_at: p.takenAt,
    taken_by: p.takenById || null, taken_by_name: p.takenByName || null,
    latitude: typeof p.latitude === 'number' ? p.latitude : null,
    longitude: typeof p.longitude === 'number' ? p.longitude : null
  };
  // Une nouvelle photo est remise au serveur une seule fois. L'URL
  // authentifiée reçue à l'hydratation n'est jamais renvoyée comme si elle
  // contenait les octets de l'image lors d'une simple modification de légende.
  if (/^data:image\/(?:jpeg|png|webp);base64,/.test(p.imageUrl || '')) {
    row.image_url = p.imageUrl;
  }
  return row;
}
export function rowToProjectPhoto(r: any): ProjectPhoto {
  return {
    id: r.id,
    projectId: r.project_id || '',
    phase: (['before', 'during', 'after'].includes(r.phase) ? r.phase : 'during') as ProjectPhoto['phase'],
    imageUrl: r.image_url || '',
    caption: r.caption || undefined,
    takenAt: r.taken_at || '',
    takenById: r.taken_by || undefined,
    takenByName: r.taken_by_name || undefined,
    latitude: r.latitude ?? undefined,
    longitude: r.longitude ?? undefined
  };
}

export function expenseToRow(e: ExpenseRecord, companyId?: string) {
  return {
    id: e.id, company_id: companyId, provider: e.provider, category: e.category, project_id: e.projectId || null,
    amount: e.amount, tax: e.tax, date: e.date, notes: e.notes,
    photo_url: e.photoUrl || null, submitted_by: e.submittedById || null, submitted_by_name: e.submittedByName || null
  };
}
export function rowToExpense(r: any): ExpenseRecord {
  return {
    id: r.id, provider: r.provider || '', category: r.category, projectId: r.project_id || '', amount: r.amount || 0,
    tax: r.tax || 0, date: r.date || '', notes: r.notes || undefined,
    photoUrl: r.photo_url || undefined, submittedById: r.submitted_by || undefined, submittedByName: r.submitted_by_name || undefined
  };
}

export function payrollPaymentToRow(p: PayrollPayment, companyId?: string) {
  return {
    id: p.id, company_id: companyId, employee_id: p.employeeId, employee_name: p.employeeName,
    project_id: p.projectId || null, period: p.period, amount: p.amount, status: p.status, date: p.date, hours: p.hours,
    worker_type_at_payment: p.workerTypeAtPayment || null
  };
}
export function rowToPayrollPayment(r: any): PayrollPayment {
  return {
    id: r.id, employeeId: r.employee_id, employeeName: r.employee_name || '', projectId: r.project_id || undefined,
    period: r.period || '', amount: r.amount || 0, status: r.status || 'draft', date: r.date || '', hours: r.hours ?? undefined,
    workerTypeAtPayment: r.worker_type_at_payment === 'salaried' || r.worker_type_at_payment === 'contractor'
      ? r.worker_type_at_payment
      : undefined
  };
}

// GCPDocument: 5 tableaux de lignes fusionnés dans document_items via line_type
export function documentLinesToRows(doc: GCPDocument) {
  const rows: Record<string, any>[] = [];
  doc.lineItems.forEach((l, idx) => rows.push({
    id: asUuid(l.id), document_id: doc.id, line_type: 'simple', description: l.description, quantity: l.qty,
    unit: l.unit, unit_price: l.unitPrice, total: l.total, sort_order: idx
  }));
  doc.materialLines.forEach((l, idx) => rows.push({
    id: asUuid(l.id), document_id: doc.id, line_type: 'material', cladding_type: l.claddingType, brand: l.brand,
    thickness: l.thickness, qty_sqft: l.qtySqft, supplier: l.supplier, unit_price: l.unitPrice, total: l.total, sort_order: idx
  }));
  doc.labourLines.forEach((l, idx) => rows.push({
    id: asUuid(l.id), document_id: doc.id, line_type: 'labour', task: l.task, estimated_hours: l.estimatedHours,
    rate: l.rate, is_flat_rate: l.isFlatRate, total: l.total, sort_order: idx
  }));
  doc.otherLines.forEach((l, idx) => rows.push({
    id: asUuid(l.id), document_id: doc.id, line_type: 'other', description: l.description, amount: l.amount, sort_order: idx
  }));
  doc.subcontractLines.forEach((l, idx) => rows.push({
    id: asUuid(l.id), document_id: doc.id, line_type: 'subcontract', company_name: l.companyName, phone: l.phone,
    work_type: l.workType, amount: l.amount, sort_order: idx
  }));
  return rows;
}

export function documentToRow(doc: GCPDocument, companyId?: string) {
  return {
    id: doc.id, company_id: companyId, kind: doc.type, document_number: doc.number, date: doc.date,
    due_date: doc.dueDate, status: doc.status, ref_quote: doc.refQuote, ref_contract: doc.refContract,
    client_id: doc.clientId, client_email: doc.clientEmail, client_phone: doc.clientPhone,
    client_address: doc.clientAddress, site_address: doc.siteAddress, is_simple_layout: doc.isSimpleLayout,
    subtotal: doc.subtotal, discount_pct: doc.discountPct, tax_rate: doc.taxRate, tax_amount: doc.taxAmount,
    total: doc.total, holdback_pct: doc.holdbackPct, holdback_amount: doc.holdbackAmount,
    deposit_amount: doc.depositAmount, balance_due: doc.balanceDue, accepted_payments: doc.acceptedPayments,
    late_interest_pct: doc.lateInterestPct, deposit_pct: doc.depositPct, payment_mid_pct: doc.paymentMidPct,
    payment_final_pct: doc.paymentFinalPct, work_start_date: doc.workStartDate || null, work_end_date: doc.workEndDate || null,
    quote_valid_days: doc.quoteValidDays, permit_by: doc.permitBy, warranty_years: doc.warrantyYears,
    has_insurance: doc.hasInsurance, subcontract_authorized: doc.subcontractAuthorized,
    subcontractor_name: doc.subcontractorName, subcontractor_phone: doc.subcontractorPhone,
    subcontractor_license: doc.subcontractorLicense, contract_object: doc.contractObject,
    clause_change_order: doc.clauseChangeOrder, clause_resiliation: doc.clauseResiliation,
    clause_warranty_details: doc.clauseWarrantyDetails, owner_name: doc.ownerName,
    owner_signature: doc.ownerSignature, client_signature: doc.clientSignature, signed_at: doc.signedAt
  };
}

export function rowToDocument(r: any, items: any[], payments: any[]): GCPDocument {
  const docItems = items.filter(it => it.document_id === r.id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  return {
    id: r.id, type: r.kind, number: r.document_number || '', date: r.date || '', dueDate: r.due_date || '',
    status: r.status || 'draft', refQuote: r.ref_quote || undefined, refContract: r.ref_contract || undefined,
    clientId: r.client_id || '', clientName: r.client_name || '', clientAddress: r.client_address || '',
    clientEmail: r.client_email || '', clientPhone: r.client_phone || '', siteAddress: r.site_address || undefined,
    isSimpleLayout: r.is_simple_layout ?? true,
    lineItems: docItems.filter(l => l.line_type === 'simple').map(l => ({
      id: l.id, description: l.description || '', qty: l.quantity || 0, unit: l.unit || '', unitPrice: l.unit_price || 0, total: l.total || 0
    })),
    materialLines: docItems.filter(l => l.line_type === 'material').map(l => ({
      id: l.id, claddingType: l.cladding_type || '', brand: l.brand || '', thickness: l.thickness || '',
      qtySqft: l.qty_sqft || 0, supplier: l.supplier || '', unitPrice: l.unit_price || 0, total: l.total || 0
    })),
    labourLines: docItems.filter(l => l.line_type === 'labour').map(l => ({
      id: l.id, task: l.task || '', estimatedHours: l.estimated_hours || 0, rate: l.rate || 0,
      isFlatRate: !!l.is_flat_rate, total: l.total || 0
    })),
    otherLines: docItems.filter(l => l.line_type === 'other').map(l => ({ id: l.id, description: l.description || '', amount: l.amount || 0 })),
    subcontractLines: docItems.filter(l => l.line_type === 'subcontract').map(l => ({
      id: l.id, companyName: l.company_name || '', phone: l.phone || '', workType: l.work_type || '', amount: l.amount || 0
    })),
    subtotal: r.subtotal || 0, discountPct: r.discount_pct || 0, taxRate: r.tax_rate || 0, taxAmount: r.tax_amount || 0,
    total: r.total || 0, holdbackPct: r.holdback_pct || 0, holdbackAmount: r.holdback_amount || 0,
    depositAmount: r.deposit_amount || 0, balanceDue: r.balance_due || 0, acceptedPayments: r.accepted_payments || [],
    lateInterestPct: r.late_interest_pct ?? 2, depositPct: r.deposit_pct ?? 25, paymentMidPct: r.payment_mid_pct ?? 25,
    paymentFinalPct: r.payment_final_pct ?? 50, workStartDate: r.work_start_date || undefined, workEndDate: r.work_end_date || undefined,
    quoteValidDays: r.quote_valid_days ?? 30, permitBy: r.permit_by || 'na', warrantyYears: r.warranty_years ?? 2,
    hasInsurance: !!r.has_insurance, subcontractAuthorized: !!r.subcontract_authorized,
    subcontractorName: r.subcontractor_name || undefined, subcontractorPhone: r.subcontractor_phone || undefined,
    subcontractorLicense: r.subcontractor_license || undefined, contractObject: r.contract_object || undefined,
    clauseChangeOrder: r.clause_change_order || undefined, clauseResiliation: r.clause_resiliation || undefined,
    clauseWarrantyDetails: r.clause_warranty_details || undefined, clientSignature: r.client_signature || undefined,
    ownerName: r.owner_name || '', ownerSignature: r.owner_signature || undefined, signedAt: r.signed_at || undefined,
    paymentsHistory: payments.filter(p => p.document_id === r.id).map(p => ({
      id: p.id, date: p.date || '', amount: p.amount || 0, method: p.method || '', notes: p.notes || undefined
    }))
  };
}

export function documentPaymentToRow(p: any, documentId: string) {
  return { id: asUuid(p.id), document_id: documentId, date: p.date, amount: p.amount, method: p.method, notes: p.notes };
}

// ---------------------------------------------------------------------------
// Fonctions de synchronisation "best effort" utilisées par store.ts
// ---------------------------------------------------------------------------

export function syncInsert(table: string, row: Record<string, any>) { if (!demoSandboxIsolation) bestEffort(dbInsert(table, row), `insert ${table}`); }
export function syncUpsert(table: string, row: Record<string, any>) { if (!demoSandboxIsolation) bestEffort(dbUpsert(table, row), `upsert ${table}`); }
export function syncUpdate(table: string, id: string, row: Record<string, any>) { if (!demoSandboxIsolation) bestEffort(dbUpdate(table, id, row), `update ${table}/${id}`); }
export function syncDelete(table: string, id: string) { if (!demoSandboxIsolation) bestEffort(dbDelete(table, id), `delete ${table}/${id}`); }

// Insère d'abord la ligne "documents" (contrainte de clé étrangère de document_items),
// puis synchronise ses lignes — les deux appels best-effort ne doivent pas partir en parallèle.
export async function syncDocumentInsert(doc: GCPDocument) {
  if (demoSandboxIsolation) return;
  return bestEffort(
    dbInsert('documents', documentToRow(doc)).then(() => replaceDocumentLines(doc)),
    `document ${doc.id}`
  );
}

async function replaceDocumentLines(doc: GCPDocument): Promise<void> {
  // Remplace toutes les lignes existantes du document par l'état courant (plus simple et
  // plus sûr qu'un diff fin, car les lignes n'ont pas d'identité stable côté UI).
  const existing = await dbList('document_items');
  const stale = existing.filter((r: any) => r.document_id === doc.id);
  await Promise.all(stale.map((r: any) => dbDelete('document_items', r.id)));
  await Promise.all(documentLinesToRows(doc).map(row => dbInsert('document_items', row)));
}

export function syncDocumentLines(doc: GCPDocument): Promise<void> {
  if (demoSandboxIsolation) return Promise.resolve();
  return bestEffort(replaceDocumentLines(doc), `lignes document ${doc.id}`);
}

export interface CloudHydrateResult {
  enabled: boolean;
  needsAuth?: boolean;
  companyId?: string;
  viewer?: { userId: string; role: string; name?: string };
  tables: Record<string, any[]>;
}

export async function hydrateFromCloud(): Promise<CloudHydrateResult> {
  if (demoSandboxIsolation) return { enabled: false, tables: {} };
  if (!cloudSyncAllowed) return { enabled: false, tables: {} };
  try {
    const res = await apiFetch('/api/hydrate', { headers: authHeaders(), credentials: 'same-origin' });
    if (res.status === 401) {
      setAuthenticatedSession(false);
      cloudEnabled = false;
      return { enabled: false, needsAuth: true, tables: {} };
    }
    if (!res.ok) throw new Error(`hydrate → ${res.status}`);
    const data = await res.json();
    cloudEnabled = !!data.enabled;
    if (!cloudEnabled) return { enabled: false, tables: {} };
    setAuthenticatedSession(true);
    cachedCompanyId = data.companyId || null;
    return { enabled: true, companyId: data.companyId, viewer: data.viewer, tables: data };
  } catch (err: any) {
    console.warn('[cloud-sync] hydrateFromCloud a échoué; les données en mémoire sont conservées :', err.message);
    cloudEnabled = false;
    return { enabled: false, tables: {} };
  }
}
