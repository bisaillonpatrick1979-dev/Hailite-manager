const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SANITIZER_VERSION_KEY = 'gcp_cloudSanitizerVersion';
const SANITIZER_VERSION = '2';

function readArray(key: string): any[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
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

function keepUuidRows(key: string): void {
  write(key, readArray(key).filter(row => hasUuid(row?.id)));
}

/**
 * Retire les anciennes données de démonstration lorsque le serveur confirme
 * qu'une vraie base cloud et de vrais utilisateurs sont disponibles.
 *
 * Cette étape s'exécute avant l'import du store Zustand. Les valeurs nettoyées
 * deviennent donc l'état initial de l'application, au lieu d'être fusionnées
 * avec les profils emp-1 / projets proj-1 historiques.
 */
export async function prepareCloudState(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const response = await fetch('/api/auth/directory', {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    if (!response.ok) return;

    const payload = await response.json();
    const directory = Array.isArray(payload?.users) ? payload.users : [];
    if (payload?.enabled !== true || directory.length === 0) return;

    const directoryIds = new Set(
      directory.map((user: any) => user?.id).filter(hasUuid)
    );

    // Exécute le nettoyage à chaque nouvelle version du correctif.
    if (localStorage.getItem(SANITIZER_VERSION_KEY) === SANITIZER_VERSION) return;

    const employees = readArray('gcp_employees').filter(employee =>
      hasUuid(employee?.id) && directoryIds.has(employee.id)
    );
    write('gcp_employees', employees);

    const activeEmployee = (() => {
      try { return JSON.parse(localStorage.getItem('gcp_activeEmployee') || 'null'); }
      catch { return null; }
    })();
    if (!activeEmployee || !hasUuid(activeEmployee.id) || !directoryIds.has(activeEmployee.id)) {
      write('gcp_activeEmployee', null);
      localStorage.removeItem('gcp_authToken');
    }

    // Toutes ces tables utilisent maintenant des UUID côté Supabase.
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
    // Le mode hors ligne doit continuer à fonctionner sans interrompre l'app.
  }
}
