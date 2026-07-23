from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'src' / 'App.tsx'
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: ancre trouvée {count} fois')
    text = text.replace(old, new, 1)


# Le nouveau centre est chargé seulement à son ouverture.
replace_once(
    "const EmployeeCredentialsManager = lazy(() => import('./components/EmployeeCredentialsManager'));\n",
    """const EmployeeCredentialsManager = lazy(() => import('./components/EmployeeCredentialsManager'));
const UserHelpCenter = lazy(() => import('./components/UserHelpCenter'));
""",
    'import paresseux centre aide'
)

# Retire l’ancien contenu de validation, devenu obsolète et axé sur les essais.
tour_start = text.find("const TOUR_STEPS_I18N:")
tour_end = text.find("// Résout la province/état", tour_start)
if tour_start != -1:
    if tour_end == -1:
        raise RuntimeError('Fin de l’ancien guide de validation introuvable')
    text = text[:tour_start] + text[tour_end:]

text = text.replace("  const TOUR_STEPS = TOUR_STEPS_I18N[currentLanguage];\n", '')

replace_once(
    "  const [tourStep, setTourStep] = useState<number | null>(null);\n",
    """  const [helpCenterOpen, setHelpCenterOpen] = useState<boolean>(false);
""",
    'état centre aide'
)

# Une seule ouverture automatique par profil et par version du parcours. Le
# bouton Aide permet ensuite de le rouvrir autant de fois que nécessaire.
state_anchor = """  const [geofencingBypass, setGeofencingBypass] = useState<boolean>(false);

  // Time tracker for active punch
"""
state_replacement = """  const [geofencingBypass, setGeofencingBypass] = useState<boolean>(false);

  useEffect(() => {
    if (!activeEmployee) return;
    const welcomeKey = `gcp_help_welcome_${activeEmployee.id}_v1`;
    try {
      if (!localStorage.getItem(welcomeKey)) {
        localStorage.setItem(welcomeKey, new Date().toISOString());
        setHelpCenterOpen(true);
      }
    } catch {
      // L’aide demeure accessible manuellement si le stockage local est bloqué.
    }
  }, [activeEmployee?.id]);

  // Time tracker for active punch
"""
replace_once(state_anchor, state_replacement, 'ouverture aide première connexion')

old_button = """          {/* Guide Interactif de Validation */}
          <button
            onClick={() => setTourStep(0)}
            className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white text-[10px] font-black rounded cursor-pointer transition shadow border border-orange-500/20"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
            </span>
            <span>{t.validationGuideBtn}</span>
          </button>
"""
new_button = """          {/* Centre d’aide permanent — remplace l’ancien guide de validation. */}
          <button
            id="open-professional-help-center"
            type="button"
            onClick={() => setHelpCenterOpen(true)}
            className="flex min-h-10 items-center gap-2 rounded-xl border border-orange-500/30 bg-orange-600/15 px-3 text-orange-200 transition hover:bg-orange-600/25 hover:text-white"
            title={currentLanguage === 'FR' ? 'Centre d’aide et de formation' : 'Help and training center'}
            aria-label={currentLanguage === 'FR' ? 'Ouvrir le centre d’aide' : 'Open the help center'}
          >
            <HelpCircle className="h-5 w-5 shrink-0" />
            <span className="hidden text-xs font-black sm:inline">{currentLanguage === 'FR' ? 'Aide' : 'Help'}</span>
          </button>
"""
replace_once(old_button, new_button, 'bouton centre aide')

# Ajoute l’aide au menu Plus sur mobile/tablette pour les administrateurs.
settings_button_anchor = """              <button
                type="button"
                onClick={() => { setActiveTab('settings'); setActiveSettingsTab(0); setShowMoreMenu(false); }}
"""
help_more_button = """              <button
                type="button"
                onClick={() => { setHelpCenterOpen(true); setShowMoreMenu(false); }}
                className="flex flex-col items-center gap-2 rounded-2xl border border-gray-800 bg-gray-900 p-4 text-gray-300 transition hover:border-orange-500/50 hover:text-orange-300"
              >
                <span className="text-3xl" aria-hidden="true">❓</span>
                <span className="text-center text-[10px] font-black uppercase leading-tight">
                  {currentLanguage === 'FR' ? 'Aide et formation' : 'Help and training'}
                </span>
              </button>

""" + settings_button_anchor
replace_once(settings_button_anchor, help_more_button, 'aide menu plus')

# Remplace intégralement l’ancien petit panneau de validation par le centre
# complet. Le composant filtre ses instructions selon le rôle connecté.
overlay_start = text.find("      {/* -------------------- INTERACTIVE VALIDATION TOUR OVERLAY -------------------- */}")
overlay_end = text.find("\n\n    </div>\n  );", overlay_start)
if overlay_start == -1 or overlay_end == -1:
    raise RuntimeError(f'Ancien panneau de validation introuvable: debut={overlay_start}, fin={overlay_end}')

help_render = """      {/* -------------------- CENTRE D’AIDE ET DE FORMATION -------------------- */}
      <Suspense fallback={<LazySectionFallback />}>
        <UserHelpCenter
          open={helpCenterOpen}
          onClose={() => setHelpCenterOpen(false)}
          language={currentLanguage}
          role={activeEmployee?.role || 'employee'}
          employeeId={activeEmployee?.id || 'guest'}
          employeeName={activeEmployee?.name || (currentLanguage === 'FR' ? 'nouvel utilisateur' : 'new user')}
          activeTab={activeTab}
          onNavigate={(tab, settingsTab) => {
            setActiveTab(tab);
            if (typeof settingsTab === 'number') setActiveSettingsTab(settingsTab);
            setShowMoreMenu(false);
            setHelpCenterOpen(false);
          }}
        />
      </Suspense>"""
text = text[:overlay_start] + help_render + text[overlay_end:]

path.write_text(text, encoding='utf-8')
print('Centre d’aide professionnel intégré; ancien guide de validation retiré.')
