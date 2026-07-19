from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_PATH = ROOT / "src" / "App.tsx"
CSS_PATH = ROOT / "src" / "index.css"
CATALOGUE_PATH = ROOT / "src" / "components" / "CatalogueManager.tsx"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: ancre attendue exactement une fois, trouvée {count} fois")
    return text.replace(old, new, 1)


def insert_before_once(text: str, anchor: str, addition: str, label: str) -> str:
    count = text.count(anchor)
    if count != 1:
        raise RuntimeError(f"{label}: ancre attendue exactement une fois, trouvée {count} fois")
    return text.replace(anchor, addition + anchor, 1)


# ---------------------------------------------------------------------------
# 1. CSS ergonomie chantier
# ---------------------------------------------------------------------------
css = CSS_PATH.read_text(encoding="utf-8")
css_marker = "/* UX MOBILE CHANTIER — zones tactiles, clavier et safe areas */"
if css_marker not in css:
    css += r'''

/* UX MOBILE CHANTIER — zones tactiles, clavier et safe areas */
:root {
  -webkit-tap-highlight-color: transparent;
  text-size-adjust: 100%;
  -webkit-text-size-adjust: 100%;
}

html {
  min-height: 100%;
  scroll-padding-bottom: calc(5rem + env(safe-area-inset-bottom, 0px));
}

body {
  min-height: 100dvh;
  overscroll-behavior-y: none;
}

button,
[role="button"],
a,
input,
select,
textarea {
  touch-action: manipulation;
}

input,
select,
textarea {
  accent-color: #f97316;
}

button:focus-visible,
[role="button"]:focus-visible,
a:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: 3px solid rgba(249, 115, 22, 0.75);
  outline-offset: 2px;
}

#fixed-bottom-navigation-main {
  height: calc(4rem + env(safe-area-inset-bottom, 0px));
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

@media (max-width: 768px), (pointer: coarse) {
  button,
  [role="button"],
  input,
  select,
  textarea {
    min-height: 44px;
  }

  input,
  select,
  textarea {
    font-size: 16px !important;
  }

  .overflow-x-auto,
  .overflow-y-auto,
  .overflow-auto {
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
'''
    CSS_PATH.write_text(css, encoding="utf-8")


# ---------------------------------------------------------------------------
# 2, 3 et 4. App.tsx — navigation, punch intelligent, bandeau Aujourd'hui
# ---------------------------------------------------------------------------
app = APP_PATH.read_text(encoding="utf-8")

if "const [showMoreMenu, setShowMoreMenu]" not in app:
    app = replace_once(
        app,
        "  const [activeSettingsTab, setActiveSettingsTab] = useState<number>(0);\n",
        "  const [activeSettingsTab, setActiveSettingsTab] = useState<number>(0);\n"
        "  const [showMoreMenu, setShowMoreMenu] = useState<boolean>(false);\n",
        "état menu Plus",
    )

old_project_state = "  const [homePunchProject, setHomePunchProject] = useState<string>('');\n"
if old_project_state in app:
    app = replace_once(
        app,
        old_project_state,
        "  const [homePunchProject, setHomePunchProject] = useState<string>(() => {\n"
        "    try {\n"
        "      return activeEmployee\n"
        "        ? localStorage.getItem(`gcp_lastPunchProject_${activeEmployee.id}`) || ''\n"
        "        : '';\n"
        "    } catch {\n"
        "      return '';\n"
        "    }\n"
        "  });\n",
        "état projet de punch intelligent",
    )

smart_punch_marker = "  // Punch intelligent : mémorise et présélectionne le dernier chantier valide."
if smart_punch_marker not in app:
    smart_punch_code = r'''  // Punch intelligent : mémorise et présélectionne le dernier chantier valide.
  useEffect(() => {
    if (!activeEmployee || activePunchSession) return;

    const availableProjects = activeEmployee.role === 'admin'
      ? projects.filter(project => project.status === 'active')
      : projects.filter(project =>
          project.status === 'active' && project.assignedEmployees.includes(activeEmployee.id)
        );

    if (availableProjects.length === 0) {
      if (homePunchProject) setHomePunchProject('');
      return;
    }

    let rememberedProject = '';
    try {
      rememberedProject = localStorage.getItem(`gcp_lastPunchProject_${activeEmployee.id}`) || '';
    } catch {
      rememberedProject = '';
    }

    const currentIsValid = availableProjects.some(project => project.id === homePunchProject);
    const nextProject = currentIsValid
      ? homePunchProject
      : availableProjects.find(project => project.id === rememberedProject)?.id || availableProjects[0].id;

    if (nextProject !== homePunchProject) setHomePunchProject(nextProject);
  }, [activeEmployee, activePunchSession, homePunchProject, projects]);

'''
    app = insert_before_once(
        app,
        "  const handlePunchInStart = () => {\n",
        smart_punch_code,
        "effet punch intelligent",
    )

remember_anchor = r'''    startPunchSession({
      employeeId: activeEmployee.id,
      projectId: homePunchProject,
      payMode: homePayMode,
      rate: homeRateCustom,
      withinGeofence: true
    });
    
    playSoundCue('in');
'''
if "gcp_lastPunchProject_${activeEmployee.id}" not in app[app.find("const handlePunchInStart"):app.find("const handlePunchOutConfirm")]:
    remember_replacement = r'''    startPunchSession({
      employeeId: activeEmployee.id,
      projectId: homePunchProject,
      payMode: homePayMode,
      rate: homeRateCustom,
      withinGeofence: true
    });

    try {
      localStorage.setItem(`gcp_lastPunchProject_${activeEmployee.id}`, homePunchProject);
    } catch {
      // Le punch demeure fonctionnel si le stockage local est indisponible.
    }
    
    playSoundCue('in');
'''
    app = replace_once(app, remember_anchor, remember_replacement, "mémorisation du chantier après punch")

# Navigation admin 4+1
if "Administrative Buttons - mobile 4+1 navigation" not in app:
    start_marker = "              /* Administrative Buttons - 9 items logically mapped as categories */"
    employee_marker = "              /* Employee Buttons - 5 items mapped physically */"
    start = app.find(start_marker)
    end = app.find(employee_marker, start)
    if start == -1 or end == -1:
        raise RuntimeError("bloc de navigation admin introuvable")

    admin_nav = r'''              /* Administrative Buttons - mobile 4+1 navigation */
              <>
                <button
                  onClick={() => { setActiveTab('home'); setShowMoreMenu(false); }}
                  className={`flex flex-col items-center gap-1 cursor-pointer transition ${
                    activeTab === 'home' ? 'text-orange-500 font-bold scale-105' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <span className="text-2xl">🏠</span>
                  <span className="text-[11px] font-black uppercase tracking-wide leading-none">{t.navAdminHome}</span>
                </button>

                <button
                  onClick={() => { setActiveTab('documents'); setShowMoreMenu(false); }}
                  className={`flex flex-col items-center gap-1 cursor-pointer transition ${
                    activeTab === 'documents' ? 'text-orange-500 font-bold scale-105' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <span className="text-2xl">📄</span>
                  <span className="text-[11px] font-black uppercase tracking-wide leading-none">{t.navAdminDocs}</span>
                </button>

                <button
                  onClick={() => { setActiveTab('projects'); setShowMoreMenu(false); }}
                  className={`flex flex-col items-center gap-1 cursor-pointer transition ${
                    activeTab === 'projects' ? 'text-orange-500 font-bold scale-105' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <span className="text-2xl">📋</span>
                  <span className="text-[11px] font-black uppercase tracking-wide leading-none">{t.navAdminProjects}</span>
                </button>

                <button
                  onClick={() => { setActiveTab('stats'); setShowMoreMenu(false); }}
                  className={`flex flex-col items-center gap-1 cursor-pointer transition ${
                    activeTab === 'stats' ? 'text-orange-500 font-bold scale-105' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <span className="text-2xl">📊</span>
                  <span className="text-[11px] font-black uppercase tracking-wide leading-none">{t.navShortStats}</span>
                </button>

                <button
                  onClick={() => setShowMoreMenu(value => !value)}
                  className={`relative flex flex-col items-center gap-1 cursor-pointer transition ${
                    showMoreMenu || ['invoice', 'inventory', 'commandes', 'motivation', 'settings'].includes(activeTab)
                      ? 'text-orange-500 font-bold scale-105'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  aria-expanded={showMoreMenu}
                  aria-controls="admin-more-menu"
                >
                  <span className="text-2xl">☰</span>
                  <span className="text-[11px] font-black uppercase tracking-wide leading-none">
                    {currentLanguage === 'FR' ? 'Plus' : 'More'}
                  </span>
                  {hrAlerts.filter(a => !a.resolved).length > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                    </span>
                  )}
                </button>
              </>
            ) : (
'''
    app = app[:start] + admin_nav + app[end:]

# Menu coulissant admin
more_menu_marker = "      {/* ADMIN MORE MENU — mobile 4+1 */}"
fixed_nav_anchor = "      {/* -------------------- ADMIN / EMPLOYEE FIXED BOTTOM NAV BAR -------------------- */}"
if more_menu_marker not in app:
    more_menu = r'''      {/* ADMIN MORE MENU — mobile 4+1 */}
      {activeEmployee && activeEmployee.role === 'admin' && showMoreMenu && (
        <>
          <button
            type="button"
            aria-label={currentLanguage === 'FR' ? 'Fermer le menu Plus' : 'Close More menu'}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 cursor-default"
            onClick={() => setShowMoreMenu(false)}
          />
          <section
            id="admin-more-menu"
            className="fixed bottom-16 left-0 right-0 z-40 bg-[#16191F] border-t border-gray-800 rounded-t-3xl p-4 pb-6 shadow-2xl"
            style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
            role="dialog"
            aria-modal="true"
            aria-label={currentLanguage === 'FR' ? 'Navigation supplémentaire' : 'More navigation'}
          >
            <div className="w-12 h-1.5 bg-gray-600 rounded-full mx-auto mb-4" />
            <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
              {[
                { tab: 'invoice' as const, icon: '🧾', label: t.navAdminInvoices },
                { tab: 'inventory' as const, icon: '📦', label: t.navShortInventory },
                { tab: 'commandes' as const, icon: '🚚', label: t.navShortOrders },
                { tab: 'motivation' as const, icon: '🎯', label: t.navShortGoals }
              ].map(item => (
                <button
                  key={item.tab}
                  type="button"
                  onClick={() => { setActiveTab(item.tab); setShowMoreMenu(false); }}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition ${
                    activeTab === item.tab
                      ? 'bg-orange-600/20 border-orange-600 text-orange-400'
                      : 'bg-gray-900 border-gray-800 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <span className="text-3xl" aria-hidden="true">{item.icon}</span>
                  <span className="text-[10px] uppercase font-black text-center leading-tight">{item.label}</span>
                </button>
              ))}

              <button
                type="button"
                onClick={() => { setActiveTab('settings'); setActiveSettingsTab(0); setShowMoreMenu(false); }}
                className={`relative flex flex-col items-center gap-2 p-4 rounded-2xl border transition ${
                  activeTab === 'settings'
                    ? 'bg-orange-600/20 border-orange-600 text-orange-400'
                    : 'bg-gray-900 border-gray-800 text-gray-300 hover:border-gray-600'
                }`}
              >
                <span className="text-3xl" aria-hidden="true">⚙️</span>
                <span className="text-[10px] uppercase font-black text-center leading-tight">{t.navShortSettings}</span>
                {hrAlerts.filter(a => !a.resolved).length > 0 && (
                  <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                  </span>
                )}
              </button>
            </div>
          </section>
        </>
      )}

'''
    app = insert_before_once(app, fixed_nav_anchor, more_menu, "menu Plus admin")

# Bandeau Aujourd'hui admin
if 'id="admin-today-banner"' not in app:
    today_anchor = "                {/* 2. EMPLOYEE DASHBOARD (WITH CENTRAL ROUND PUNCH BUTTON) */}"
    today_banner = r'''                {activeEmployee.role === 'admin' && (() => {
                  const activePunchCount = punchSessions.filter(punch => punch.endTime === null).length;
                  const overdueInvoiceCount = documents.filter(document =>
                    document.type === 'invoice' && document.status === 'overdue'
                  ).length;
                  const outstandingAmount = documents
                    .filter(document => document.type === 'invoice' && ['overdue', 'sent'].includes(document.status))
                    .reduce((sum, document) => sum + Number(document.balanceDue ?? document.total ?? 0), 0);
                  const unresolvedHrAlertCount = hrAlerts.filter(alert => !alert.resolved).length;
                  const todayLabel = new Date().toLocaleDateString(
                    currentLanguage === 'FR' ? 'fr-CA' : 'en-CA',
                    { weekday: 'long', day: 'numeric', month: 'long' }
                  );

                  return (
                    <section id="admin-today-banner" className="bg-[#16191F] border border-gray-800 rounded-2xl p-4 space-y-4">
                      <h3 className="text-base font-black text-white flex flex-wrap items-baseline gap-2">
                        <span>📅 {currentLanguage === 'FR' ? "Aujourd'hui" : 'Today'}</span>
                        <span className="text-xs text-gray-400 font-semibold capitalize">{todayLabel}</span>
                      </h3>

                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="rounded-xl p-3 flex flex-col gap-1 bg-gray-950/60 border border-gray-850">
                          <span className="text-[10px] uppercase font-bold text-gray-500">
                            {currentLanguage === 'FR' ? 'Punchs actifs' : 'Active punches'}
                          </span>
                          <span className={`text-2xl font-black ${activePunchCount > 0 ? 'text-green-400' : 'text-gray-500'}`}>
                            {activePunchCount > 0 ? '🟢 ' : ''}{activePunchCount}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setActiveTab('documents')}
                          className={`rounded-xl p-3 flex flex-col gap-1 text-left transition ${
                            overdueInvoiceCount > 0
                              ? 'bg-red-950/35 border border-red-700/70 hover:bg-red-950/50'
                              : 'bg-gray-950/60 border border-gray-850 hover:border-gray-700'
                          }`}
                        >
                          <span className="text-[10px] uppercase font-bold text-gray-500">
                            {currentLanguage === 'FR' ? 'Factures en retard' : 'Overdue invoices'}
                          </span>
                          <span className={`text-2xl font-black ${overdueInvoiceCount > 0 ? 'text-red-400' : 'text-gray-500'}`}>
                            {overdueInvoiceCount > 0 ? '🔴 ' : ''}{overdueInvoiceCount}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveTab('documents')}
                          className="rounded-xl p-3 flex flex-col gap-1 text-left bg-gray-950/60 border border-gray-850 hover:border-amber-600/60 transition"
                        >
                          <span className="text-[10px] uppercase font-bold text-gray-500">
                            {currentLanguage === 'FR' ? 'À encaisser' : 'To collect'}
                          </span>
                          <span className="text-2xl font-black text-amber-400">
                            {outstandingAmount.toLocaleString(currentLanguage === 'FR' ? 'fr-CA' : 'en-CA', { maximumFractionDigits: 0 })}$
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => { setActiveTab('settings'); setActiveSettingsTab(0); }}
                          className={`rounded-xl p-3 flex flex-col gap-1 text-left transition ${
                            unresolvedHrAlertCount > 0
                              ? 'bg-amber-950/30 border border-amber-700/70 hover:bg-amber-950/45'
                              : 'bg-gray-950/60 border border-gray-850 hover:border-gray-700'
                          }`}
                        >
                          <span className="text-[10px] uppercase font-bold text-gray-500">
                            {currentLanguage === 'FR' ? 'Alertes RH' : 'HR alerts'}
                          </span>
                          <span className={`text-2xl font-black ${unresolvedHrAlertCount > 0 ? 'text-amber-400' : 'text-gray-500'}`}>
                            {unresolvedHrAlertCount > 0 ? '⚠️ ' : ''}{unresolvedHrAlertCount}
                          </span>
                        </button>
                      </div>
                    </section>
                  );
                })()}

'''
    app = insert_before_once(app, today_anchor, today_banner, "bandeau Aujourd'hui admin")

APP_PATH.write_text(app, encoding="utf-8")


# ---------------------------------------------------------------------------
# 5. Catalogue vide pré-rempli
# ---------------------------------------------------------------------------
catalogue = CATALOGUE_PATH.read_text(encoding="utf-8")
empty_marker = "      {/* EMPTY SIDING CATALOGUE SEED */}"
items_anchor = "      {/* Catalogue Items List (une ligne par matériau pour rester lisible sur mobile) */}"
if empty_marker not in catalogue:
    empty_state = r'''      {/* EMPTY SIDING CATALOGUE SEED */}
      {catalogue.length === 0 && canManage && (
        <div className="bg-gray-900/60 border-2 border-dashed border-gray-700 rounded-2xl p-8 text-center space-y-4">
          <div className="text-6xl" aria-hidden="true">🏗️</div>
          <div>
            <h4 className="text-xl font-black text-white">
              {currentLanguage === 'FR' ? 'Votre catalogue est vide' : 'Your catalog is empty'}
            </h4>
            <p className="mt-2 text-sm text-gray-400 max-w-lg mx-auto">
              {currentLanguage === 'FR'
                ? 'Chargez une base de matériaux de revêtement. Tous les noms, unités et prix pourront être modifiés ensuite.'
                : 'Load a starter siding-material list. Every name, unit, and price can be edited afterward.'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              const seed: Array<Omit<CatalogueMaterial, 'id'>> = [
                { name: currentLanguage === 'FR' ? 'Vinyle standard' : 'Standard vinyl', emoji: '🧱', pricePerSqFt: 1.5, supplierPrice: 1.1, clientPrice: 4.5, unit: 'pi2' },
                { name: currentLanguage === 'FR' ? 'Vinyle premium' : 'Premium vinyl', emoji: '🧱', pricePerSqFt: 1.75, supplierPrice: 1.6, clientPrice: 5.5, unit: 'pi2' },
                { name: currentLanguage === 'FR' ? 'Hardie Plank (fibre de ciment)' : 'Hardie Plank (fiber cement)', emoji: '🪨', pricePerSqFt: 2.5, supplierPrice: 2.4, clientPrice: 8, unit: 'pi2' },
                { name: 'Hardie Panel', emoji: '🪨', pricePerSqFt: 2.5, supplierPrice: 2.6, clientPrice: 8.5, unit: 'pi2' },
                { name: currentLanguage === 'FR' ? 'Soffite aluminium' : 'Aluminum soffit', emoji: '🔩', pricePerSqFt: 2, supplierPrice: 1.4, clientPrice: 6, unit: 'pi2' },
                { name: currentLanguage === 'FR' ? 'Fascia aluminium' : 'Aluminum fascia', emoji: '📏', pricePerSqFt: 2, supplierPrice: 1.2, clientPrice: 6, unit: 'pi_lin' },
                { name: currentLanguage === 'FR' ? 'Membrane pare-intempéries (Tyvek)' : 'Weather barrier membrane (Tyvek)', emoji: '🛡️', pricePerSqFt: 0.25, supplierPrice: 0.18, clientPrice: 0.75, unit: 'rouleau', unitNote: currentLanguage === 'FR' ? 'Rouleau 9pi x 100pi' : '9 ft x 100 ft roll' },
                { name: 'J-Trim', emoji: '📐', pricePerSqFt: 0.5, supplierPrice: 8, clientPrice: 15, unit: 'unite', unitNote: currentLanguage === 'FR' ? 'Longueur 12pi' : '12 ft length' },
                { name: currentLanguage === 'FR' ? 'Coin extérieur' : 'Outside corner', emoji: '📐', pricePerSqFt: 0.5, supplierPrice: 14, clientPrice: 28, unit: 'unite', unitNote: currentLanguage === 'FR' ? 'Longueur 10pi' : '10 ft length' },
                { name: currentLanguage === 'FR' ? 'Départ (starter strip)' : 'Starter strip', emoji: '📏', pricePerSqFt: 0.4, supplierPrice: 6, clientPrice: 12, unit: 'unite' },
                { name: currentLanguage === 'FR' ? 'Clous galvanisés 2po' : '2 in galvanized nails', emoji: '🔨', pricePerSqFt: 0.05, supplierPrice: 45, clientPrice: 70, unit: 'boite', unitNote: currentLanguage === 'FR' ? 'Boîte 50lb' : '50 lb box' },
                { name: currentLanguage === 'FR' ? 'Scellant extérieur' : 'Exterior sealant', emoji: '🧴', pricePerSqFt: 0.1, supplierPrice: 7, clientPrice: 14, unit: 'unite', unitNote: 'Tube 300ml' }
              ];
              seed.forEach(item => addCatalogueMaterial(item));
            }}
            className="px-6 py-3.5 bg-orange-600 hover:bg-orange-500 text-white font-black rounded-xl transition shadow-lg"
          >
            {currentLanguage === 'FR' ? '📦 Charger le catalogue revêtement' : '📦 Load siding catalog'}
          </button>

          <p className="text-xs text-gray-500">
            {currentLanguage === 'FR'
              ? '12 matériaux avec prix de départ — à ajuster selon vos fournisseurs'
              : '12 materials with starter prices — adjust them for your suppliers'}
          </p>
        </div>
      )}

'''
    catalogue = insert_before_once(catalogue, items_anchor, empty_state, "état vide du catalogue")

CATALOGUE_PATH.write_text(catalogue, encoding="utf-8")

print("Améliorations UX mobile appliquées avec succès aux trois fichiers.")
