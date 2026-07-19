from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TYPES = ROOT / 'src' / 'types.ts'
API = ROOT / 'src' / 'apiClient.ts'
APP = ROOT / 'src' / 'App.tsx'
MIGRATIONS = ROOT / 'supabase' / 'migrations'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: ancre trouvée {count} fois')
    return text.replace(old, new, 1)

# Types
text = TYPES.read_text(encoding='utf-8')
if 'export interface EmployeeCredential {' not in text:
    marker = "export type PayMode = 'horaire' | 'surface' | 'forfait';\n"
    addition = r'''

export type EmployeeCredentialType =
  | 'manlift'
  | 'scissor_lift'
  | 'first_aid_cpr'
  | 'fall_protection'
  | 'whmis'
  | 'forklift'
  | 'confined_space'
  | 'custom';

export interface EmployeeCredential {
  id: string;
  type: EmployeeCredentialType;
  name: string;
  issuer: string;
  credentialNumber: string;
  issuedDate: string;
  expiryDate: string;
  renewalReminderDays: number;
  doesNotExpire?: boolean;
  photoFront?: string;
  photoBack?: string;
  notes?: string;
  notifiedAt?: string;
}
'''
    text = replace_once(text, marker, marker + addition, 'types certifications')

if 'credentials?: EmployeeCredential[];' not in text:
    text = replace_once(
        text,
        "  annualSalary?: number;\n",
        "  annualSalary?: number;\n  credentials?: EmployeeCredential[];\n",
        'champ certifications employé'
    )
TYPES.write_text(text, encoding='utf-8')

# API mappers
text = API.read_text(encoding='utf-8')
if 'credentials: e.credentials || []' not in text:
    text = replace_once(
        text,
        "    pay_frequency: e.payFrequency, pay_period_start: e.payPeriodStart || null, annual_salary: e.annualSalary\n",
        "    pay_frequency: e.payFrequency, pay_period_start: e.payPeriodStart || null, annual_salary: e.annualSalary,\n    credentials: e.credentials || []\n",
        'employeeToRow credentials'
    )
if 'credentials: Array.isArray(r.credentials)' not in text:
    text = replace_once(
        text,
        "    annualSalary: r.annual_salary ?? undefined\n",
        "    annualSalary: r.annual_salary ?? undefined,\n    credentials: Array.isArray(r.credentials) ? r.credentials : []\n",
        'rowToEmployee credentials'
    )
API.write_text(text, encoding='utf-8')

# App wiring
text = APP.read_text(encoding='utf-8')

text = text.replace(
    "import { Employee, CompanyInfo, EmployeeRole, Invoice } from './types';",
    "import { Employee, CompanyInfo, EmployeeCredential, EmployeeRole, Invoice } from './types';"
)
if "from './credentialUtils'" not in text:
    text = text.replace(
        "import { translations, fmt } from './translations';\n",
        "import { translations, fmt } from './translations';\nimport { getCredentialAlerts, getCredentialStatus } from './credentialUtils';\n"
    )
if "const EmployeeCredentialsManager = lazy" not in text:
    text = text.replace(
        "const EmployeeWorkCalendar = lazy(() => import('./components/EmployeeWorkCalendar'));\n",
        "const EmployeeWorkCalendar = lazy(() => import('./components/EmployeeWorkCalendar'));\nconst EmployeeCredentialsManager = lazy(() => import('./components/EmployeeCredentialsManager'));\n"
    )

if 'const credentialAlerts = getCredentialAlerts(employees);' not in text:
    anchor = "  const unitLabels = CATALOGUE_UNIT_LABELS[currentLanguage];\n"
    replacement = anchor + "  const credentialAlerts = getCredentialAlerts(employees);\n  const totalOpenAlerts = hrAlerts.filter(alert => !alert.resolved).length + credentialAlerts.length;\n"
    text = replace_once(text, anchor, replacement, 'calcul alertes certifications')

# Add credentials to new employee form type and initial state
if 'credentials: EmployeeCredential[];' not in text:
    text = replace_once(
        text,
        "    annualSalary: number;\n",
        "    annualSalary: number;\n    credentials: EmployeeCredential[];\n",
        'type formulaire nouvel employé'
    )
if "annualSalary: 0,\n    credentials: []" not in text:
    text = replace_once(
        text,
        "    payFrequency: 'weekly',\n    annualSalary: 0\n",
        "    payFrequency: 'weekly',\n    annualSalary: 0,\n    credentials: []\n",
        'valeur initiale certifications'
    )

# Edit initialization and save
if 'credentials: emp.credentials || []' not in text:
    text = replace_once(
        text,
        "                                avatar: emp.avatar || ''\n",
        "                                avatar: emp.avatar || '',\n                                credentials: emp.credentials || []\n",
        'initialisation édition certifications'
    )
if 'credentials: editEmployeeForm.credentials || []' not in text:
    text = replace_once(
        text,
        "                                              annualSalary: editEmployeeForm.annualSalary\n",
        "                                              annualSalary: editEmployeeForm.annualSalary,\n                                              credentials: editEmployeeForm.credentials || []\n",
        'sauvegarde édition certifications'
    )

# Insert manager in edit form before legacy certification number row
edit_anchor = "                                    <div className=\"flex justify-between items-center pt-2\">\n                                      <div className=\"text-[10px] text-gray-500 font-mono\">\n                                        {isQuebec ? 'AS/CCQ' : t.certificationWord}"
if 'title={currentLanguage === \'FR\' ? `Cartes de ${emp.name}`' not in text:
    edit_block = r'''                                    <Suspense fallback={<LazySectionFallback />}>
                                      <EmployeeCredentialsManager
                                        value={editEmployeeForm.credentials || []}
                                        onChange={(credentials) => setEditEmployeeForm({ ...editEmployeeForm, credentials })}
                                        currentLanguage={currentLanguage}
                                        canManage
                                        title={currentLanguage === 'FR' ? `Cartes de ${emp.name}` : `${emp.name}'s cards`}
                                      />
                                    </Suspense>

'''
    text = replace_once(text, edit_anchor, edit_block + edit_anchor, 'gestionnaire édition employé')

# Insert manager in new hire form before hire button
hire_button_anchor = "                          <button \n                            disabled={!newEmployeeForm.name || !newEmployeeForm.nip}"
if 'value={newEmployeeForm.credentials}' not in text:
    hire_block = r'''                          <Suspense fallback={<LazySectionFallback />}>
                            <EmployeeCredentialsManager
                              value={newEmployeeForm.credentials}
                              onChange={(credentials) => setNewEmployeeForm({ ...newEmployeeForm, credentials })}
                              currentLanguage={currentLanguage}
                              canManage
                              title={currentLanguage === 'FR' ? 'Cartes fournies à l’embauche' : 'Cards provided at hiring'}
                            />
                          </Suspense>

'''
    text = replace_once(text, hire_button_anchor, hire_block + hire_button_anchor, 'gestionnaire embauche')

# Include credentials in create and reset
if 'annualSalary: newEmployeeForm.annualSalary,\n                                credentials: newEmployeeForm.credentials' not in text:
    text = replace_once(
        text,
        "                                annualSalary: newEmployeeForm.annualSalary\n",
        "                                annualSalary: newEmployeeForm.annualSalary,\n                                credentials: newEmployeeForm.credentials\n",
        'création employé certifications'
    )
if "annualSalary: 0,\n                                credentials: []" not in text:
    text = replace_once(
        text,
        "                                payFrequency: 'weekly',\n                                annualSalary: 0\n",
        "                                payFrequency: 'weekly',\n                                annualSalary: 0,\n                                credentials: []\n",
        'reset certifications embauche'
    )

# Replace alert badges/counts with combined HR + credential alert count
text = text.replace("hrAlerts.filter(a => !a.resolved).length", "totalOpenAlerts")
text = text.replace("hrAlerts.filter(alert => !alert.resolved).length", "totalOpenAlerts")
# Undo the total definition if global replacement touched it
text = text.replace("const totalOpenAlerts = totalOpenAlerts + credentialAlerts.length;", "const totalOpenAlerts = hrAlerts.filter(alert => !alert.resolved).length + credentialAlerts.length;")

# Employee in-app alert banner
punch_anchor = "                    {/* Punch State Info Banner */}"
if 'CERTIFICATION EXPIRY BANNER — employee' not in text:
    banner = r'''                    {/* CERTIFICATION EXPIRY BANNER — employee and subcontractor */}
                    {credentialAlerts.filter(item => item.employeeId === activeEmployee.id).length > 0 && (
                      <div className="w-full mb-5 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-left">
                        <h4 className="text-sm font-black text-amber-300">⚠️ {currentLanguage === 'FR' ? 'Carte à renouveler' : 'Card renewal required'}</h4>
                        <div className="mt-2 space-y-2">
                          {credentialAlerts.filter(item => item.employeeId === activeEmployee.id).map(item => (
                            <div key={item.credential.id} className="rounded-xl bg-black/20 border border-amber-500/20 p-3">
                              <p className="text-xs font-black text-white">🪪 {item.credential.name}</p>
                              <p className={`text-[11px] mt-1 font-bold ${item.status === 'expired' ? 'text-red-400' : 'text-amber-300'}`}>
                                {item.status === 'expired'
                                  ? (currentLanguage === 'FR' ? `Expirée depuis ${Math.abs(item.daysRemaining)} jour(s)` : `Expired ${Math.abs(item.daysRemaining)} day(s) ago`)
                                  : (currentLanguage === 'FR' ? `Expire dans ${item.daysRemaining} jour(s)` : `Expires in ${item.daysRemaining} day(s)`)}
                              </p>
                              <p className="text-[10px] text-gray-400 mt-1">{currentLanguage === 'FR' ? 'Communiquez avec l’administration pour planifier le renouvellement.' : 'Contact administration to schedule renewal.'}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

'''
    text = replace_once(text, punch_anchor, banner + punch_anchor, 'bannière employé certifications')

# Read-only credential cards on employee home after work calendar
calendar_end_anchor = "                    </div>\n\n                  </div>\n                ) : ("
if 'title={currentLanguage === \'FR\' ? \'Mes cartes de compétence\'' not in text:
    own_cards = r'''                    </div>

                    <div className="w-full mt-6">
                      <Suspense fallback={<LazySectionFallback />}>
                        <EmployeeCredentialsManager
                          value={activeEmployee.credentials || []}
                          onChange={() => undefined}
                          currentLanguage={currentLanguage}
                          canManage={false}
                          title={currentLanguage === 'FR' ? 'Mes cartes de compétence' : 'My competency cards'}
                        />
                      </Suspense>
                    </div>

                  </div>
                ) : ('''
    text = replace_once(text, calendar_end_anchor, own_cards, 'cartes personnelles accueil')

# Admin credential alert overview before employee list
list_anchor = "                        {/* List employees */}"
if 'CREDENTIAL ALERT OVERVIEW — administration' not in text:
    overview = r'''                        {/* CREDENTIAL ALERT OVERVIEW — administration */}
                        {credentialAlerts.length > 0 && (
                          <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <h5 className="text-sm font-black text-amber-300">⚠️ {currentLanguage === 'FR' ? 'Renouvellements à planifier' : 'Renewals to schedule'}</h5>
                                <p className="text-[10px] text-gray-400 mt-1">{currentLanguage === 'FR' ? 'Cartes expirées ou arrivant dans leur période d’alerte.' : 'Expired cards or cards inside their reminder period.'}</p>
                              </div>
                              <span className="rounded-full bg-red-500 text-white min-w-7 h-7 px-2 inline-flex items-center justify-center text-xs font-black">{credentialAlerts.length}</span>
                            </div>
                            <div className="space-y-2">
                              {credentialAlerts.map(item => (
                                <button
                                  type="button"
                                  key={`${item.employeeId}-${item.credential.id}`}
                                  onClick={() => setEditingEmployeeId(item.employeeId)}
                                  className="w-full text-left rounded-xl bg-gray-950/65 border border-gray-800 hover:border-amber-500/50 p-3 flex items-center justify-between gap-3"
                                >
                                  <div className="min-w-0">
                                    <p className="text-xs font-black text-white truncate">{item.employeeName} — {item.credential.name}</p>
                                    <p className="text-[10px] text-gray-500 mt-1">{currentLanguage === 'FR' ? 'Expiration' : 'Expiry'} : {item.credential.expiryDate}</p>
                                  </div>
                                  <span className={`shrink-0 text-[10px] font-black ${item.status === 'expired' ? 'text-red-400' : 'text-amber-400'}`}>
                                    {item.status === 'expired'
                                      ? (currentLanguage === 'FR' ? 'EXPIRÉE' : 'EXPIRED')
                                      : `${item.daysRemaining} ${currentLanguage === 'FR' ? 'jours' : 'days'}`}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

'''
    text = replace_once(text, list_anchor, overview + list_anchor, 'vue alertes admin certifications')

APP.write_text(text, encoding='utf-8')

MIGRATIONS.mkdir(parents=True, exist_ok=True)
migration = MIGRATIONS / '20260719170000_add_employee_credentials.sql'
if not migration.exists():
    migration.write_text("""alter table public.app_users\n  add column if not exists credentials jsonb not null default '[]'::jsonb;\n\ncomment on column public.app_users.credentials is\n  'Employee and subcontractor safety certifications, expiry dates, reminder settings, and compressed card images.';\n""", encoding='utf-8')

print('Certifications employés intégrées aux types, à Supabase et à l’interface.')
