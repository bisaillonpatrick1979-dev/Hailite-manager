from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: ancre trouvée {count} fois')
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# API SERVEUR — authentifie les profils de validation et sélectionne la clé
# Vercel correspondant exactement au fournisseur choisi dans les Réglages.
# ---------------------------------------------------------------------------
path = ROOT / 'apiRoutes.ts'
text = path.read_text(encoding='utf-8')

provider_anchor = """const PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Google Gemini',
  anthropic: 'Anthropic Claude',
  openai: 'OpenAI'
};
"""
provider_addition = provider_anchor + """
// Variables reconnues pour chaque fournisseur. La première est le nom officiel
// affiché dans l'interface ; les alias Gemini permettent de conserver les noms
// de variables déjà utilisés dans certains anciens déploiements.
const PROVIDER_ENV_ALIASES: Record<string, string[]> = {
  gemini: ['GEMINI_API_KEY', 'GOOGLE_GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY']
};

function resolveProviderApiKey(provider: string): string | undefined {
  for (const envName of PROVIDER_ENV_ALIASES[provider] || []) {
    const value = process.env[envName];
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

// Profils exclusivement fictifs du scénario annuel. Ils reçoivent une vraie
// session signée afin d'appeler /api/chat sans ouvrir publiquement les clés IA.
const LOCAL_TEST_AUTH_USERS: Record<string, { nip: string; name: string; role: AppRole }> = {
  'test-admin': { nip: '0000', name: 'Administrateur Test', role: 'admin' },
  'test-secretary': { nip: '1001', name: 'Sophie Bureau', role: 'secretary' },
  'test-accountant': { nip: '1002', name: 'Marc Comptable', role: 'accountant' },
  'test-employee-1': { nip: '1003', name: 'Liam Tremblay', role: 'employee' },
  'test-employee-2': { nip: '1004', name: 'Emma Roy', role: 'employee' },
  'test-employee-3': { nip: '1005', name: 'Noah Gagnon', role: 'employee' },
  'test-employee-4': { nip: '1006', name: 'Olivia Martin', role: 'employee' },
  'test-contractor-1': { nip: '2001', name: 'Éric Cladding', role: 'employee' },
  'test-contractor-2': { nip: '2002', name: 'Nadia Exteriors', role: 'employee' },
  'test-contractor-3': { nip: '2003', name: 'Samuel Roofing', role: 'employee' }
};
const LOCAL_TEST_COMPANY_ID = '00000000-0000-4000-8000-000000000001';
"""
if 'const LOCAL_TEST_AUTH_USERS' not in text:
    text = replace_once(text, provider_anchor, provider_addition, 'configuration fournisseurs IA')

login_old = """  app.post('/api/auth/login', async (req, res) => {
    if (!supabaseEnabled) {
      return res.status(503).json({ error: 'Authentification indisponible (base de données non configurée)', code: 'AUTH_UNAVAILABLE' });
    }
    const { employeeId, nip } = req.body || {};
    if (typeof employeeId !== 'string' || typeof nip !== 'string' || !/^\\d{4}$/.test(nip)) {
      return res.status(400).json({ error: 'Requête invalide' });
    }
"""
login_new = """  app.post('/api/auth/login', async (req, res) => {
    const { employeeId, nip } = req.body || {};
    if (typeof employeeId !== 'string' || typeof nip !== 'string' || !/^\\d{4}$/.test(nip)) {
      return res.status(400).json({ error: 'Requête invalide' });
    }

    const localUser = LOCAL_TEST_AUTH_USERS[employeeId];
    if (localUser) {
      const throttleKey = `${req.ip || 'noip'}|${employeeId}`;
      if (isLoginThrottled(throttleKey)) {
        return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.', code: 'THROTTLED' });
      }
      if (nip !== localUser.nip) {
        recordLoginFailure(throttleKey);
        return res.status(401).json({ error: 'NIP incorrect', code: 'INVALID_CREDENTIALS' });
      }
      clearLoginFailures(throttleKey);
      const ctx: AuthContext = {
        userId: employeeId,
        companyId: LOCAL_TEST_COMPANY_ID,
        role: localUser.role,
        name: localUser.name
      };
      const { token, expiresAt } = signSession(ctx);
      return res.json({ token, expiresAt, user: { id: ctx.userId, name: ctx.name, role: ctx.role } });
    }

    if (!supabaseEnabled) {
      return res.status(503).json({ error: 'Authentification indisponible (base de données non configurée)', code: 'AUTH_UNAVAILABLE' });
    }
"""
if login_new not in text:
    text = replace_once(text, login_old, login_new, 'connexion serveur des profils test')

text = text.replace(
    "      const apiKey = process.env[PROVIDER_ENV_KEYS[selectedProvider]];",
    "      const apiKey = resolveProviderApiKey(selectedProvider);"
)

status_anchor = """  // -------------------------------------------------------------------------
  // Assistant IA. La clé API vit EXCLUSIVEMENT dans les variables
"""
status_route = """  // État des fournisseurs, sans jamais retourner la valeur d'une clé.
  app.get('/api/ai/status', attachAuthOptional, (req: AuthedRequest, res) => {
    if (supabaseEnabled && !req.auth) {
      return res.status(401).json({ error: 'authentification requise', code: 'AUTH_REQUIRED' });
    }
    return res.json({
      providers: Object.fromEntries(
        Object.keys(PROVIDER_ENV_KEYS).map(provider => [provider, {
          configured: Boolean(resolveProviderApiKey(provider)),
          envNames: PROVIDER_ENV_ALIASES[provider],
          label: PROVIDER_LABELS[provider]
        }])
      )
    });
  });

""" + status_anchor
if "app.get('/api/ai/status'" not in text:
    text = replace_once(text, status_anchor, status_route, 'route statut des clés IA')

path.write_text(text, encoding='utf-8')


# ---------------------------------------------------------------------------
# CLIENT API — la synchronisation Supabase reste coupée en mode test, mais
# l'authentification serveur demeure permise afin d'obtenir le jeton IA.
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'apiClient.ts'
text = path.read_text(encoding='utf-8')
auth_guard = """export async function authLogin(employeeId: string, nip: string):
  Promise<{ status: AuthLoginStatus; user?: { id: string; name: string; role: string } }> {
  if (!cloudSyncAllowed) return { status: 'unavailable' };
  try {
"""
auth_allowed = """export async function authLogin(employeeId: string, nip: string):
  Promise<{ status: AuthLoginStatus; user?: { id: string; name: string; role: string } }> {
  try {
"""
if auth_guard in text:
    text = text.replace(auth_guard, auth_allowed, 1)
path.write_text(text, encoding='utf-8')


# ---------------------------------------------------------------------------
# STORE — retire le court-circuit local ajouté par le générateur annuel. La
# connexion passe d'abord au serveur et obtient une session; le repli local
# existant reste disponible si le serveur est réellement hors ligne.
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'store.ts'
text = path.read_text(encoding='utf-8')
text, removed = re.subn(
    r"    // Mode de validation local : les profils test ne consultent jamais le\n"
    r"    // serveur d’authentification\. Le NIP est vérifié uniquement sur cet appareil\.\n"
    r"    if \(LOCAL_TEST_MODE \|\| employeeId\.startsWith\('test-'\)\) \{[\s\S]*?\n"
    r"    \}\n\n(?=    // Vérification du NIP CÔTÉ SERVEUR)",
    "",
    text,
    count=1
)
path.write_text(text, encoding='utf-8')


# ---------------------------------------------------------------------------
# INTERFACE — affiche dans Réglages si les trois clés Vercel sont détectées.
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'App.tsx'
text = path.read_text(encoding='utf-8')
state_anchor = "  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);\n"
state_addition = state_anchor + """  const [aiProviderStatus, setAiProviderStatus] = useState<Record<string, { configured: boolean; envNames: string[]; label: string }> | null>(null);
  const [aiProviderStatusError, setAiProviderStatusError] = useState<boolean>(false);

  useEffect(() => {
    if (!activeEmployee || visibleSettingsTab !== 12) return;
    let cancelled = false;
    setAiProviderStatusError(false);
    fetch('/api/ai/status', { headers: authHeaders() })
      .then(async response => {
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.providers) throw new Error('AI status unavailable');
        if (!cancelled) setAiProviderStatus(data.providers);
      })
      .catch(() => {
        if (!cancelled) {
          setAiProviderStatus(null);
          setAiProviderStatusError(true);
        }
      });
    return () => { cancelled = true; };
  }, [activeEmployee?.id, visibleSettingsTab, companyInfo.aiProvider]);
"""
if 'const [aiProviderStatus,' not in text:
    text = replace_once(text, state_anchor, state_addition, 'état des fournisseurs IA')

label_anchor = """                                {p.label}
                              </button>
"""
label_replacement = """                                <span className=\"block\">{p.label}</span>
                                <span className={`block mt-1 text-[9px] font-mono ${
                                  aiProviderStatus?.[p.id]?.configured ? 'text-green-200' : 'text-orange-100/80'
                                }`}>
                                  {aiProviderStatus?.[p.id]?.configured
                                    ? (currentLanguage === 'FR' ? 'Clé Vercel détectée' : 'Vercel key detected')
                                    : (currentLanguage === 'FR' ? 'Clé non détectée' : 'Key not detected')}
                                </span>
                              </button>
"""
if 'Clé Vercel détectée' not in text:
    text = replace_once(text, label_anchor, label_replacement, 'badge clé par fournisseur')

card_anchor = """                          <p className=\"text-[10px] text-gray-600\">
                            {t.keyBadgeHint}
                          </p>
"""
card_replacement = """                          <p className=\"text-[10px] text-gray-600\">
                            {t.keyBadgeHint}
                          </p>
                          {aiProviderStatusError && (
                            <p className=\"text-[10px] text-red-300\">
                              {currentLanguage === 'FR'
                                ? 'Impossible de vérifier les clés : reconnectez-vous au profil, puis revenez dans Réglages IA.'
                                : 'Unable to verify keys: sign in again, then return to AI Settings.'}
                            </p>
                          )}
                          <p className=\"text-[10px] text-gray-500\">
                            {currentLanguage === 'FR'
                              ? `Fournisseur actif : ${companyInfo.aiProvider === 'anthropic' ? 'Anthropic Claude' : companyInfo.aiProvider === 'openai' ? 'OpenAI ChatGPT' : 'Google Gemini'}. La variable Vercel correspondante sera utilisée automatiquement.`
                              : `Active provider: ${companyInfo.aiProvider === 'anthropic' ? 'Anthropic Claude' : companyInfo.aiProvider === 'openai' ? 'OpenAI ChatGPT' : 'Google Gemini'}. Its matching Vercel variable will be used automatically.`}
                          </p>
"""
if 'Fournisseur actif :' not in text:
    text = replace_once(text, card_anchor, card_replacement, 'résumé fournisseur actif')

path.write_text(text, encoding='utf-8')
print('Accès IA Vercel, session test et sélection des fournisseurs rétablis.')
