from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: ancre trouvée {count} fois')
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------------
# TYPES — marqueur explicite de données locales de validation
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'types.ts'
text = path.read_text(encoding='utf-8')
if 'testMode?: boolean;' not in text:
    anchor = "  complianceVersion?: string;\n"
    if anchor in text:
        text = text.replace(anchor, anchor + "  testMode?: boolean;\n", 1)
path.write_text(text, encoding='utf-8')

# ---------------------------------------------------------------------------
# STORE — supprime les quatre faux profils historiques et utilise 10 profils
# locaux. Aucune lecture/écriture Supabase en mode validation.
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'store.ts'
text = path.read_text(encoding='utf-8')

if "from './testProfiles'" not in text:
    text = text.replace(
        "} from './apiClient';\n",
        "} from './apiClient';\nimport { LOCAL_TEST_MODE, TEST_EMPLOYEES } from './testProfiles';\n",
        1,
    )

pattern = re.compile(
    r"// Initial Mock Data to bootstrap the application beautifully\n"
    r"const initialEmployees: Employee\[\] = \[[\s\S]*?\n\];\n\n"
    r"const initialProjects: Project\[\] = \["
)
replacement = """// Profils de validation strictement locaux. Les quatre anciens profils de
// démonstration ont été retirés et ne sont jamais envoyés à Supabase.
const initialEmployees: Employee[] = LOCAL_TEST_MODE ? TEST_EMPLOYEES : [];

const initialProjects: Project[] = ["""
text, replaced = pattern.subn(replacement, text, count=1)
if replaced != 1 and 'const initialEmployees: Employee[] = LOCAL_TEST_MODE ? TEST_EMPLOYEES : [];' not in text:
    raise RuntimeError(f'Bloc initialEmployees non remplacé: {replaced}')

text = text.replace(
    "  employees: getSavedState('gcp_employees', initialEmployees),",
    "  employees: getSavedState('gcp_employees', LOCAL_TEST_MODE ? TEST_EMPLOYEES : initialEmployees),"
)

local_login = """    // Mode de validation local : les profils test ne consultent jamais le
    // serveur d’authentification. Le NIP est vérifié uniquement sur cet appareil.
    if (LOCAL_TEST_MODE || employeeId.startsWith('test-')) {
      if (emp.nip === nip) {
        set({ activeEmployee: emp });
        saveState('gcp_activeEmployee', emp);
        return {
          success: true,
          message: currentLanguage === 'FR' ? `Bienvenue, ${emp.name} !` : `Welcome, ${emp.name}!`
        };
      }
      return {
        success: false,
        message: currentLanguage === 'FR' ? 'NIP incorrect.' : 'Incorrect PIN.'
      };
    }

"""
login_anchor = "    // Vérification du NIP CÔTÉ SERVEUR"
if local_login.strip() not in text:
    text = replace_once(text, login_anchor, local_login + login_anchor, 'connexion locale de test')

for old, new in [
    ("    syncInsert('app_users', employeeToRow(newEmp));", "    if (!LOCAL_TEST_MODE) syncInsert('app_users', employeeToRow(newEmp));"),
    ("    syncUpdate('app_users', emp.id, employeeToRow(emp));", "    if (!LOCAL_TEST_MODE) syncUpdate('app_users', emp.id, employeeToRow(emp));"),
    ("    syncDelete('app_users', id);", "    if (!LOCAL_TEST_MODE) syncDelete('app_users', id);")
]:
    text = text.replace(old, new)

hydrate_anchor = "  hydrateCloud: async () => {\n"
local_hydrate = """  hydrateCloud: async () => {
    if (LOCAL_TEST_MODE) {
      set({ offlineSyncStatus: 'offline' });
      return;
    }
"""
if local_hydrate not in text:
    text = replace_once(text, hydrate_anchor, local_hydrate, 'hydratation locale de test')

path.write_text(text, encoding='utf-8')

# ---------------------------------------------------------------------------
# API CLIENT — même si l’utilisateur choisit « hybride » dans l’onboarding,
# la version de validation reste locale et ne touche pas Supabase.
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'apiClient.ts'
text = path.read_text(encoding='utf-8')

if "const localTestModeEnabled" not in text:
    anchor = "let cloudEnabled = false;\n"
    addition = """let cloudEnabled = false;
const localTestModeEnabled = () => {
  try { return localStorage.getItem('gcp_localTestMode') === 'true'; }
  catch { return false; }
};
"""
    text = replace_once(text, anchor, addition, 'garde API mode test')

text = re.sub(
    r"export function setCloudSyncAllowed\(allowed: boolean\) \{\n\s*cloudSyncAllowed = allowed;\n\s*if \(!allowed\) cloudEnabled = false;\n\}",
    """export function setCloudSyncAllowed(allowed: boolean) {
  cloudSyncAllowed = localTestModeEnabled() ? false : allowed;
  if (!cloudSyncAllowed) cloudEnabled = false;
}""",
    text,
    count=1,
)

# La valeur initiale doit elle aussi respecter le mode test avant tout appel.
text = text.replace(
    "let cloudSyncAllowed = (() => {\n  try {",
    "let cloudSyncAllowed = (() => {\n  if (localTestModeEnabled()) return false;\n  try {",
    1,
)
path.write_text(text, encoding='utf-8')

# ---------------------------------------------------------------------------
# APP — onboarding prioritaire et aide visible pour les NIP de validation.
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'App.tsx'
text = path.read_text(encoding='utf-8')

if "from './testProfiles'" not in text:
    text = text.replace(
        "import { getCredentialAlerts, getCredentialStatus } from './credentialUtils';\n",
        "import { getCredentialAlerts, getCredentialStatus } from './credentialUtils';\nimport { LOCAL_TEST_MODE, TEST_PIN_DIRECTORY } from './testProfiles';\n",
        1,
    )

text = text.replace(
    "  if (!isOnboarded) {\n    return <Suspense fallback={<LazySectionFallback />}><OnboardingScreen /></Suspense>;\n  }",
    "  if (!isOnboarded || companyInfo.complianceVersion !== '2026.07') {\n    return <Suspense fallback={<LazySectionFallback />}><OnboardingScreen /></Suspense>;\n  }"
)

banner_anchor = "            {/* Profile Selection Grid */}"
if 'LOCAL TEST PROFILES — no Supabase' not in text:
    banner = r'''            {/* LOCAL TEST PROFILES — no Supabase */}
            {LOCAL_TEST_MODE && (
              <div className="mb-6 rounded-2xl border border-orange-500/35 bg-orange-500/10 p-4 text-left">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase font-black tracking-widest text-orange-400">
                      {currentLanguage === 'FR' ? 'Mode de validation local' : 'Local validation mode'}
                    </p>
                    <p className="text-xs text-gray-300 mt-1">
                      {currentLanguage === 'FR'
                        ? 'Ces profils sont enregistrés seulement sur cet appareil. Aucune donnée test n’est envoyée à Supabase.'
                        : 'These profiles are stored only on this device. No test data is sent to Supabase.'}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-orange-600 px-3 py-1 text-[10px] font-black text-white">DEV TEST</span>
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {TEST_PIN_DIRECTORY.map(item => (
                    <div key={item} className="rounded-lg border border-gray-800 bg-[#0F1115] px-3 py-2 text-[10px] font-mono text-gray-300">{item}</div>
                  ))}
                </div>
              </div>
            )}

'''
    text = replace_once(text, banner_anchor, banner + banner_anchor, 'aide NIP mode test')
path.write_text(text, encoding='utf-8')

# ---------------------------------------------------------------------------
# ONBOARDING — reprend le visuel exact de l’application : fond charbon,
# panneaux #16191F, bordures grises et accent orange.
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'components' / 'OnboardingScreen.tsx'
text = path.read_text(encoding='utf-8')

text = text.replace(
    '<main className="min-h-screen bg-[#0A0D12] text-white px-4 py-5 sm:px-6 flex items-center justify-center">',
    '<main id="hailite-onboarding-screen" className="min-h-screen bg-[#0F1115] text-[#E0E2E6] font-sans px-4 py-5 sm:px-6 flex items-center justify-center">'
)
text = text.replace('bg-[#111722]', 'bg-[#16191F]')
text = text.replace('from-slate-950 to-slate-900', 'from-[#16191F] to-[#111318]')
text = text.replace('bg-slate-950/70', 'bg-[#0F1115]/90')
text = text.replace('bg-slate-950/60', 'bg-[#0F1115]/90')
text = text.replace('bg-slate-950', 'bg-[#0F1115]')
text = text.replace('bg-slate-900', 'bg-[#1A1E26]')
text = text.replace('border-slate-700', 'border-gray-800')
text = text.replace('border-slate-600', 'border-gray-700')
text = text.replace('text-slate-200', 'text-gray-200')
text = text.replace('text-slate-300', 'text-gray-300')
text = text.replace('text-slate-400', 'text-gray-400')
text = text.replace('text-slate-500', 'text-gray-500')
text = text.replace('text-slate-950', 'text-white')
text = text.replace('cyan-', 'orange-')
text = text.replace('bg-orange-500 text-white border-orange-300', 'bg-orange-600 text-white border-orange-500')
text = text.replace('bg-orange-500 px-7', 'bg-orange-600 hover:bg-orange-500 px-7')
text = text.replace('bg-emerald-500 px-7', 'bg-orange-600 hover:bg-orange-500 px-7')
text = text.replace('text-emerald-300', 'text-orange-400')

path.write_text(text, encoding='utf-8')
print('Mode de test local, profils, connexion 0000 et onboarding Hailite appliqués.')
