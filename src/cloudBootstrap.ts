const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SANITIZER_VERSION_KEY = 'gcp_cloudSanitizerVersion';
const SANITIZER_VERSION = '3';

function readArray(key: string): any[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function readObject(key: string): Record<string, any> {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Le stockage local peut être indisponible en navigation privée.
  }
}

const hasUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_RE.test(value);

const normalizeRole = (role: unknown) => {
  const value = String(role || '').toLowerCase();
  if (value === 'owner') return 'admin';
  if (value === 'subcontractor') return 'employee';
  if (['admin', 'employee', 'secretary', 'accountant'].includes(value)) return value;
  return 'employee';
};

function keepUuidRows(key: string): void {
  write(key, readArray(key).filter(row => hasUuid(row?.id)));
}

function applyCompanyIdentity(company: any): void {
  if (!company || typeof company !== 'object') return;

  const current = readObject('gcp_companyInfo');
  const next = {
    ...current,
    name: company.name || current.name || 'Hailite Manager',
    logo: company.logo || current.logo || '',
    country: company.country || current.country || 'CA',
    region: company.region || current.region || '',
    taxRate1: Number(company.taxRate1 ?? current.taxRate1 ?? 0),
    taxRate2: Number(company.taxRate2 ?? current.taxRate2 ?? 0),
    taxRate1Name: company.taxRate1Name || current.taxRate1Name || '',
    taxRate2Name: company.taxRate2Name || current.taxRate2Name || '',
    isOnboarded: company.isOnboarded ?? current.isOnboarded ?? false
  };

  write('gcp_companyInfo', next);
  write('gcp_isOnboarded', Boolean(next.isOnboarded));
  document.title = `${next.name} — Hailite Manager`;
}

export async function prepareCloudState(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const [identityResponse, directoryResponse] = await Promise.all([
      fetch('/api/bootstrap', { headers: { Accept: 'application/json' }, cache: 'no-store' }),
      fetch('/api/auth/directory', { headers: { Accept: 'application/json' }, cache: 'no-store' })
    ]);

    if (identityResponse.ok) {
      const identity = await identityResponse.json();
      if (identity?.enabled === true) applyCompanyIdentity(identity.company);
    }

    if (!directoryResponse.ok) return;
    const payload = await directoryResponse.json();
    const directory = Array.isArray(payload?.users) ? payload.users : [];
    if (payload?.enabled !== true || directory.length === 0) return;

    const validDirectory = directory.filter((user: any) => hasUuid(user?.id));
    const directoryIds = new Set(validDirectory.map((user: any) => user.id));

    const existingEmployees = readArray('gcp_employees');
    write('gcp_employees', validDirectory.map((user: any) => {
      const existing = existingEmployees.find(employee => employee?.id === user.id) || {};
      return {
        ...existing,
        id: user.id,
        name: user.name || existing.name || '',
        nip: existing.nip || '',
        role: normalizeRole(user.role),
        hourlyRate: Number(existing.hourlyRate || 0),
        workerType: user.workerType || existing.workerType || '',
        asNumber: existing.asNumber || '',
        phone: existing.phone || '',
        address: existing.address || '',
        hireDate: existing.hireDate || '',
        avatar: user.avatar || existing.avatar || '',
        level: Number(existing.level || 1),
        xp: Number(existing.xp || 0)
      };
    }));

    const activeEmployee = (() => {
      try { return JSON.parse(localStorage.getItem('gcp_activeEmployee') || 'null'); }
      catch { return null; }
    })();
    if (!activeEmployee || !hasUuid(activeEmployee.id) || !directoryIds.has(activeEmployee.id)) {
      write('gcp_activeEmployee', null);
      localStorage.removeItem('gcp_authToken');
    }

    if (localStorage.getItem(SANITIZER_VERSION_KEY) === SANITIZER_VERSION) return;

    [
      'gcp_projects',
      'gcp_punchSessions',
      'gcp_invoices',
      'gcp_catalogue',
      'gcp_suppliers',
      'gcp_inventory',
      'gcp_orders',
      'gcp_clients',
      'gcp_hrAlerts',
      'gcp_documents',
      'gcp_expenses',
      'gcp_payrollPayments',
      'gcp_motivationTeams',
      'gcp_motivationGoals'
    ].forEach(keepUuidRows);

    write(
      'gcp_weeklyGoals',
      readArray('gcp_weeklyGoals').filter(goal => hasUuid(goal?.employeeId))
    );

    localStorage.setItem(SANITIZER_VERSION_KEY, SANITIZER_VERSION);
  } catch {
    // Le mode hors ligne continue de fonctionner sans interrompre l'application.
  }
}
