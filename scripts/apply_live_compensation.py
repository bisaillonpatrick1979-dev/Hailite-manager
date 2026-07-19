from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: ancre trouvée {count} fois')
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# APP — compteur d'argent doré, temps travaillé et rendement selon le mode.
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'App.tsx'
text = path.read_text(encoding='utf-8')

if "from './components/LiveCompensationPanel'" not in text:
    anchor = "import EmployeeAvatar from './components/EmployeeAvatar';\n"
    text = replace_once(
        text,
        anchor,
        anchor + "import LiveCompensationPanel from './components/LiveCompensationPanel';\n",
        'import LiveCompensationPanel'
    )

state_anchor = "  const [earningsSimulation, setEarningsSimulation] = useState<number>(0);\n"
if 'const [elapsedWorkSeconds,' not in text:
    text = replace_once(
        text,
        state_anchor,
        state_anchor + "  const [elapsedWorkSeconds, setElapsedWorkSeconds] = useState<number>(0);\n",
        'état secondes travaillées'
    )

tracker_pattern = re.compile(
    r"  // Time tracker for active punch\n"
    r"  const timerIntervalRef = useRef<any>\(null\);\n\n"
    r"  useEffect\(\(\) => \{[\s\S]*?\n"
    r"  \}, \[activeEmployee, punchSessions\]\);\n"
)
tracker_replacement = """  // Chronomètre de travail et compteur de rémunération, actualisés à la
  // seconde. Une pause en cours est retranchée immédiatement et le compteur
  // reste figé jusqu'à la reprise.
  const timerIntervalRef = useRef<any>(null);

  useEffect(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (!activeEmployee) {
      setActivePunchSession(null);
      setTimerDisplay('00:00:00');
      setElapsedWorkSeconds(0);
      setEarningsSimulation(0);
      return;
    }

    const liveSession = punchSessions.find(p => p.employeeId === activeEmployee.id && p.endTime === null) || null;
    setActivePunchSession(liveSession);

    if (!liveSession) {
      setTimerDisplay('00:00:00');
      setElapsedWorkSeconds(0);
      setEarningsSimulation(0);
      return;
    }

    const updateLiveCounters = () => {
      const now = Date.now();
      const start = new Date(liveSession.startTime).getTime();
      let pausedMs = Math.max(0, Number(liveSession.totalPauseMinutes || 0)) * 60 * 1000;
      if (liveSession.pausedAt) {
        pausedMs += Math.max(0, now - new Date(liveSession.pausedAt).getTime());
      }

      const elapsedMs = Math.max(0, now - start - pausedMs);
      const totalSeconds = Math.floor(elapsedMs / 1000);
      const hrs = Math.floor(totalSeconds / 3600);
      const mins = Math.floor((totalSeconds % 3600) / 60);
      const secs = totalSeconds % 60;
      setElapsedWorkSeconds(totalSeconds);
      setTimerDisplay(`${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);

      const hoursDecimal = elapsedMs / 3600000;
      const grossAmount = liveSession.payMode === 'horaire'
        ? hoursDecimal * Math.max(0, Number(liveSession.rate || 0))
        : liveSession.payMode === 'forfait'
          ? Math.max(0, Number(liveSession.rate || 0))
          : 0;
      setEarningsSimulation(Number(grossAmount.toFixed(2)));
    };

    updateLiveCounters();
    if (!liveSession.pausedAt) {
      timerIntervalRef.current = setInterval(updateLiveCounters, 1000);
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [activeEmployee, punchSessions]);
"""
text, tracker_count = tracker_pattern.subn(tracker_replacement, text, count=1)
if tracker_count != 1 and 'Chronomètre de travail et compteur de rémunération' not in text:
    raise RuntimeError(f'Bloc chronomètre non remplacé: {tracker_count}')

rate_effect_anchor = "  // If active project is selected, set Default rates based on employee or mode\n"
preference_effect = """  // Présélectionne automatiquement le mode prévu au dossier de l'employé ou
  // du sous-traitant. Un profil sans préférence demeure payé à l'heure.
  useEffect(() => {
    if (!activeEmployee || activePunchSession) return;
    const preferredMode = activeEmployee.workMode === 'sqft'
      ? 'surface'
      : activeEmployee.workMode === 'flat'
        ? 'forfait'
        : 'horaire';
    setHomePayMode(preferredMode);
  }, [activeEmployee?.id, activeEmployee?.workMode, activePunchSession?.id]);

""" + rate_effect_anchor
if 'Présélectionne automatiquement le mode prévu' not in text:
    text = replace_once(text, rate_effect_anchor, preference_effect, 'mode de rémunération préféré')

old_rate_effect = """        if (homePayMode === 'horaire') {
          setHomeRateCustom(activeEmployee.hourlyRate);
        } else if (homePayMode === 'forfait') {
          setHomeRateCustom(250); // General daily forfeit
        } else {
          setHomeRateCustom(12); // Mode surface default rate per pi²
        }
"""
new_rate_effect = """        if (homePayMode === 'horaire') {
          setHomeRateCustom(Math.max(0, activeEmployee.hourlyRate));
        } else {
          // Surface : la valeur vient des produits déclarés au Punch Out.
          // Forfait : le montant total de la job doit être confirmé avant le départ.
          setHomeRateCustom(0);
        }
"""
if old_rate_effect in text:
    text = text.replace(old_rate_effect, new_rate_effect, 1)

old_session_rate = """                          <p className=\"text-sm font-bold text-gray-300 font-mono tracking-wide\">
                            {t.sessionRate} {activePunchSession.rate}$ / {activePunchSession.payMode}
                          </p>
"""
new_session_rate = """                          <p className=\"text-sm font-bold text-gray-300 font-mono tracking-wide\">
                            {activePunchSession.payMode === 'horaire'
                              ? `${activePunchSession.rate.toFixed(2)} $/h`
                              : activePunchSession.payMode === 'forfait'
                                ? `${currentLanguage === 'FR' ? 'Forfait' : 'Fixed price'} : ${activePunchSession.rate.toFixed(2)} $`
                                : (currentLanguage === 'FR' ? 'Produits et quantités à déclarer au Punch Out' : 'Products and quantities declared at Punch Out')}
                          </p>
"""
if old_session_rate in text:
    text = text.replace(old_session_rate, new_session_rate, 1)

punch_comment = "                    {/* CENTRAL PUNCH BUTTON with Theme Styles */}\n"
panel_markup = """                    {activePunchSession && (
                      <div className=\"w-full max-w-3xl mb-7\">
                        <LiveCompensationPanel
                          session={activePunchSession}
                          elapsedSeconds={elapsedWorkSeconds}
                          grossAmount={earningsSimulation}
                          currentLanguage={currentLanguage}
                          currency={companyInfo.currency || 'CAD'}
                        />
                      </div>
                    )}

""" + punch_comment
if 'id="live-compensation-panel"' not in text and '<LiveCompensationPanel' not in text:
    text = replace_once(text, punch_comment, panel_markup, 'panneau rémunération en direct')

button_metrics_pattern = re.compile(
    r"                        \{/\* Real-time Dynamic Timer \*/\}\n"
    r"                        <span className=\"text-sm font-mono text-gray-300 mt-1 uppercase tracking-widest font-black\">\n"
    r"                          \{activePunchSession \? timerDisplay : \"00:00:00\"\}\n"
    r"                        </span>\n\n"
    r"                        \{/\* Real-time earnings simulator underneath \*/\}\n"
    r"                        \{activePunchSession && \(\n"
    r"                          <span className=\"text-xs uppercase font-black text-green-400 mt-1 px-2\.5 py-1 rounded bg-green-950/40 border border-green-500/20\">\n"
    r"                            \+ \{earningsSimulation\}\$\n"
    r"                          </span>\n"
    r"                        \)\}\n"
)
button_metrics_replacement = """                        {/* Le temps reste visible dans le bouton; l'argent, plus important,
                            occupe le grand panneau doré juste au-dessus. */}
                        <span className=\"text-sm font-mono text-gray-300 mt-1 uppercase tracking-widest font-black\">
                          {activePunchSession ? timerDisplay : '00:00:00'}
                        </span>
                        {activePunchSession && (
                          <span className=\"mt-2 rounded-full border border-amber-400/25 bg-black/25 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-amber-200\">
                            {activePunchSession.payMode === 'horaire'
                              ? (currentLanguage === 'FR' ? 'Argent en direct ↑' : 'Live money ↑')
                              : activePunchSession.payMode === 'forfait'
                                ? (currentLanguage === 'FR' ? 'Rendement $/h' : 'Hourly yield')
                                : (currentLanguage === 'FR' ? 'Déclaration à la fin' : 'Declare at finish')}
                          </span>
                        )}
"""
text, button_count = button_metrics_pattern.subn(button_metrics_replacement, text, count=1)
if button_count != 1 and 'Argent en direct ↑' not in text:
    raise RuntimeError(f'Métriques du bouton non remplacées: {button_count}')

old_rate_input = """              {/* Custom rate value */}
              <div>
                <label className=\"text-[10px] text-gray-500 font-mono uppercase\">{t.modalConfirmRate}</label>
                <input 
                  type=\"number\"
                  value={homeRateCustom}
                  onChange={e => setHomeRateCustom(Number(e.target.value))}
                  className=\"w-full mt-1.5 p-2 bg-gray-900 rounded border border-gray-850 text-xs font-mono font-semibold text-white\"
                />
              </div>
"""
new_rate_input = """              {/* Le montant demandé dépend du mode de rémunération. */}
              {homePayMode !== 'surface' ? (
                <div className=\"rounded-xl border border-gray-800 bg-gray-950/55 p-3\">
                  <label className=\"text-[10px] text-gray-400 font-mono uppercase font-black\">
                    {homePayMode === 'horaire'
                      ? (currentLanguage === 'FR' ? 'Taux horaire confirmé ($/h)' : 'Confirmed hourly rate ($/h)')
                      : (currentLanguage === 'FR' ? 'Montant total du forfait ($)' : 'Total fixed job amount ($)')}
                  </label>
                  <input
                    type=\"number\"
                    min=\"0\"
                    step=\"0.01\"
                    value={homeRateCustom || ''}
                    onChange={e => setHomeRateCustom(Number(e.target.value))}
                    className=\"w-full mt-2 p-3 bg-gray-900 rounded-xl border border-gray-700 text-lg font-mono font-black text-amber-300 text-center\"
                  />
                  <p className=\"mt-2 text-[10px] leading-relaxed text-gray-500\">
                    {homePayMode === 'horaire'
                      ? (currentLanguage === 'FR' ? 'Le compteur d’argent augmentera à chaque seconde selon ce taux.' : 'The money counter will increase every second using this rate.')
                      : (currentLanguage === 'FR' ? 'Le rendement horaire restera à 0 pendant la première heure, puis le forfait sera divisé par le temps réellement travaillé.' : 'Hourly yield stays at 0 during the first hour, then the fixed amount is divided by actual worked time.')}
                  </p>
                </div>
              ) : (
                <div className=\"rounded-xl border border-blue-500/25 bg-blue-500/10 p-3 text-[11px] leading-relaxed text-blue-200\">
                  {currentLanguage === 'FR'
                    ? 'Aucun faux montant ne sera affiché pendant la journée. Au Punch Out, vous pourrez déclarer plusieurs produits, leurs quantités et leurs prix; le total et le rendement horaire seront calculés automatiquement.'
                    : 'No estimated amount is shown during the day. At Punch Out, declare multiple products, quantities and prices; total and hourly yield are calculated automatically.'}
                </div>
              )}
"""
if old_rate_input in text:
    text = text.replace(old_rate_input, new_rate_input, 1)

text = text.replace(
    "disabled={!homePunchProject}\n                className=\"flex-1 py-2 bg-orange-600",
    "disabled={!homePunchProject || (homePayMode !== 'surface' && homeRateCustom <= 0)}\n                className=\"flex-1 py-2 bg-orange-600",
    1
)

text = text.replace(
    "<div className=\"grid grid-cols-2 gap-2\">\n                      {catalogue.slice(0, 4).map(catItem => {",
    "<div className=\"grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1\">\n                      {catalogue.map(catItem => {",
    1
)

old_reported_items = """                          reportedMaterials.map((m, idx) => (
                            <div key={idx} className=\"flex justify-between items-center text-gray-300 font-mono\">
                              <span className=\"font-sans\">{m.emoji} {m.name} ({m.quantity} {m.unit || unitLabels['pi2']})</span>
                              <span className=\"font-bold\">{(m.quantity * m.unitPrice).toFixed(2)}$</span>
                            </div>
                          ))
"""
new_reported_items = """                          reportedMaterials.map((m, idx) => (
                            <div key={`${m.name}-${idx}`} className=\"rounded-xl border border-gray-800 bg-gray-900 p-3 space-y-2\">
                              <div className=\"flex items-start justify-between gap-3\">
                                <div className=\"min-w-0\">
                                  <p className=\"font-sans text-xs font-black text-white\">{m.emoji} {m.name}</p>
                                  <p className=\"text-[9px] text-gray-500\">{m.unit || unitLabels['pi2']}</p>
                                </div>
                                <button
                                  type=\"button\"
                                  onClick={() => setReportedMaterials(current => current.filter((_, itemIndex) => itemIndex !== idx))}
                                  className=\"rounded-lg border border-red-500/20 bg-red-500/10 p-1.5 text-red-400 hover:bg-red-500/20\"
                                  aria-label={currentLanguage === 'FR' ? 'Retirer ce produit' : 'Remove this product'}
                                >
                                  <Trash className=\"h-3.5 w-3.5\" />
                                </button>
                              </div>
                              <div className=\"grid grid-cols-2 gap-2\">
                                <label className=\"text-[9px] font-black uppercase text-gray-500\">
                                  {currentLanguage === 'FR' ? 'Quantité' : 'Quantity'}
                                  <input
                                    type=\"number\"
                                    min=\"0\"
                                    step=\"0.01\"
                                    value={m.quantity || ''}
                                    onChange={event => setReportedMaterials(current => current.map((item, itemIndex) => itemIndex === idx ? { ...item, quantity: Math.max(0, Number(event.target.value)) } : item))}
                                    className=\"mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 p-2 text-right font-mono text-xs font-black text-white\"
                                  />
                                </label>
                                <label className=\"text-[9px] font-black uppercase text-gray-500\">
                                  {currentLanguage === 'FR' ? 'Prix unitaire' : 'Unit price'}
                                  <input
                                    type=\"number\"
                                    min=\"0\"
                                    step=\"0.01\"
                                    value={m.unitPrice || ''}
                                    onChange={event => setReportedMaterials(current => current.map((item, itemIndex) => itemIndex === idx ? { ...item, unitPrice: Math.max(0, Number(event.target.value)) } : item))}
                                    className=\"mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 p-2 text-right font-mono text-xs font-black text-amber-300\"
                                  />
                                </label>
                              </div>
                              <div className=\"flex items-center justify-between border-t border-gray-800 pt-2 text-[10px]\">
                                <span className=\"font-bold text-gray-500\">{currentLanguage === 'FR' ? 'Sous-total' : 'Subtotal'}</span>
                                <span className=\"font-mono text-sm font-black text-amber-300\">{(m.quantity * m.unitPrice).toFixed(2)} $</span>
                              </div>
                            </div>
                          ))
"""
if old_reported_items in text:
    text = text.replace(old_reported_items, new_reported_items, 1)

old_total_card = """              {/* Total simulated earnings displaying large */}
              <div className=\"p-3 bg-green-950/20 border border-green-500/20 rounded-xl text-center font-sans animate-none mt-3\">
                <span className=\"text-[10px] font-mono text-gray-400 uppercase tracking-widest block\">{t.modalRevenueEarned}</span>
                <span className=\"text-2xl font-black text-green-400 font-mono\">
                  {activePunchSession.payMode === 'surface'
                    ? reportedMaterials.reduce((sum, m) => sum + (m.quantity * m.unitPrice), 0).toFixed(2)
                    : earningsSimulation}$
                </span>
              </div>
"""
new_total_card = """              {/* Résumé financier : total réel et rendement horaire selon le mode. */}
              {(() => {
                const declaredSurfaceTotal = reportedMaterials.reduce((sum, material) => sum + (material.quantity * material.unitPrice), 0);
                return (
                  <div className=\"mt-3 space-y-3\">
                    <LiveCompensationPanel
                      session={activePunchSession}
                      elapsedSeconds={elapsedWorkSeconds}
                      grossAmount={activePunchSession.payMode === 'surface' ? declaredSurfaceTotal : earningsSimulation}
                      surfaceTotal={declaredSurfaceTotal}
                      currentLanguage={currentLanguage}
                      currency={companyInfo.currency || 'CAD'}
                      compact
                    />
                    {activePunchSession.payMode === 'surface' && reportedMaterials.length > 0 && (
                      <div className=\"grid grid-cols-2 gap-2 text-center\">
                        <div className=\"rounded-xl border border-gray-800 bg-gray-900 p-3\">
                          <p className=\"text-[9px] font-black uppercase text-gray-500\">{currentLanguage === 'FR' ? 'Produits déclarés' : 'Declared products'}</p>
                          <p className=\"mt-1 text-xl font-black text-white\">{reportedMaterials.length}</p>
                        </div>
                        <div className=\"rounded-xl border border-amber-500/25 bg-amber-500/10 p-3\">
                          <p className=\"text-[9px] font-black uppercase text-amber-200/70\">{currentLanguage === 'FR' ? 'Total de la journée' : 'Day total'}</p>
                          <p className=\"mt-1 font-mono text-xl font-black text-amber-300\">{declaredSurfaceTotal.toFixed(2)} $</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
"""
if old_total_card in text:
    text = text.replace(old_total_card, new_total_card, 1)

path.write_text(text, encoding='utf-8')


# ---------------------------------------------------------------------------
# STORE — conserve les secondes de pause au lieu de les arrondir à la minute.
# ---------------------------------------------------------------------------
path = ROOT / 'src' / 'store.ts'
text = path.read_text(encoding='utf-8')
text = text.replace(
    "const diffMinutes = Math.floor((pauseEnd - pauseStart) / 60000);",
    "const diffMinutes = Math.max(0, (pauseEnd - pauseStart) / 60000);"
)
text = text.replace(
    "totalPauseMinutes += Math.floor((end - pauseStart) / 60000);",
    "totalPauseMinutes += Math.max(0, (end - pauseStart) / 60000);"
)
path.write_text(text, encoding='utf-8')

print('Chronomètres de temps, argent doré, surface et rendement forfait intégrés.')
