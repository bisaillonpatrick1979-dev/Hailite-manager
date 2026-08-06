/**
 * Politique de stockage navigateur.
 *
 * Les données métier et les sessions ne doivent jamais être persistées dans
 * localStorage. Seules quelques préférences sans secret peuvent y rester.
 */

const SAFE_KEYS = new Set([
  'gcp_currentLanguage',
  'gcp_currentTheme',
  'gcp_isOnboarded',
  'gcp_companyInfo',
  'gcp_aiVoiceEnabled',
  'gcp_chunkReloadedAt'
]);

const SAFE_COMPANY_FIELDS = new Set([
  'name', 'logo', 'country', 'region', 'currency', 'unitSystem', 'dateLocale',
  'taxRate1', 'taxRate2', 'localTaxRate', 'taxRate1Name', 'taxRate2Name',
  'dataStorageMode', 'cloudSyncConsent', 'cloudRegion', 'retentionMonths',
  'geofencingEnabled', 'vacationRate', 'legalMinimumWage', 'isOnboarded',
  'complianceVersion'
]);

export function sanitizeCompanyPreferences(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => SAFE_COMPANY_FIELDS.has(key))
  );
}

export function browserStorageValue(
  key: string,
  value: unknown,
  allowLocalTestData = false
): { allowed: boolean; value?: unknown } {
  if (allowLocalTestData) return { allowed: true, value };
  if (!SAFE_KEYS.has(key)) return { allowed: false };
  if (key === 'gcp_companyInfo') {
    return { allowed: true, value: sanitizeCompanyPreferences(value) };
  }
  return { allowed: true, value };
}

export function purgeLegacySensitiveStorage(allowLocalTestData = false): void {
  if (typeof localStorage === 'undefined') return;

  // Les anciens jetons doivent être retirés même dans le profil de test.
  ['gcp_authToken', 'gcp_auth_token', 'gcp_ai_token', 'gcp_activeEmployee']
    .forEach(key => localStorage.removeItem(key));

  if (allowLocalTestData) return;

  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (!key || !key.startsWith('gcp_')) continue;

    if (!SAFE_KEYS.has(key)) {
      localStorage.removeItem(key);
      continue;
    }

    if (key === 'gcp_companyInfo') {
      try {
        const sanitized = sanitizeCompanyPreferences(JSON.parse(localStorage.getItem(key) || '{}'));
        localStorage.setItem(key, JSON.stringify(sanitized));
      } catch {
        localStorage.removeItem(key);
      }
    }
  }
}
