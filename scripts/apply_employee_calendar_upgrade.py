from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'src' / 'App.tsx'
CSS = ROOT / 'src' / 'index.css'
COMPONENT = ROOT / 'src' / 'components' / 'EmployeeWorkCalendar.tsx'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: ancre trouvée {count} fois')
    return text.replace(old, new, 1)

component = r'''import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Employee, Project, PunchSession } from '../types';

type Language = 'FR' | 'EN';

type Props = {
  employee: Employee;
  punchSessions: PunchSession[];
  projects: Project[];
  currentLanguage: Language;
  embedded?: boolean;
};

type DayCategory = {
  emoji: string;
  color: string;
  animation: string;
  labelFR: string;
  labelEN: string;
  range: string;
};

const DAY_CATEGORIES: Array<DayCategory & { min: number; max: number }> = [
  { min: 0, max: 2, emoji: '🐢', color: '#64748b', animation: 'cal-turtle', labelFR: 'Très petite journée', labelEN: 'Tiny day', range: '< 2 h' },
  { min: 2, max: 4, emoji: '☕', color: '#6366f1', animation: 'cal-steam', labelFR: 'Petite journée', labelEN: 'Short day', range: '2–4 h' },
  { min: 4, max: 5.5, emoji: '🌤️', color: '#3b82f6', animation: 'cal-float', labelFR: 'Journée moyenne', labelEN: 'Average day', range: '4–5,5 h' },
  { min: 5.5, max: 7, emoji: '🏗️', color: '#22c55e', animation: 'cal-work', labelFR: 'Journée normale', labelEN: 'Normal day', range: '5,5–7 h' },
  { min: 7, max: 8, emoji: '💪', color: '#84cc16', animation: 'cal-flex', labelFR: 'Un peu plus', labelEN: 'Above average', range: '7–8 h' },
  { min: 8, max: 10, emoji: '🔥', color: '#f97316', animation: 'cal-fire', labelFR: 'Grosse journée', labelEN: 'Big day', range: '8–10 h' },
  { min: 10, max: 12, emoji: '⚡', color: '#ef4444', animation: 'cal-zap', labelFR: 'Très grosse journée', labelEN: 'Huge day', range: '10–12 h' },
  { min: 12, max: Number.POSITIVE_INFINITY, emoji: '💥', color: '#7c3aed', animation: 'cal-explode', labelFR: 'Journée explosive', labelEN: 'Explosive day', range: '12 h +' }
];

const DAY_OFF: DayCategory = {
  emoji: '🏖️', color: '#06b6d4', animation: 'cal-sway',
  labelFR: 'Congé', labelEN: 'Day off', range: '0 h'
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function localDateKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function sessionHours(session: PunchSession): number {
  if (typeof session.totalWorkedHours === 'number' && Number.isFinite(session.totalWorkedHours)) {
    return Math.max(0, session.totalWorkedHours);
  }
  const start = new Date(session.startTime).getTime();
  const end = session.endTime ? new Date(session.endTime).getTime() : Date.now();
  const pauseMs = Math.max(0, Number(session.totalPauseMinutes || 0)) * 60_000;
  return Math.max(0, end - start - pauseMs) / 3_600_000;
}

function categoryForHours(hours: number): DayCategory {
  return DAY_CATEGORIES.find(category => hours >= category.min && hours < category.max) || DAY_CATEGORIES[DAY_CATEGORIES.length - 1];
}

export default function EmployeeWorkCalendar({ employee, punchSessions, projects, currentLanguage, embedded = false }: Props) {
  const [visibleMonth, setVisibleMonth] = useState(() => monthKey(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const locale = currentLanguage === 'FR' ? 'fr-CA' : 'en-CA';
  const t = (fr: string, en: string) => currentLanguage === 'FR' ? fr : en;
  const todayKey = localDateKey(new Date());

  const employeeSessions = useMemo(
    () => punchSessions.filter(session => session.employeeId === employee.id),
    [employee.id, punchSessions]
  );

  const sessionsByDay = useMemo(() => {
    const grouped = new Map<string, PunchSession[]>();
    employeeSessions.forEach(session => {
      const key = localDateKey(session.startTime);
      grouped.set(key, [...(grouped.get(key) || []), session]);
    });
    return grouped;
  }, [employeeSessions]);

  const [year, month] = visibleMonth.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const calendarCells: Array<Date | null> = [];
  for (let index = 0; index < firstDay.getDay(); index += 1) calendarCells.push(null);
  for (let day = 1; day <= lastDay.getDate(); day += 1) calendarCells.push(new Date(year, month - 1, day));

  const changeMonth = (offset: number) => setVisibleMonth(monthKey(new Date(year, month - 1 + offset, 1)));
  const monthLabel = firstDay.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const weekDays = currentLanguage === 'FR' ? ['DI', 'LU', 'MA', 'ME', 'JE', 'VE', 'SA'] : ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

  const getDayInfo = (dateKey: string) => {
    const sessions = sessionsByDay.get(dateKey) || [];
    const totalHours = sessions.reduce((sum, session) => sum + sessionHours(session), 0);
    const totalRevenue = sessions.reduce((sum, session) => sum + Number(session.revenue || 0), 0);
    const totalPauseMinutes = sessions.reduce((sum, session) => sum + Number(session.totalPauseMinutes || 0), 0);
    const isPastEligibleDay = dateKey < todayKey && (!employee.hireDate || dateKey >= employee.hireDate.slice(0, 10));
    const category = sessions.length > 0 ? categoryForHours(totalHours) : isPastEligibleDay ? DAY_OFF : null;
    return { sessions, totalHours, totalRevenue, totalPauseMinutes, category };
  };

  const selectedInfo = selectedDay ? getDayInfo(selectedDay) : null;
  const money = (value: number) => value.toLocaleString(locale, { style: 'currency', currency: 'CAD' });
  const time = (value?: string | null) => value
    ? new Date(value).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : t('En cours', 'In progress');

  return (
    <div className={embedded ? 'w-full' : 'w-full bg-[#16191F] border border-gray-800 rounded-2xl p-4'}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <button type="button" onClick={() => changeMonth(-1)} className="p-2 rounded-xl bg-gray-900 border border-gray-800 text-gray-300 hover:text-white hover:border-gray-600" aria-label={t('Mois précédent', 'Previous month')}>
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center min-w-0">
          <h4 className="text-sm font-black text-white capitalize">📅 {monthLabel}</h4>
          <p className="text-[10px] text-gray-500 font-bold uppercase mt-1 truncate">{employee.name}</p>
        </div>
        <button type="button" onClick={() => changeMonth(1)} className="p-2 rounded-xl bg-gray-900 border border-gray-800 text-gray-300 hover:text-white hover:border-gray-600" aria-label={t('Mois suivant', 'Next month')}>
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekDays.map(day => <div key={day} className="text-center text-[9px] font-black text-gray-600 py-1">{day}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {calendarCells.map((day, index) => {
          if (!day) return <div key={`empty-${index}`} className="aspect-square" />;
          const dateKey = localDateKey(day);
          const info = getDayInfo(dateKey);
          const isToday = dateKey === todayKey;
          return (
            <button
              type="button"
              key={dateKey}
              onClick={() => setSelectedDay(dateKey)}
              className={`aspect-square min-h-0 rounded-xl border flex flex-col items-center justify-center gap-1 p-1 transition active:scale-95 ${isToday ? 'ring-2 ring-orange-500 bg-white text-black border-white' : 'bg-gray-950/70 border-gray-850 hover:border-gray-600'}`}
              style={!isToday && info.category ? { backgroundColor: `${info.category.color}18`, borderColor: `${info.category.color}55` } : undefined}
              aria-label={`${day.toLocaleDateString(locale)}${info.category ? ` — ${currentLanguage === 'FR' ? info.category.labelFR : info.category.labelEN}` : ''}`}
            >
              <span className={`text-[11px] font-black ${isToday ? 'text-black' : 'text-gray-400'}`}>{day.getDate()}</span>
              {info.category && <span className={`calendar-day-emoji ${info.category.animation} text-xl leading-none`} aria-hidden="true">{info.category.emoji}</span>}
              {info.sessions.length > 0 && <span className="text-[8px] font-black" style={{ color: info.category?.color }}>{info.totalHours.toFixed(1)}h</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-5 pt-4 border-t border-gray-800">
        <h5 className="text-[10px] font-black uppercase text-gray-500 mb-3">{t('Légende des journées', 'Day legend')}</h5>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {[DAY_OFF, ...DAY_CATEGORIES].map(category => (
            <div key={`${category.emoji}-${category.range}`} className="rounded-xl border px-2.5 py-2 flex items-center gap-2" style={{ backgroundColor: `${category.color}12`, borderColor: `${category.color}35` }}>
              <span className={`calendar-day-emoji ${category.animation} text-xl`} aria-hidden="true">{category.emoji}</span>
              <div className="min-w-0">
                <p className="text-[10px] font-black truncate" style={{ color: category.color }}>{currentLanguage === 'FR' ? category.labelFR : category.labelEN}</p>
                <p className="text-[9px] text-gray-500 font-bold">{category.range}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedDay && selectedInfo && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setSelectedDay(null)}>
          <section className="w-full max-w-xl max-h-[92vh] overflow-y-auto bg-[#16191F] border border-gray-800 rounded-t-3xl sm:rounded-3xl shadow-2xl" onClick={event => event.stopPropagation()}>
            <header className="sticky top-0 z-10 bg-[#16191F] border-b border-gray-800 p-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-white capitalize">📅 {new Date(`${selectedDay}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h3>
                <p className="text-xs text-gray-500 mt-1">{employee.name}</p>
              </div>
              <button type="button" onClick={() => setSelectedDay(null)} className="p-2 rounded-full bg-gray-900 border border-gray-800 text-gray-400 hover:text-white" aria-label={t('Fermer', 'Close')}><X className="w-5 h-5" /></button>
            </header>

            <div className="p-4 space-y-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
              {selectedInfo.category && (
                <div className="rounded-2xl border p-4 flex items-center gap-4" style={{ backgroundColor: `${selectedInfo.category.color}14`, borderColor: `${selectedInfo.category.color}45` }}>
                  <span className={`calendar-day-emoji ${selectedInfo.category.animation} text-5xl`} aria-hidden="true">{selectedInfo.category.emoji}</span>
                  <div>
                    <p className="text-lg font-black" style={{ color: selectedInfo.category.color }}>{currentLanguage === 'FR' ? selectedInfo.category.labelFR : selectedInfo.category.labelEN}</p>
                    <p className="text-sm text-gray-400">{selectedInfo.totalHours.toFixed(2)} h</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: t('Heures', 'Hours'), value: `${selectedInfo.totalHours.toFixed(2)} h`, className: 'text-orange-400' },
                  { label: t('Montant gagné', 'Amount earned'), value: money(selectedInfo.totalRevenue), className: 'text-green-400' },
                  { label: t('Pauses', 'Breaks'), value: `${Math.round(selectedInfo.totalPauseMinutes)} min`, className: 'text-amber-400' },
                  { label: t('Sessions', 'Sessions'), value: String(selectedInfo.sessions.length), className: 'text-cyan-400' }
                ].map(item => (
                  <div key={item.label} className="rounded-xl bg-gray-950/70 border border-gray-850 p-3">
                    <p className="text-[10px] uppercase font-black text-gray-500">{item.label}</p>
                    <p className={`text-xl font-black mt-1 ${item.className}`}>{item.value}</p>
                  </div>
                ))}
              </div>

              {selectedInfo.sessions.length === 0 ? (
                <div className="text-center py-6 rounded-2xl bg-gray-950/50 border border-gray-850">
                  <div className="text-5xl mb-2">🏖️</div>
                  <p className="font-black text-cyan-400">{t('Congé — aucune session enregistrée', 'Day off — no session recorded')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <h4 className="text-xs uppercase font-black text-gray-400">{t('Détail de la journée', 'Day details')}</h4>
                  {selectedInfo.sessions.map(session => {
                    const project = projects.find(item => item.id === session.projectId);
                    const projectName = project?.name || session.projectName || t('Chantier non précisé', 'Unspecified project');
                    const clientName = project?.clientName || t('Compagnie non précisée', 'Unspecified company');
                    const hours = sessionHours(session);
                    const mode = session.payMode === 'horaire' ? t('Horaire', 'Hourly') : session.payMode === 'surface' ? t('Surface', 'Square footage') : t('Forfait', 'Flat rate');
                    return (
                      <article key={session.id} className="rounded-2xl bg-gray-950/70 border border-gray-800 p-4 space-y-3">
                        <div>
                          <p className="text-sm font-black text-white">🏗️ {projectName}</p>
                          <p className="text-xs text-cyan-400 mt-1">🏢 {clientName}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-lg bg-gray-900 p-2"><span className="text-gray-500 block text-[9px] uppercase font-bold">{t('Horaire', 'Time')}</span><span className="text-white font-bold">{time(session.startTime)} → {time(session.endTime)}</span></div>
                          <div className="rounded-lg bg-gray-900 p-2"><span className="text-gray-500 block text-[9px] uppercase font-bold">{t('Heures', 'Hours')}</span><span className="text-orange-400 font-black">{hours.toFixed(2)} h</span></div>
                          <div className="rounded-lg bg-gray-900 p-2"><span className="text-gray-500 block text-[9px] uppercase font-bold">{t('Mode et taux', 'Mode and rate')}</span><span className="text-white font-bold">{mode} · {session.rate}$</span></div>
                          <div className="rounded-lg bg-gray-900 p-2"><span className="text-gray-500 block text-[9px] uppercase font-bold">{t('Montant', 'Amount')}</span><span className="text-green-400 font-black">{money(Number(session.revenue || 0))}</span></div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
'''

COMPONENT.write_text(component, encoding='utf-8')

app = APP.read_text(encoding='utf-8')

if "const EmployeeWorkCalendar = lazy" not in app:
    app = replace_once(
        app,
        "const ProjectTasksAndTools = lazy(() => import('./components/ProjectTasksAndTools'));\n",
        "const ProjectTasksAndTools = lazy(() => import('./components/ProjectTasksAndTools'));\nconst EmployeeWorkCalendar = lazy(() => import('./components/EmployeeWorkCalendar'));\n",
        'import calendrier'
    )

if "const [teamCalendarEmployeeId" not in app:
    app = replace_once(
        app,
        "  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);\n",
        "  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);\n  const [teamCalendarEmployeeId, setTeamCalendarEmployeeId] = useState<string>('');\n",
        'état calendrier équipe'
    )

calendar_start = "                    {/* Calendar of worked days (vertical month block inside card) */}"
calendar_end = "\n\n                  </div>\n                ) : ("
start_index = app.find(calendar_start)
end_index = app.find(calendar_end, start_index)
if start_index == -1 or end_index == -1:
    raise RuntimeError('bloc calendrier personnel introuvable')
if '<EmployeeWorkCalendar' not in app[start_index:end_index]:
    replacement = r'''                    {/* Calendrier réel des journées travaillées — employés et secrétaire */}
                    <div className="w-full mt-6 border-t border-gray-800 pt-6">
                      <Suspense fallback={<LazySectionFallback />}>
                        <EmployeeWorkCalendar
                          employee={activeEmployee}
                          punchSessions={punchSessions}
                          projects={projects}
                          currentLanguage={currentLanguage}
                          embedded
                        />
                      </Suspense>
                    </div>'''
    app = app[:start_index] + replacement + app[end_index:]

team_anchor = "                  {/* -------------------- DETAILED EMPLOYEE STATISTICS (ADMIN ONLY) -------------------- */}"
if 'id="team-work-calendars"' not in app:
    team_section = r'''                  {/* Calendriers détaillés de l'équipe — accessibles au bureau sans exposer les NIP */}
                  {activeEmployee && (activeEmployee.role === 'admin' || activeEmployee.role === 'secretary') && (() => {
                    const calendarEmployees = employees.filter(employee => employee.role !== 'admin');
                    const selectedCalendarEmployee = calendarEmployees.find(employee => employee.id === teamCalendarEmployeeId) || calendarEmployees[0];
                    if (!selectedCalendarEmployee) return null;
                    return (
                      <section id="team-work-calendars" className="p-5 bg-gray-950 border border-gray-850 rounded-2xl space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="inline-flex px-2 py-1 rounded bg-cyan-500/10 text-cyan-400 font-mono text-[9px] uppercase font-black">TEAM CALENDAR</div>
                            <h4 className="text-sm font-black text-white mt-2">📅 {currentLanguage === 'FR' ? "Calendriers des employés" : 'Employee calendars'}</h4>
                            <p className="text-xs text-gray-500 mt-1">{currentLanguage === 'FR' ? 'Choisissez un employé, puis touchez une journée pour ouvrir sa fiche complète.' : 'Choose an employee, then tap a day to open the complete daily record.'}</p>
                          </div>
                          <select
                            value={selectedCalendarEmployee.id}
                            onChange={event => setTeamCalendarEmployeeId(event.target.value)}
                            className="w-full sm:w-64 p-3 bg-gray-900 border border-gray-800 rounded-xl text-white font-bold"
                            aria-label={currentLanguage === 'FR' ? 'Choisir un employé' : 'Choose an employee'}
                          >
                            {calendarEmployees.map(employee => <option key={employee.id} value={employee.id}>{employee.name} — {employee.workerType}</option>)}
                          </select>
                        </div>
                        <Suspense fallback={<LazySectionFallback />}>
                          <EmployeeWorkCalendar
                            employee={selectedCalendarEmployee}
                            punchSessions={punchSessions}
                            projects={projects}
                            currentLanguage={currentLanguage}
                            embedded
                          />
                        </Suspense>
                      </section>
                    );
                  })()}

'''
    app = replace_once(app, team_anchor, team_section + team_anchor, 'calendrier équipe secrétaire')

APP.write_text(app, encoding='utf-8')

css = CSS.read_text(encoding='utf-8')
marker = '/* ANIMATIONS DU CALENDRIER DES JOURNÉES */'
if marker not in css:
    css += r'''

/* ANIMATIONS DU CALENDRIER DES JOURNÉES */
.calendar-day-emoji {
  display: inline-block;
  transform-origin: center;
  will-change: transform, filter, opacity;
}

@keyframes calTurtle { 0%,100%{transform:translateX(-1px) rotate(-3deg)} 50%{transform:translateX(2px) rotate(3deg)} }
@keyframes calSteam { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }
@keyframes calFloat { 0%,100%{transform:translateY(0) rotate(-2deg)} 50%{transform:translateY(-4px) rotate(2deg)} }
@keyframes calWork { 0%,100%{transform:scale(1)} 50%{transform:scale(1.1)} }
@keyframes calFlex { 0%,100%{transform:rotate(-6deg) scale(1)} 50%{transform:rotate(6deg) scale(1.12)} }
@keyframes calFire { 0%,100%{transform:translateY(0) scale(1);filter:brightness(1)} 50%{transform:translateY(-3px) scale(1.12);filter:brightness(1.25)} }
@keyframes calZap { 0%,90%,100%{transform:translateX(0);filter:brightness(1)} 92%{transform:translateX(-2px);filter:brightness(1.5)} 95%{transform:translateX(2px)} 98%{transform:translateX(-1px)} }
@keyframes calExplode { 0%,100%{transform:scale(1);filter:drop-shadow(0 0 0 rgba(124,58,237,0))} 50%{transform:scale(1.22);filter:drop-shadow(0 0 7px rgba(124,58,237,.8))} }
@keyframes calSway { 0%,100%{transform:rotate(-7deg)} 50%{transform:rotate(7deg)} }

.cal-turtle { animation: calTurtle 2.8s ease-in-out infinite; }
.cal-steam { animation: calSteam 2.1s ease-in-out infinite; }
.cal-float { animation: calFloat 2.5s ease-in-out infinite; }
.cal-work { animation: calWork 1.8s ease-in-out infinite; }
.cal-flex { animation: calFlex 1.6s ease-in-out infinite; }
.cal-fire { animation: calFire 1.35s ease-in-out infinite; }
.cal-zap { animation: calZap 2.1s linear infinite; }
.cal-explode { animation: calExplode 1.45s ease-in-out infinite; }
.cal-sway { animation: calSway 2.4s ease-in-out infinite; }
'''
    CSS.write_text(css, encoding='utf-8')

print('Calendrier détaillé appliqué aux employés et au secrétaire.')
