from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: ancre trouvée {count} fois')
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------------
# TYPES
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'types.ts'
text = path.read_text(encoding='utf-8')

if 'businessLogo?: string;' not in text:
    text = replace_once(
        text,
        '  credentials?: EmployeeCredential[];\n',
        "  credentials?: EmployeeCredential[];\n  businessLogo?: string;\n  privacyNoticeVersion?: string;\n  privacyNoticeAcknowledgedAt?: string;\n  locationNoticeAcknowledgedAt?: string;\n",
        'employee privacy fields'
    )

if 'currency?: string;' not in text[text.find('export interface Invoice'):text.find('export interface Supplier')]:
    text = replace_once(
        text,
        '  employeeSignedAt?: string;\n',
        "  employeeSignedAt?: string;\n  currency?: string;\n  taxRate1?: number;\n  taxRate2?: number;\n  localTaxRate?: number;\n  localTaxAmount?: number;\n  taxRate1Name?: string;\n  taxRate2Name?: string;\n  issuerName?: string;\n  issuerAddress?: string;\n  issuerTaxNumber?: string;\n  issuerLogo?: string;\n  recipientName?: string;\n",
        'invoice international fields'
    )

text = text.replace("  country?: 'CA' | 'US';", "  country?: 'CA' | 'US' | 'EU';")

if 'dataStorageMode?:' not in text:
    text = replace_once(
        text,
        "  paymentFinalPct?: number;\n\n  // Assistant IA\n",
        "  paymentFinalPct?: number;\n\n  // Internationalisation, fiscalité et confidentialité\n  currency?: string;\n  unitSystem?: 'imperial' | 'metric';\n  dateLocale?: string;\n  localTaxRate?: number;\n  taxConfirmedAt?: string;\n  taxDisclaimerAcceptedAt?: string;\n  dataStorageMode?: 'local' | 'hybrid' | 'cloud';\n  cloudSyncConsent?: boolean;\n  cloudRegion?: string;\n  privacyPolicyVersion?: string;\n  privacyPolicyAcceptedAt?: string;\n  privacyContactEmail?: string;\n  privacyOfficerName?: string;\n  retentionMonths?: number;\n  employeeDataBasisConfirmed?: boolean;\n  locationDataNoticeConfirmed?: boolean;\n  crossBorderTransferAcknowledgedAt?: string;\n  processorTermsAcceptedAt?: string;\n  complianceVersion?: string;\n\n  // Assistant IA\n",
        'company compliance fields'
    )
path.write_text(text, encoding='utf-8')

# ---------------------------------------------------------------------------
# REGIONS
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'regionsData.ts'
text = path.read_text(encoding='utf-8')
if 'currency?: string;' not in text[:text.find('export interface RegionPayrollMeta')]:
    text = replace_once(
        text,
        '  taxRate2NameEN: string;\n',
        "  taxRate2NameEN: string;\n  currency?: string;\n  locale?: string;\n",
        'TaxRegion optional international metadata'
    )
text = text.replace("country: 'CA' | 'US'", "country: 'CA' | 'US' | 'EU'")
if "if (country === 'EU')" not in text:
    eu_branch = """  if (country === 'EU') {
    return {
      pensionNameFR: 'Régime national — à configurer',
      pensionNameEN: 'National pension — configure locally',
      pensionRate: 0,
      secondaryDeductionNameFR: 'Cotisations locales — à configurer',
      secondaryDeductionNameEN: 'Local contributions — configure locally',
      secondaryDeductionRate: 0,
      workersCompNameFR: `Assurance accidents du travail (${region.nameFR})`,
      workersCompNameEN: `Workers' compensation (${region.nameEN})`,
      hasConstructionUnionCert: false,
      breakRuleFR: `Les règles de pauses et de temps de travail de ${region.nameFR} doivent être validées localement.`,
      breakRuleEN: `Working-time and break rules for ${region.nameEN} must be validated locally.`,
      businessNumberLabelFR: "Numéro d'entreprise / TVA",
      businessNumberLabelEN: 'Business / VAT number',
    };
  }

"""
    text = replace_once(text, "export function getRegionPayrollMeta(region: TaxRegion, country: 'CA' | 'US' | 'EU'): RegionPayrollMeta {\n", "export function getRegionPayrollMeta(region: TaxRegion, country: 'CA' | 'US' | 'EU'): RegionPayrollMeta {\n" + eu_branch, 'EU payroll branch')

# Nova Scotia HST decreased to 14% on 2025-04-01.
text = re.sub(
    r"\{ code: 'NS', nameFR: 'Nouvelle-Écosse', nameEN: 'Nova Scotia', taxRate1: 0\.15, taxRate2: 0, taxRate1NameFR: 'TVH \(15%\)', taxRate1NameEN: 'HST \(15%\)'",
    "{ code: 'NS', nameFR: 'Nouvelle-Écosse', nameEN: 'Nova Scotia', taxRate1: 0.14, taxRate2: 0, taxRate1NameFR: 'TVH (14%)', taxRate1NameEN: 'HST (14%)'",
    text
)
path.write_text(text, encoding='utf-8')

# ---------------------------------------------------------------------------
# API CLIENT / CLOUD CONTROL / MAPPERS
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'apiClient.ts'
text = path.read_text(encoding='utf-8')

if 'cloudSyncAllowed' not in text:
    text = replace_once(
        text,
        'let cloudEnabled = false;\nexport function isCloudEnabled() { return cloudEnabled; }\n',
        "let cloudEnabled = false;\nlet cloudSyncAllowed = (() => {\n  try {\n    const company = JSON.parse(localStorage.getItem('gcp_companyInfo') || '{}');\n    return company?.dataStorageMode !== 'local';\n  } catch { return true; }\n})();\nexport function isCloudEnabled() { return cloudEnabled && cloudSyncAllowed; }\nexport function setCloudSyncAllowed(allowed: boolean) {\n  cloudSyncAllowed = allowed;\n  if (!allowed) cloudEnabled = false;\n}\nexport function isCloudSyncAllowed() { return cloudSyncAllowed; }\n",
        'cloud sync preference'
    )

text = replace_once(
    text,
    "export async function authLogin(employeeId: string, nip: string):\n  Promise<{ status: AuthLoginStatus; user?: { id: string; name: string; role: string } }> {\n  try {\n",
    "export async function authLogin(employeeId: string, nip: string):\n  Promise<{ status: AuthLoginStatus; user?: { id: string; name: string; role: string } }> {\n  if (!cloudSyncAllowed) return { status: 'unavailable' };\n  try {\n",
    'auth local-only guard'
)
text = replace_once(
    text,
    'export async function fetchLoginDirectory(): Promise<DirectoryUser[]> {\n  try {\n',
    "export async function fetchLoginDirectory(): Promise<DirectoryUser[]> {\n  if (!cloudSyncAllowed) return [];\n  try {\n",
    'directory local-only guard'
)

for signature in [
    "async function dbList(table: string): Promise<any[]> {\n",
    "async function dbInsert(table: string, row: Record<string, any>): Promise<any> {\n",
    "async function dbUpsert(table: string, row: Record<string, any>): Promise<any> {\n",
    "async function dbUpdate(table: string, id: string, row: Record<string, any>): Promise<any> {\n",
    "async function dbDelete(table: string, id: string): Promise<void> {\n",
]:
    if signature + "  if (!cloudSyncAllowed)" not in text:
        text = text.replace(signature, signature + "  if (!cloudSyncAllowed) throw new Error('Cloud sync disabled by company settings');\n", 1)

if 'business_logo: e.businessLogo' not in text:
    text = replace_once(
        text,
        '    credentials: e.credentials || []\n',
        "    credentials: e.credentials || [], business_logo: e.businessLogo,\n    privacy_notice_version: e.privacyNoticeVersion, privacy_notice_acknowledged_at: e.privacyNoticeAcknowledgedAt || null,\n    location_notice_acknowledged_at: e.locationNoticeAcknowledgedAt || null\n",
        'employee mapper compliance'
    )
if 'businessLogo: r.business_logo' not in text:
    text = replace_once(
        text,
        '    credentials: Array.isArray(r.credentials) ? r.credentials : []\n',
        "    credentials: Array.isArray(r.credentials) ? r.credentials : [], businessLogo: r.business_logo || undefined,\n    privacyNoticeVersion: r.privacy_notice_version || undefined,\n    privacyNoticeAcknowledgedAt: r.privacy_notice_acknowledged_at || undefined,\n    locationNoticeAcknowledgedAt: r.location_notice_acknowledged_at || undefined\n",
        'row employee compliance'
    )

if 'currency: i.currency' not in text:
    text = replace_once(
        text,
        '    employee_signed_at: i.employeeSignedAt\n',
        "    employee_signed_at: i.employeeSignedAt, currency: i.currency, tax_rate1: i.taxRate1, tax_rate2: i.taxRate2,\n    local_tax_rate: i.localTaxRate, local_tax_amount: i.localTaxAmount, tax_rate1_name: i.taxRate1Name,\n    tax_rate2_name: i.taxRate2Name, issuer_name: i.issuerName, issuer_address: i.issuerAddress,\n    issuer_tax_number: i.issuerTaxNumber, issuer_logo: i.issuerLogo, recipient_name: i.recipientName\n",
        'invoice mapper international'
    )
if 'currency: r.currency' not in text:
    text = replace_once(
        text,
        '    employeeSignature: r.employee_signature || undefined, employeeSignedAt: r.employee_signed_at || undefined\n',
        "    employeeSignature: r.employee_signature || undefined, employeeSignedAt: r.employee_signed_at || undefined,\n    currency: r.currency || undefined, taxRate1: r.tax_rate1 ?? undefined, taxRate2: r.tax_rate2 ?? undefined,\n    localTaxRate: r.local_tax_rate ?? undefined, localTaxAmount: r.local_tax_amount ?? undefined,\n    taxRate1Name: r.tax_rate1_name || undefined, taxRate2Name: r.tax_rate2_name || undefined,\n    issuerName: r.issuer_name || undefined, issuerAddress: r.issuer_address || undefined,\n    issuerTaxNumber: r.issuer_tax_number || undefined, issuerLogo: r.issuer_logo || undefined,\n    recipientName: r.recipient_name || undefined\n",
        'row invoice international'
    )

if 'data_storage_mode: c.dataStorageMode' not in text:
    text = replace_once(
        text,
        '    payment_mid_pct: c.paymentMidPct, payment_final_pct: c.paymentFinalPct, ai_provider: c.aiProvider\n',
        "    payment_mid_pct: c.paymentMidPct, payment_final_pct: c.paymentFinalPct, ai_provider: c.aiProvider,\n    currency: c.currency, unit_system: c.unitSystem, date_locale: c.dateLocale, local_tax_rate: c.localTaxRate,\n    tax_confirmed_at: c.taxConfirmedAt || null, tax_disclaimer_accepted_at: c.taxDisclaimerAcceptedAt || null,\n    data_storage_mode: c.dataStorageMode, cloud_sync_consent: c.cloudSyncConsent, cloud_region: c.cloudRegion,\n    privacy_policy_version: c.privacyPolicyVersion, privacy_policy_accepted_at: c.privacyPolicyAcceptedAt || null,\n    privacy_contact_email: c.privacyContactEmail, privacy_officer_name: c.privacyOfficerName,\n    retention_months: c.retentionMonths, employee_data_basis_confirmed: c.employeeDataBasisConfirmed,\n    location_data_notice_confirmed: c.locationDataNoticeConfirmed,\n    cross_border_transfer_acknowledged_at: c.crossBorderTransferAcknowledgedAt || null,\n    processor_terms_accepted_at: c.processorTermsAcceptedAt || null, compliance_version: c.complianceVersion\n",
        'company mapper compliance'
    )
if 'dataStorageMode: r.data_storage_mode' not in text:
    text = replace_once(
        text,
        '    aiProvider: r.ai_provider || undefined\n',
        "    aiProvider: r.ai_provider || undefined, currency: r.currency || undefined, unitSystem: r.unit_system || undefined,\n    dateLocale: r.date_locale || undefined, localTaxRate: r.local_tax_rate ?? undefined,\n    taxConfirmedAt: r.tax_confirmed_at || undefined, taxDisclaimerAcceptedAt: r.tax_disclaimer_accepted_at || undefined,\n    dataStorageMode: r.data_storage_mode || undefined, cloudSyncConsent: r.cloud_sync_consent ?? undefined,\n    cloudRegion: r.cloud_region || undefined, privacyPolicyVersion: r.privacy_policy_version || undefined,\n    privacyPolicyAcceptedAt: r.privacy_policy_accepted_at || undefined, privacyContactEmail: r.privacy_contact_email || undefined,\n    privacyOfficerName: r.privacy_officer_name || undefined, retentionMonths: r.retention_months ?? undefined,\n    employeeDataBasisConfirmed: r.employee_data_basis_confirmed ?? undefined,\n    locationDataNoticeConfirmed: r.location_data_notice_confirmed ?? undefined,\n    crossBorderTransferAcknowledgedAt: r.cross_border_transfer_acknowledged_at || undefined,\n    processorTermsAcceptedAt: r.processor_terms_accepted_at || undefined, complianceVersion: r.compliance_version || undefined\n",
        'row company compliance'
    )

text = replace_once(
    text,
    'export async function hydrateFromCloud(): Promise<CloudHydrateResult> {\n  try {\n',
    "export async function hydrateFromCloud(): Promise<CloudHydrateResult> {\n  if (!cloudSyncAllowed) return { enabled: false, tables: {} };\n  try {\n",
    'hydrate local-only guard'
)
path.write_text(text, encoding='utf-8')

# ---------------------------------------------------------------------------
# CLOUD BOOTSTRAP / PUBLIC IDENTITY
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'cloudBootstrap.ts'
text = path.read_text(encoding='utf-8')
if "dataStorageMode: company.dataStorageMode" not in text:
    text = replace_once(
        text,
        '    taxRate2Name: company.taxRate2Name || current.taxRate2Name || \'\',\n    isOnboarded: company.isOnboarded ?? current.isOnboarded ?? false\n',
        "    taxRate2Name: company.taxRate2Name || current.taxRate2Name || '',\n    currency: company.currency || current.currency || 'CAD',\n    unitSystem: company.unitSystem || current.unitSystem || 'imperial',\n    dateLocale: company.dateLocale || current.dateLocale || 'fr-CA',\n    dataStorageMode: company.dataStorageMode || current.dataStorageMode || 'hybrid',\n    cloudRegion: company.cloudRegion || current.cloudRegion || 'ca-central-1',\n    complianceVersion: company.complianceVersion || current.complianceVersion || '',\n    isOnboarded: company.isOnboarded ?? current.isOnboarded ?? false\n",
        'bootstrap company compliance identity'
    )
if 'localCompany.dataStorageMode === \'local\'' not in text:
    text = replace_once(
        text,
        "export async function prepareCloudState(): Promise<void> {\n  if (typeof window === 'undefined') return;\n\n  try {\n",
        "export async function prepareCloudState(): Promise<void> {\n  if (typeof window === 'undefined') return;\n\n  const localCompany = readObject('gcp_companyInfo');\n  if (localCompany.dataStorageMode === 'local') {\n    document.title = `${localCompany.name || 'Hailite Manager'} — Hailite Manager`;\n    return;\n  }\n\n  try {\n",
        'cloud bootstrap local mode'
    )
path.write_text(text, encoding='utf-8')

path = ROOT / 'bootstrapRoutes.ts'
text = path.read_text(encoding='utf-8')
if 'compliance_version?:' not in text:
    text = replace_once(
        text,
        '  tax_rate2_name?: string | null;\n',
        "  tax_rate2_name?: string | null;\n  currency?: string | null;\n  unit_system?: string | null;\n  date_locale?: string | null;\n  data_storage_mode?: string | null;\n  cloud_region?: string | null;\n  compliance_version?: string | null;\n",
        'bootstrap interface fields'
    )
    text = text.replace(
        ".select('name,logo,country,region,is_onboarded,tax_rate1,tax_rate2,tax_rate1_name,tax_rate2_name')",
        ".select('name,logo,country,region,is_onboarded,tax_rate1,tax_rate2,tax_rate1_name,tax_rate2_name,currency,unit_system,date_locale,data_storage_mode,cloud_region,compliance_version')"
    )
    text = replace_once(
        text,
        "              taxRate2Name: company.tax_rate2_name || ''\n",
        "              taxRate2Name: company.tax_rate2_name || '',\n              currency: company.currency || 'CAD',\n              unitSystem: company.unit_system || 'imperial',\n              dateLocale: company.date_locale || 'fr-CA',\n              dataStorageMode: company.data_storage_mode || 'hybrid',\n              cloudRegion: company.cloud_region || 'ca-central-1',\n              complianceVersion: company.compliance_version || ''\n",
        'bootstrap response fields'
    )
path.write_text(text, encoding='utf-8')

# ---------------------------------------------------------------------------
# STORE / AUTOMATED SUBCONTRACTOR INVOICES
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'store.ts'
text = path.read_text(encoding='utf-8')
if 'setCloudSyncAllowed,' not in text[:1000]:
    text = text.replace('authLogin, setAuthToken, getAuthToken, fetchLoginDirectory, isUuid, normalizeAppRole,', 'authLogin, setAuthToken, getAuthToken, fetchLoginDirectory, isUuid, normalizeAppRole, setCloudSyncAllowed,')

if "currency: 'CAD'" not in text[text.find('const initialCompanyInfo'):text.find('const initialHRAlerts')]:
    text = replace_once(
        text,
        "  paymentTerms: 'Paiement net 30 jours'\n",
        "  paymentTerms: 'Paiement net 30 jours',\n  country: 'CA', region: 'AB', currency: 'CAD', unitSystem: 'imperial', dateLocale: 'fr-CA',\n  taxRate1: 0.05, taxRate2: 0, localTaxRate: 0, taxRate1Name: 'TPS (5%)', taxRate2Name: 'Taxe provinciale',\n  dataStorageMode: 'hybrid', cloudSyncConsent: true, cloudRegion: 'ca-central-1', retentionMonths: 84\n",
        'initial international company defaults'
    )

if 'setCloudSyncAllowed(updated.dataStorageMode' not in text:
    text = replace_once(
        text,
        '    saveState(\'gcp_companyInfo\', updated);\n    const companyId = getCompanyId();\n',
        "    saveState('gcp_companyInfo', updated);\n    setCloudSyncAllowed(updated.dataStorageMode !== 'local');\n    const companyId = getCompanyId();\n",
        'update company cloud preference'
    )

# Tax + branding snapshot for subcontractor invoices.
old_tax = """    const gstRate = comp.taxRate1 !== undefined ? comp.taxRate1 : 0.05;
    const qstRate = comp.taxRate2 !== undefined ? comp.taxRate2 : 0.09975;
    
    const gstAmount = Number((amount * gstRate).toFixed(2));
    const qstAmount = Number((amount * qstRate).toFixed(2));
    const totalWithTaxes = Number((amount + gstAmount + qstAmount).toFixed(2));
"""
new_tax = """    const gstRate = comp.taxRate1 !== undefined ? comp.taxRate1 : 0;
    const qstRate = comp.taxRate2 !== undefined ? comp.taxRate2 : 0;
    const localRate = comp.localTaxRate !== undefined ? comp.localTaxRate : 0;
    
    const gstAmount = Number((amount * gstRate).toFixed(2));
    const qstAmount = Number((amount * qstRate).toFixed(2));
    const localTaxAmount = Number((amount * localRate).toFixed(2));
    const totalWithTaxes = Number((amount + gstAmount + qstAmount + localTaxAmount).toFixed(2));
"""
if old_tax in text:
    text = text.replace(old_tax, new_tax, 1)

if 'issuerName: emp.businessName' not in text:
    text = replace_once(
        text,
        "      employeeSignedAt: undefined\n" if "      employeeSignedAt: undefined\n" in text[text.find('const newInvoice: Invoice'):text.find('const updated = [newInvoice') ] else "      notes: `Facture brouillon auto-générée le ${new Date().toLocaleDateString('fr-CA')}.`\n",
        "      notes: `Facture brouillon auto-générée le ${new Date().toLocaleDateString('fr-CA')}.`,\n      currency: comp.currency || (comp.country === 'US' ? 'USD' : 'CAD'),\n      taxRate1: gstRate, taxRate2: qstRate, localTaxRate: localRate, localTaxAmount,\n      taxRate1Name: comp.taxRate1Name || 'Tax 1', taxRate2Name: comp.taxRate2Name || 'Tax 2',\n      issuerName: emp.businessName || emp.name, issuerAddress: emp.address,\n      issuerTaxNumber: emp.gstNumber || emp.asNumber, issuerLogo: emp.businessLogo || emp.avatar,\n      recipientName: comp.name\n",
        'invoice branding snapshot'
    )
path.write_text(text, encoding='utf-8')

# ---------------------------------------------------------------------------
# APP
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'App.tsx'
text = path.read_text(encoding='utf-8')
text = text.replace("import { authHeaders } from './apiClient';", "import { authHeaders, setCloudSyncAllowed } from './apiClient';")
if "from './internationalRegions'" not in text:
    text = text.replace(
        "} from './regionsData';\n",
        "} from './regionsData';\nimport { getDefaultRegion, getJurisdictionDefaults, getRegionsForMarket, marketLabel, type MarketCode } from './internationalRegions';\n"
    )
if "import CompanyLogo from './components/CompanyLogo';" not in text:
    text = text.replace("import EmployeeAvatar from './components/EmployeeAvatar';", "import EmployeeAvatar from './components/EmployeeAvatar';\nimport CompanyLogo from './components/CompanyLogo';")

lazy_anchor = "const EmployeeCredentialsManager = lazy(() => import('./components/EmployeeCredentialsManager'));\n"
if 'const UserPrivacyNotice = lazy' not in text:
    text = text.replace(lazy_anchor, lazy_anchor + "const UserPrivacyNotice = lazy(() => import('./components/UserPrivacyNotice'));\nconst BusinessLogoField = lazy(() => import('./components/BusinessLogoField'));\nconst SubcontractorInvoicePreview = lazy(() => import('./components/SubcontractorInvoicePreview'));\nconst CompanyComplianceSettings = lazy(() => import('./components/CompanyComplianceSettings'));\n")

old_region_fn = """function getCompanyRegion(companyInfo: CompanyInfo): { country: 'CA' | 'US'; region: TaxRegion } {
  const country = companyInfo.country || 'CA';
  const list = country === 'US' ? US_REGIONS : CANADIAN_REGIONS;
  const region = list.find(r => r.code === companyInfo.region) || list[0];
  return { country, region };
}
"""
new_region_fn = """function getCompanyRegion(companyInfo: CompanyInfo): { country: MarketCode; region: TaxRegion } {
  const country: MarketCode = companyInfo.country === 'US' || companyInfo.country === 'EU' ? companyInfo.country : 'CA';
  return { country, region: getDefaultRegion(country, companyInfo.region) };
}
"""
if old_region_fn in text:
    text = text.replace(old_region_fn, new_region_fn, 1)

text = text.replace('    hydrateCloud\n  } = useAppStore();', '    hydrateCloud, setIsOnboarded\n  } = useAppStore();')

old_effect = """  const [cloudSyncing, setCloudSyncing] = useState(true);
  useEffect(() => {
    hydrateCloud().finally(() => setCloudSyncing(false));

    const interval = setInterval(() => { hydrateCloud(); }, 45000);
    const onFocus = () => hydrateCloud();
    const onVisibility = () => { if (!document.hidden) hydrateCloud(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
"""
new_effect = """  const [cloudSyncing, setCloudSyncing] = useState(true);
  useEffect(() => {
    const cloudAllowed = companyInfo.dataStorageMode !== 'local';
    setCloudSyncAllowed(cloudAllowed);
    if (!cloudAllowed) {
      setCloudSyncing(false);
      return;
    }

    hydrateCloud().finally(() => setCloudSyncing(false));
    const interval = setInterval(() => { hydrateCloud(); }, 45000);
    const onFocus = () => hydrateCloud();
    const onVisibility = () => { if (!document.hidden) hydrateCloud(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [companyInfo.dataStorageMode]);
"""
if old_effect in text:
    text = text.replace(old_effect, new_effect, 1)

text = text.replace("  const dateLocale = currentLanguage === 'FR' ? 'fr-CA' : 'en-CA';", "  const dateLocale = companyInfo.dateLocale || (currentLanguage === 'FR' ? 'fr-CA' : 'en-CA');\n  const currency = companyInfo.currency || (companyInfo.country === 'US' ? 'USD' : companyInfo.country === 'EU' ? 'EUR' : 'CAD');\n  const money = (value: number) => new Intl.NumberFormat(dateLocale, { style: 'currency', currency }).format(Number(value || 0));")

text = text.replace("  if (!isOnboarded) {", "  if (!isOnboarded || companyInfo.complianceVersion !== '2026.07') {")
text = text.replace("companyCountry === 'US' ? 0 :", "companyCountry !== 'CA' ? 0 :")
text = text.replace("if (companyCountry === 'US') {\n      return 0;", "if (companyCountry !== 'CA') {\n      return 0;")
text = text.replace("`${regionName} (${companyCountry === 'US' ? (currentLanguage === 'FR' ? 'États-Unis' : 'United States') : 'Canada'})`", "`${regionName} (${marketLabel(companyCountry, currentLanguage)})`")

# Invoice preview state.
if 'const [invoicePreview, setInvoicePreview]' not in text:
    text = replace_once(
        text,
        '  const [invoiceSignatureData, setInvoiceSignatureData] = useState<string | null>(null);\n',
        "  const [invoiceSignatureData, setInvoiceSignatureData] = useState<string | null>(null);\n  const [invoicePreview, setInvoicePreview] = useState<Invoice | null>(null);\n",
        'invoice preview state'
    )

# New employee business logo state.
if 'businessLogo: string;' not in text:
    text = replace_once(text, '    businessName: string;\n', '    businessName: string;\n    businessLogo: string;\n', 'new employee business logo type')
    text = replace_once(text, "    businessName: '',\n    gstNumber", "    businessName: '',\n    businessLogo: '',\n    gstNumber", 'new employee logo initial')
if 'businessLogo: emp.businessLogo ||' not in text:
    text = replace_once(text, "                                businessName: emp.businessName || '',\n", "                                businessName: emp.businessName || '',\n                                businessLogo: emp.businessLogo || '',\n", 'edit logo initial')
if 'businessLogo: editEmployeeForm.businessLogo' not in text:
    text = replace_once(text, '                                              businessName: editEmployeeForm.businessName,\n', '                                              businessName: editEmployeeForm.businessName,\n                                              businessLogo: editEmployeeForm.businessLogo,\n', 'edit logo save')
if 'businessLogo: newEmployeeForm.businessLogo' not in text:
    text = replace_once(text, '                                businessName: newEmployeeForm.businessName,\n', '                                businessName: newEmployeeForm.businessName,\n                                businessLogo: newEmployeeForm.businessLogo,\n', 'new employee logo save')
if "businessLogo: '',\n                                gstNumber" not in text:
    text = replace_once(text, "                                businessName: '',\n                                gstNumber", "                                businessName: '',\n                                businessLogo: '',\n                                gstNumber", 'new employee logo reset')

# Privacy notice overlay.
root_anchor = "      {cloudSyncing && (\n"
if 'privacyNoticeVersion !== \'2026.07\'' not in text:
    privacy = """      {activeEmployee && activeEmployee.privacyNoticeVersion !== '2026.07' && (
        <Suspense fallback={<LazySectionFallback />}>
          <UserPrivacyNotice
            employee={activeEmployee}
            companyInfo={companyInfo}
            currentLanguage={currentLanguage}
            onAccept={updateEmployee}
          />
        </Suspense>
      )}
"""
    text = replace_once(text, root_anchor, privacy + root_anchor, 'privacy notice overlay')

# Navbar logo.
old_logo = """          <div className="w-9 h-9 bg-orange-600 rounded flex items-center justify-center font-bold text-white shadow-md">
            HX
          </div>
"""
new_logo = """          <CompanyLogo
            logo={companyInfo.logo}
            companyName={companyInfo.name}
            className="w-10 h-10 rounded-xl border border-gray-700 bg-white p-1 shadow-md"
            imageClassName="w-full h-full object-contain rounded-lg"
            fallbackClassName="rounded-xl bg-orange-600 text-white text-sm"
          />
"""
if old_logo in text:
    text = text.replace(old_logo, new_logo, 1)

# Settings: replace old CA/US-only selector with international compliance summary.
start_marker = '                        {/* Pays / Province ou État — pilote tous les libellés et calculs de paie de l\'application */}'
end_marker = '\n\n                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">'
start = text.find(start_marker)
end = text.find(end_marker, start)
if start != -1 and end != -1 and '<CompanyComplianceSettings' not in text[start:end]:
    replacement = """                        <Suspense fallback={<LazySectionFallback />}>
                          <CompanyComplianceSettings />
                        </Suspense>"""
    text = text[:start] + replacement + text[end:]

# Remove obsolete text-only company logo field (upload lives in compliance panel).
text = re.sub(r'\n\s*<div>\n\s*<label className="text-\[10px\] text-gray-500 uppercase font-mono">\{t\.logoLabel\}</label>\n\s*<input[\s\S]*?onChange=\{\(e\) => updateCompanyInfo\(\{ logo: e\.target\.value \}\)\}\n\s*/>\n\s*</div>\n', '\n', text, count=1)

# International employee region lists.
text = text.replace("employeeProvince: emp.employeeProvince || 'QC'", "employeeProvince: emp.employeeProvince || companyRegion.code")
text = text.replace("employeeProvince: 'QC'", "employeeProvince: companyInfo.region || 'AB'")
text = text.replace("                                employeeProvince: 'QC',", "                                employeeProvince: companyRegion.code,")
options_pattern = re.compile(r"\s*<option value=\"QC\">\{t\.provQuebec\}</option>\n\s*<option value=\"AB\">\{t\.provAlberta\}</option>\n\s*<option value=\"ON\">\{t\.provOntario\}</option>\n\s*<option value=\"BC\">\{t\.provBC\}</option>")
text = options_pattern.sub("\n                                      {getRegionsForMarket(companyCountry).map(region => (\n                                        <option key={region.code} value={region.code}>{currentLanguage === 'FR' ? region.nameFR : region.nameEN}</option>\n                                      ))}", text)

# Contractor business logo fields before avatar blocks.
edit_avatar_anchor = '                                    {/* Avatar Custom Photo selection inside edit form */}'
if 'business-logo-edit-' not in text:
    edit_logo = """                                    {editEmployeeForm.workerType === 'contractor' && (
                                      <Suspense fallback={<LazySectionFallback />}>
                                        <BusinessLogoField
                                          value={editEmployeeForm.businessLogo || ''}
                                          onChange={(businessLogo) => setEditEmployeeForm({ ...editEmployeeForm, businessLogo })}
                                          businessName={editEmployeeForm.businessName || editEmployeeForm.name}
                                          currentLanguage={currentLanguage}
                                          inputId={`business-logo-edit-${emp.id}`}
                                        />
                                      </Suspense>
                                    )}

"""
    text = replace_once(text, edit_avatar_anchor, edit_logo + edit_avatar_anchor, 'edit subcontractor logo')
new_avatar_anchor = '                          {/* Avatar Selection Row */}'
if 'business-logo-new' not in text:
    new_logo_block = """                          {newEmployeeForm.workerType === 'contractor' && (
                            <Suspense fallback={<LazySectionFallback />}>
                              <BusinessLogoField
                                value={newEmployeeForm.businessLogo}
                                onChange={(businessLogo) => setNewEmployeeForm({ ...newEmployeeForm, businessLogo })}
                                businessName={newEmployeeForm.businessName || newEmployeeForm.name}
                                currentLanguage={currentLanguage}
                                inputId="business-logo-new"
                              />
                            </Suspense>
                          )}

"""
    text = replace_once(text, new_avatar_anchor, new_logo_block + new_avatar_anchor, 'new subcontractor logo')

# Invoice preview button.
actions_anchor = '                            {/* Actions on Invoice for Admin */}'
if 'setInvoicePreview(inv)' not in text:
    button = """                            <button
                              type="button"
                              onClick={() => setInvoicePreview(inv)}
                              className="px-2.5 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-[9px] font-bold uppercase rounded border border-cyan-500/30 cursor-pointer"
                            >
                              {currentLanguage === 'FR' ? 'Aperçu / PDF' : 'Preview / PDF'}
                            </button>

"""
    text = replace_once(text, actions_anchor, button + actions_anchor, 'invoice preview button')

# Invoice modal before projects view.
projects_anchor = '            {/* -------------------- VIEW CONTAINER : PROJETS -------------------- */}'
if '<SubcontractorInvoicePreview' not in text:
    preview = """            {invoicePreview && (() => {
              const issuer = employees.find(employee => employee.id === invoicePreview.employeeId) || activeEmployee;
              return issuer ? (
                <Suspense fallback={<LazySectionFallback />}>
                  <SubcontractorInvoicePreview
                    invoice={invoicePreview}
                    issuer={issuer}
                    companyInfo={companyInfo}
                    currentLanguage={currentLanguage}
                    onClose={() => setInvoicePreview(null)}
                  />
                </Suspense>
              ) : null;
            })()}

"""
    text = replace_once(text, projects_anchor, preview + projects_anchor, 'invoice preview modal')

# Use localized money on payroll invoice list.
text = text.replace('{inv.amount.toFixed(2)}$', '{money(inv.amount)}')
text = text.replace('{inv.totalWithTaxes.toFixed(2)}$', '{money(inv.totalWithTaxes)}')

path.write_text(text, encoding='utf-8')

# ---------------------------------------------------------------------------
# CLIENT DOCUMENTS: EU, LOGO, WATERMARK, CURRENCY
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'components' / 'ClientDocumentsManager.tsx'
text = path.read_text(encoding='utf-8')
if "from '../internationalRegions'" not in text:
    text = text.replace("import { CANADIAN_REGIONS, US_REGIONS } from '../regionsData';", "import { getDefaultRegion, marketLabel, type MarketCode } from '../internationalRegions';")
if "import CompanyLogo" not in text:
    text = text.replace("import {", "import CompanyLogo from './CompanyLogo';\nimport {", 1)

old_region = """  const companyCountry = companyInfo.country || 'CA';
  const regionList = companyCountry === 'US' ? US_REGIONS : CANADIAN_REGIONS;
  const companyRegion = regionList.find(r => r.code === companyInfo.region) || regionList[0];
"""
new_region = """  const companyCountry: MarketCode = companyInfo.country === 'US' || companyInfo.country === 'EU' ? companyInfo.country : 'CA';
  const companyRegion = getDefaultRegion(companyCountry, companyInfo.region);
  const locale = companyInfo.dateLocale || (currentLanguage === 'FR' ? 'fr-CA' : 'en-CA');
  const currency = companyInfo.currency || (companyCountry === 'US' ? 'USD' : companyCountry === 'EU' ? 'EUR' : 'CAD');
  const money = (value: number) => new Intl.NumberFormat(locale, { style: 'currency', currency }).format(Number(value || 0));
"""
if old_region in text:
    text = text.replace(old_region, new_region, 1)

text = text.replace('const taxRate = (companyInfo.taxRate1 ?? companyRegion.taxRate1) + (companyInfo.taxRate2 ?? companyRegion.taxRate2);', 'const taxRate = (companyInfo.taxRate1 ?? companyRegion.taxRate1) + (companyInfo.taxRate2 ?? companyRegion.taxRate2) + (companyInfo.localTaxRate ?? 0);')
text = text.replace("const isQuebec = companyCountry === 'CA' && companyRegion.code === 'QC';", "const isQuebec = companyCountry === 'CA' && companyRegion.code === 'QC';")

# Watermark: actual logo with document type underneath.
wm_start = '              {/* Dynamic Logo Watermark & Diagonal text overlay (from improvements spec) */}'
wm_end = '\n\n              {/* Real PDF Sheet Content structure */}'
start = text.find(wm_start)
end = text.find(wm_end, start)
if start != -1 and end != -1:
    wm = """              {/* Logo watermark with the document type directly underneath */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0">
                <div className="-rotate-12 opacity-[0.075] flex flex-col items-center justify-center gap-4">
                  <CompanyLogo
                    logo={companyInfo.logo}
                    companyName={companyInfo.name}
                    className="w-72 h-72"
                    imageClassName="w-full h-full object-contain grayscale"
                    fallbackClassName="rounded-full border-8 border-slate-900 bg-transparent text-slate-900 text-7xl"
                  />
                  <span className="text-5xl font-mono font-black uppercase tracking-widest text-slate-900">
                    {selectedDocForView.status === 'paid' ? t.cdmWmPaid :
                     selectedDocForView.status === 'accepted' ? t.cdmWmAccepted :
                     selectedDocForView.type === 'quote' ? t.cdmWmQuote :
                     selectedDocForView.type === 'contract' ? t.cdmWmContract : t.cdmWmInvoice}
                  </span>
                </div>
              </div>"""
    text = text[:start] + wm + text[end:]

old_header_logo = '<div className="w-10 h-10 bg-slate-900 rounded-lg flex items-center justify-center font-bold text-white text-xl">H</div>'
new_header_logo = '<CompanyLogo logo={companyInfo.logo} companyName={companyInfo.name} className="w-12 h-12 rounded-lg border border-slate-200 bg-white p-1" imageClassName="w-full h-full object-contain rounded-md" fallbackClassName="rounded-lg bg-slate-900 text-white text-lg" />'
text = text.replace(old_header_logo, new_header_logo)
text = text.replace("{companyInfo.gstNumber && <p>TPS / GST : {companyInfo.gstNumber}</p>}", "{companyInfo.gstNumber && <p>{companyInfo.taxRate1Name || (currentLanguage === 'FR' ? companyRegion.taxRate1NameFR : companyRegion.taxRate1NameEN)} : {companyInfo.gstNumber}</p>}")
text = text.replace("{companyInfo.qstNumber && <p>TVQ / QST : {companyInfo.qstNumber}</p>}", "{companyInfo.qstNumber && <p>{companyInfo.taxRate2Name || (currentLanguage === 'FR' ? companyRegion.taxRate2NameFR : companyRegion.taxRate2NameEN)} : {companyInfo.qstNumber}</p>}")
text = text.replace("{isQuebec ? t.cdmQcInstallRule : fmt(t.cdmStdRule, { region: regionName })}", "{isQuebec ? t.cdmQcInstallRule : fmt(t.cdmStdRule, { region: regionName })}")

# Straightforward currency conversions in JSX.
text = re.sub(r'\{([A-Za-z_][A-Za-z0-9_.]*)\.toFixed\(2\)\}\$', r'{money(\1)}', text)
text = re.sub(r'\{([A-Za-z_][A-Za-z0-9_.]*)\.toLocaleString\(\)\}\$', r'{money(\1)}', text)
text = text.replace("${doc.total.toFixed(2)}$", "${money(doc.total)}")
path.write_text(text, encoding='utf-8')

# ---------------------------------------------------------------------------
# MIGRATION FILE
# ---------------------------------------------------------------------------
migrations = ROOT / 'supabase' / 'migrations'
migrations.mkdir(parents=True, exist_ok=True)
migration = migrations / '20260719173000_add_international_compliance_and_invoice_branding.sql'
migration.write_text("""alter table public.companies
  add column if not exists date_locale text,
  add column if not exists data_storage_mode text not null default 'hybrid',
  add column if not exists cloud_sync_consent boolean not null default true,
  add column if not exists cloud_region text not null default 'ca-central-1',
  add column if not exists privacy_policy_version text,
  add column if not exists privacy_policy_accepted_at timestamptz,
  add column if not exists privacy_contact_email text,
  add column if not exists privacy_officer_name text,
  add column if not exists retention_months integer not null default 84,
  add column if not exists employee_data_basis_confirmed boolean not null default false,
  add column if not exists location_data_notice_confirmed boolean not null default false,
  add column if not exists cross_border_transfer_acknowledged_at timestamptz,
  add column if not exists tax_confirmed_at timestamptz,
  add column if not exists tax_disclaimer_accepted_at timestamptz,
  add column if not exists local_tax_rate numeric not null default 0,
  add column if not exists compliance_version text,
  add column if not exists processor_terms_accepted_at timestamptz;

alter table public.app_users
  add column if not exists business_logo text,
  add column if not exists privacy_notice_version text,
  add column if not exists privacy_notice_acknowledged_at timestamptz,
  add column if not exists location_notice_acknowledged_at timestamptz;

alter table public.payroll_entries
  add column if not exists currency text,
  add column if not exists tax_rate1 numeric,
  add column if not exists tax_rate2 numeric,
  add column if not exists local_tax_rate numeric,
  add column if not exists local_tax_amount numeric,
  add column if not exists tax_rate1_name text,
  add column if not exists tax_rate2_name text,
  add column if not exists issuer_name text,
  add column if not exists issuer_address text,
  add column if not exists issuer_tax_number text,
  add column if not exists issuer_logo text,
  add column if not exists recipient_name text;
""", encoding='utf-8')

print('International compliance, logo branding, privacy notices, and subcontractor invoices applied.')
