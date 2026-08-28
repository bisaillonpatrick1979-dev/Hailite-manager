/**
 * Politique de stockage navigateur.
 *
 * Elle dépend de l'endroit où vivent les données, choisi par le client au
 * premier démarrage.
 *
 * En mode « serveur » (Supabase), le serveur fait autorité. Les données métier
 * et les sessions ne doivent jamais être persistées dans localStorage : sur un
 * appareil partagé, elles resteraient lisibles après la déconnexion, et une
 * copie locale divergerait en silence de la source. Seules quelques
 * préférences sans secret peuvent y rester.
 *
 * En mode « hors serveur » (local ou nuage personnel), il n'y a pas de serveur.
 * Le stockage de l'appareil EST la base de données : le refuser reviendrait à
 * effacer l'entreprise du client à chaque fermeture de l'application. C'est
 * précisément ce qui se passait, et le fichier déposé sur son nuage ne
 * contenait alors que sa langue et son thème.
 *
 * Ce qui ne change jamais, dans un mode comme dans l'autre : les jetons de
 * session et les NIP en clair ne sont écrits nulle part.
 */

const SAFE_KEYS = new Set([
  'gcp_currentLanguage',
  'gcp_currentTheme',
  'gcp_isOnboarded',
  'gcp_companyInfo',
  'gcp_aiVoiceEnabled',
  'gcp_chunkReloadedAt',
  // Bornes de la version d'essai. Elles doivent survivre à une déconnexion et
  // au mode serveur, sinon l'essai repartirait à zéro au moindre changement.
  'gcp_trialStartedAt',
  'gcp_trialLastSeenAt'
]);

// Familles de clés autorisées par préfixe, quand l'identifiant fait partie du
// nom. La progression dans le centre d'aide est une liste d'étapes de tutoriel
// cochées : aucune donnée personnelle, aucune donnée d'entreprise. Elle doit
// survivre à une déconnexion, sinon la formation redemande à chaque
// reconnexion de refaire ce qui a déjà été fait.
// Deux marques par employé, sans aucune donnée personnelle : la progression du
// parcours de formation et la date de la première ouverture du centre d'aide.
// Elles doivent survivre à une déconnexion, sinon la formation recommence à
// zéro et la fenêtre d'aide se rouvre à chaque reconnexion.
const SAFE_KEY_PREFIXES = ['gcp_help_progress_', 'gcp_help_welcome_'];

export function isSafeStorageKey(key: string): boolean {
  return SAFE_KEYS.has(key) || SAFE_KEY_PREFIXES.some(prefix => key.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Où vivent les données
// ---------------------------------------------------------------------------

export type StoragePersistence = 'server' | 'offline';

/**
 * Clés qui ne sont écrites dans aucun mode. Un jeton de session vole une
 * identité, et l'employé actif est reconstruit à chaque connexion.
 */
const NEVER_PERSISTED = new Set([
  'gcp_activeEmployee',
  'gcp_authToken',
  'gcp_auth_token',
  'gcp_ai_token'
]);

/**
 * Champs qui ne descendent jamais sur l'appareil, même hors serveur. Le NIP en
 * clair n'a aucune raison d'être conservé : le mode hors serveur en garde une
 * empreinte dérivée (voir localAuth.ts), dans un champ distinct.
 */
const NEVER_STORED_FIELDS: Record<string, string[]> = {
  gcp_employees: ['nip']
};

/**
 * Le mode retenu par le client, relu depuis les préférences déjà persistées.
 *
 * Devant l'incertitude — première ouverture, préférence absente, valeur
 * inconnue — on répond « serveur », c'est-à-dire le comportement le plus
 * restrictif. Se tromper dans ce sens ne fait qu'écrire moins de choses; se
 * tromper dans l'autre laisserait traîner des données d'entreprise sur un
 * appareil dont le serveur est pourtant la source de vérité.
 */
export function readStoragePersistence(): StoragePersistence {
  try {
    if (typeof localStorage === 'undefined') return 'server';
    const raw = localStorage.getItem('gcp_companyInfo');
    if (!raw) return 'server';
    const mode = (JSON.parse(raw) || {}).dataStorageMode;
    return mode === 'local' || mode === 'personal_cloud' ? 'offline' : 'server';
  } catch {
    return 'server';
  }
}

/** Retire d'un ensemble les champs qui ne doivent jamais toucher l'appareil. */
export function stripNeverStoredFields(key: string, value: unknown): unknown {
  const fields = NEVER_STORED_FIELDS[key];
  if (!fields || !Array.isArray(value)) return value;
  return value.map(entry => {
    if (!entry || typeof entry !== 'object') return entry;
    const copy = { ...(entry as Record<string, unknown>) };
    for (const field of fields) copy[field] = '';
    return copy;
  });
}

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
  allowLocalTestData = false,
  persistence: StoragePersistence = readStoragePersistence()
): { allowed: boolean; value?: unknown } {
  if (allowLocalTestData) return { allowed: true, value };
  if (NEVER_PERSISTED.has(key)) return { allowed: false };

  // La fiche de compagnie porte elle-même le mode choisi. Au moment où
  // l'accueil l'enregistre pour la première fois, rien n'est encore persisté :
  // il faut lire le mode dans ce qu'on écrit, sinon le tout premier
  // enregistrement du client qui vient de choisir son nuage serait tronqué.
  const effective = key === 'gcp_companyInfo' && value && typeof value === 'object'
    ? (((value as Record<string, unknown>).dataStorageMode === 'local'
        || (value as Record<string, unknown>).dataStorageMode === 'personal_cloud')
        ? 'offline' : 'server')
    : persistence;

  if (effective === 'offline') {
    // Hors serveur, l'appareil est la base de données. On garde tout ce qui
    // appartient à l'application, sauf ce qui ne doit jamais y descendre.
    if (!key.startsWith('gcp_')) return { allowed: false };
    return { allowed: true, value: stripNeverStoredFields(key, value) };
  }

  if (!isSafeStorageKey(key)) return { allowed: false };
  if (key === 'gcp_companyInfo') {
    return { allowed: true, value: sanitizeCompanyPreferences(value) };
  }
  return { allowed: true, value };
}

export function purgeLegacySensitiveStorage(allowLocalTestData = false): void {
  if (typeof localStorage === 'undefined') return;

  // Les anciens jetons doivent être retirés même dans le profil de test.
  NEVER_PERSISTED.forEach(key => localStorage.removeItem(key));

  if (allowLocalTestData) return;

  // Le mode est lu une seule fois, avant de toucher à quoi que ce soit : la
  // purge ne doit pas changer d'avis en cours de route parce qu'elle vient
  // d'effacer la préférence qui le porte.
  const persistence = readStoragePersistence();

  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (!key || !key.startsWith('gcp_')) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(localStorage.getItem(key) || 'null');
    } catch {
      localStorage.removeItem(key);
      continue;
    }

    const verdict = browserStorageValue(key, parsed, false, persistence);
    if (!verdict.allowed) {
      localStorage.removeItem(key);
      continue;
    }
    localStorage.setItem(key, JSON.stringify(verdict.value));
  }
}
