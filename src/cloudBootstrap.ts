import { LOCAL_TEST_DATA_VERSION, LOCAL_TEST_MODE } from './testProfiles';
import { TEST_DATASET, TEST_DATASET_SUMMARY } from './testDataset';
import { browserStorageValue } from './securityStorage';

const TEST_VERSION_KEY = 'gcp_localTestDataVersion';
const TEST_MODE_KEY = 'gcp_localTestMode';

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
    const candidate = browserStorageValue(key, value, LOCAL_TEST_MODE);
    if (!candidate.allowed) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify(candidate.value));
  } catch {
    // Le stockage local peut être indisponible en navigation privée.
  }
}

function prepareLocalTestEnvironment(): void {
  if (!LOCAL_TEST_MODE) return;

  localStorage.setItem(TEST_MODE_KEY, 'true');
  const alreadyPrepared = localStorage.getItem(TEST_VERSION_KEY) === LOCAL_TEST_DATA_VERSION;
  if (alreadyPrepared) return;

  // Exercice fictif complet du 1er juillet 2025 au 30 juin 2026. Toutes les
  // relations sont locales : employés, projets, heures, paies, documents,
  // dépenses, inventaire et commandes utilisent les mêmes identifiants.
  const dataEntries: Array<[string, unknown]> = [
    ['gcp_employees', TEST_DATASET.employees],
    ['gcp_projects', TEST_DATASET.projects],
    ['gcp_punchSessions', TEST_DATASET.punchSessions],
    ['gcp_invoices', TEST_DATASET.invoices],
    ['gcp_catalogue', TEST_DATASET.catalogue],
    ['gcp_suppliers', TEST_DATASET.suppliers],
    ['gcp_inventory', TEST_DATASET.inventory],
    ['gcp_orders', TEST_DATASET.orders],
    ['gcp_clients', TEST_DATASET.clients],
    ['gcp_hrAlerts', TEST_DATASET.hrAlerts],
    ['gcp_documents', TEST_DATASET.documents],
    ['gcp_expenses', TEST_DATASET.expenses],
    ['gcp_payrollPayments', TEST_DATASET.payrollPayments],
    ['gcp_motivationTeams', TEST_DATASET.motivationTeams],
    ['gcp_motivationGoals', TEST_DATASET.motivationGoals],
    ['gcp_weeklyGoals', TEST_DATASET.weeklyGoals],
    ['gcp_testDatasetSummary', TEST_DATASET_SUMMARY]
  ];
  dataEntries.forEach(([key, value]) => write(key, value));

  write('gcp_activeEmployee', null);
  localStorage.removeItem('gcp_authToken');

  write('gcp_companyInfo', {
    name: 'Hailite Exteriors — Validation annuelle',
    address: 'Calgary, Alberta',
    phone: '403-555-0100',
    email: 'admin.test@hailite.local',
    gstNumber: 'TEST-GST-HX',
    qstNumber: '',
    wcbNumber: 'TEST-WCB-2026',
    bnNumber: 'TEST-BN-2026',
    logo: '',
    interacEmail: 'paiements.test@hailite.local',
    bankDetails: { bank: 'Banque de validation', transit: '00000', institution: '000', account: '0000000' },
    geofencingEnabled: true,
    vacationRate: 6,
    legalMinimumWage: 15,
    voiceReminderVolume: 70,
    voiceReminderSchedule: '07:00, 12:00, 17:00',
    paymentTerms: 'Net 30 — données fictives de validation',
    country: 'CA',
    region: 'AB',
    currency: 'CAD',
    unitSystem: 'imperial',
    dateLocale: 'fr-CA',
    taxRate1: 0.05,
    taxRate2: 0,
    localTaxRate: 0,
    taxRate1Name: 'TPS (5%)',
    taxRate2Name: 'Aucune taxe provinciale',
    dataStorageMode: 'local',
    cloudSyncConsent: false,
    cloudRegion: 'ca-central-1',
    retentionMonths: 84,
    testMode: true,
    isOnboarded: false,
    complianceVersion: ''
  });
  write('gcp_isOnboarded', false);
  localStorage.setItem(TEST_VERSION_KEY, LOCAL_TEST_DATA_VERSION);
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
    currency: company.currency || current.currency || 'CAD',
    unitSystem: company.unitSystem || current.unitSystem || 'imperial',
    dateLocale: company.dateLocale || current.dateLocale || 'fr-CA',
    dataStorageMode: company.dataStorageMode || current.dataStorageMode || 'supabase',
    cloudRegion: company.cloudRegion || current.cloudRegion || 'ca-central-1',
    complianceVersion: company.complianceVersion || current.complianceVersion || '',
    isOnboarded: company.isOnboarded ?? current.isOnboarded ?? false
  };

  write('gcp_companyInfo', next);
  write('gcp_isOnboarded', Boolean(next.isOnboarded));
  document.title = `${next.name} — Hailite Manager`;
}

export async function prepareCloudState(): Promise<void> {
  if (typeof window === 'undefined') return;

  prepareLocalTestEnvironment();
  if (LOCAL_TEST_MODE) {
    const localCompany = readObject('gcp_companyInfo');
    if (localCompany.dataStorageMode === 'local') {
      document.title = `${localCompany.name || 'Hailite Manager'} — Hailite Manager`;
    }
    return;
  }

  try {
    const identityResponse = await fetch('/api/bootstrap', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      credentials: 'same-origin'
    });

    if (identityResponse.ok) {
      const identity = await identityResponse.json();
      if (identity?.enabled === true) applyCompanyIdentity(identity.company);
    }
  } catch {
    const localCompany = readObject('gcp_companyInfo');
    document.title = `${localCompany.name || 'Hailite Manager'} — Hailite Manager`;
  }
}
