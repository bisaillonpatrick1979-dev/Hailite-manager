// ---------------------------------------------------------------------------
// Calendrier de planification des équipes
// ---------------------------------------------------------------------------
// Le pointage dit où les gens ÉTAIENT ; ce calendrier dit où ils DOIVENT être.
// C'est ce qui remplace les textos du dimanche soir.
//
// Conception pensée pour le téléphone : une grille 7 jours × 12 employés est
// illisible sur un écran de 390 px. On choisit donc un jour, puis on voit les
// chantiers avec leur équipe — et surtout la liste de ceux qui ne sont assignés
// nulle part, qui est l'information la plus coûteuse à rater.
import { useMemo, useState } from 'react';
import useAppStore from '../store';
import { translations } from '../translations';
import type { ShiftAssignment } from '../types';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, UserMinus, X } from 'lucide-react';
import { localDateKey } from '../dateKeys';

// Lundi de la semaine contenant la date donnée
function mondayOf(date: Date): Date {
  const d = new Date(date);
  const shift = (d.getDay() + 6) % 7; // dimanche = 6
  d.setDate(d.getDate() - shift);
  d.setHours(12, 0, 0, 0); // midi : évite les sauts de jour au changement d'heure
  return d;
}

export default function CrewScheduleCalendar() {
  const {
    currentLanguage, activeEmployee, employees, projects,
    shiftAssignments, addShiftAssignment, deleteShiftAssignment
  } = useAppStore();

  const t = translations[currentLanguage];
  const isFR = currentLanguage === 'FR';
  const dateLocale = isFR ? 'fr-CA' : 'en-CA';
  const isManager = activeEmployee?.role === 'admin' || activeEmployee?.role === 'secretary';

  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => localDateKey());
  const [assignFor, setAssignFor] = useState<string | null>(null); // projectId

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  }), [weekStart]);

  const activeProjects = useMemo(
    () => projects.filter(p => p.status === 'active'),
    [projects]
  );

  const dayAssignments = useMemo(
    () => shiftAssignments.filter(a => a.date === selectedDay),
    [shiftAssignments, selectedDay]
  );

  const countFor = (date: string) => shiftAssignments.filter(a => a.date === date).length;

  const crewOf = (projectId: string) => dayAssignments.filter(a => a.projectId === projectId);

  // Ceux qui ne sont sur aucun chantier ce jour-là : l'information la plus
  // coûteuse à rater, donc affichée en évidence plutôt que déduite.
  const unassigned = useMemo(() => {
    const busy = new Set(dayAssignments.map(a => a.employeeId));
    return employees.filter(e => e.role !== 'accountant' && !busy.has(e.id));
  }, [employees, dayAssignments]);

  const assign = (projectId: string, employeeId: string) => {
    const employee = employees.find(e => e.id === employeeId);
    if (!employee) return;
    // Un employé ne peut pas être sur deux chantiers le même jour : on retire
    // d'abord une éventuelle affectation existante.
    const existing = dayAssignments.find(a => a.employeeId === employeeId);
    if (existing) deleteShiftAssignment(existing.id);
    addShiftAssignment({
      date: selectedDay,
      projectId,
      employeeId,
      employeeName: employee.name,
      createdAt: new Date().toISOString(),
      createdById: activeEmployee?.id,
      createdByName: activeEmployee?.name
    });
    setAssignFor(null);
  };

  const dayLabel = (d: Date) => d.toLocaleDateString(dateLocale, { weekday: 'short' });
  const shiftWeek = (delta: number) => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + delta * 7);
    setWeekStart(next);
    setSelectedDay(localDateKey(next));
  };

  return (
    <div id="view-schedule-content" className="bg-[#16191F] border border-gray-800 rounded-2xl p-6 flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3 border-b border-gray-800 pb-4">
        <div>
          <h3 className="text-xl font-black text-white">{t.schedTitle}</h3>
          <p className="text-xs text-gray-400 mt-1">{t.schedSubtitle}</p>
        </div>
        <CalendarDays className="w-6 h-6 text-orange-500 shrink-0" />
      </div>

      {/* Navigation de semaine */}
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => shiftWeek(-1)}
          className="p-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-300" aria-label={t.schedPrevWeek}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-center">
          <p className="text-xs font-black text-white uppercase">
            {weekDays[0].toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })} —{' '}
            {weekDays[6].toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
          <button type="button" onClick={() => { const m = mondayOf(new Date()); setWeekStart(m); setSelectedDay(localDateKey()); }}
            className="text-[10px] font-mono uppercase text-orange-400 mt-0.5">
            {t.schedThisWeek}
          </button>
        </div>
        <button type="button" onClick={() => shiftWeek(1)}
          className="p-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-300" aria-label={t.schedNextWeek}>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Les 7 jours : le compte d'affectations rend visible d'un coup d'œil
          les journées encore vides. */}
      <div className="grid grid-cols-7 gap-1.5">
        {weekDays.map(d => {
          const iso = localDateKey(d);
          const count = countFor(iso);
          const isToday = iso === localDateKey();
          const selected = iso === selectedDay;
          return (
            <button key={iso} type="button" onClick={() => setSelectedDay(iso)}
              className={`flex flex-col items-center py-2 rounded-xl border transition ${
                selected ? 'bg-orange-600 border-orange-500 text-white'
                  : isToday ? 'bg-gray-900 border-orange-500/40 text-orange-300'
                    : 'bg-gray-900 border-gray-800 text-gray-400'}`}>
              <span className="text-[9px] font-mono uppercase">{dayLabel(d)}</span>
              <span className="text-sm font-black">{d.getDate()}</span>
              <span className={`text-[9px] font-mono ${count > 0 ? 'text-emerald-400' : 'text-gray-600'}`}>
                {count > 0 ? `${count}👷` : '—'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Chantiers actifs du jour sélectionné */}
      <div className="flex flex-col gap-3">
        <h4 className="text-[11px] font-black uppercase tracking-wide text-gray-400">
          {new Date(`${selectedDay}T12:00:00`).toLocaleDateString(dateLocale, {
            weekday: 'long', day: 'numeric', month: 'long'
          })}
        </h4>

        {activeProjects.length === 0 && (
          <p className="text-xs text-gray-500 text-center py-6">{t.schedNoActiveProject}</p>
        )}

        {activeProjects.map(project => {
          const crew = crewOf(project.id);
          return (
            <div key={project.id} className="p-3 bg-gray-900 border border-gray-850 rounded-xl flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h5 className="text-sm font-black text-white truncate">{project.name}</h5>
                  <p className="text-[10px] text-gray-400 truncate">{project.clientName} · {project.address}</p>
                </div>
                <span className={`shrink-0 px-2 py-0.5 text-[9px] font-black uppercase rounded border ${
                  crew.length > 0
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-red-500/15 text-red-300 border-red-500/30'}`}>
                  {crew.length > 0 ? `${crew.length} 👷` : t.schedNoCrew}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {crew.map(a => (
                  <span key={a.id}
                    className="flex items-center gap-1.5 px-2 py-1 bg-gray-950 border border-gray-700 rounded-lg text-[11px] text-gray-200">
                    {a.employeeName}
                    {isManager && (
                      <button type="button" onClick={() => deleteShiftAssignment(a.id)}
                        className="text-gray-500 hover:text-red-400" aria-label={t.schedRemoveBtn}>
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                ))}
                {isManager && (
                  <button type="button" onClick={() => setAssignFor(project.id)}
                    className="flex items-center gap-1 px-2 py-1 bg-orange-600/15 border border-orange-500/40 text-orange-300 rounded-lg text-[11px] font-black">
                    <Plus className="w-3 h-3" /> {t.schedAssignBtn}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sans affectation : ce qu'on ne veut surtout pas découvrir le matin même */}
      {unassigned.length > 0 && (
        <div className="p-3 bg-amber-500/5 border border-amber-500/30 rounded-xl">
          <p className="flex items-center gap-1.5 text-[11px] font-black uppercase text-amber-300">
            <UserMinus className="w-3.5 h-3.5" /> {t.schedUnassigned} ({unassigned.length})
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {unassigned.map(e => (
              <span key={e.id} className="px-2 py-1 bg-gray-950 border border-gray-700 rounded-lg text-[11px] text-gray-300">
                {e.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Choix de l'employé à assigner */}
      {assignFor && (
        <div className="fixed inset-0 z-[130] bg-black/80 flex items-end sm:items-center justify-center p-4"
          onClick={() => setAssignFor(null)}>
          <div className="w-full max-w-md bg-[#16191F] border border-gray-800 rounded-2xl p-4 flex flex-col gap-3 max-h-[80dvh]"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-black text-white">{t.schedAssignTitle}</h4>
              <button type="button" onClick={() => setAssignFor(null)} className="p-1 text-gray-500 hover:text-white"
                aria-label={t.modalCancelBtn}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-gray-400">{t.schedAssignHint}</p>
            <div className="flex flex-col gap-1.5 overflow-y-auto">
              {employees.filter(e => e.role !== 'accountant').map(e => {
                const current = dayAssignments.find(a => a.employeeId === e.id);
                const elsewhere = current && current.projectId !== assignFor;
                return (
                  <button key={e.id} type="button" onClick={() => assign(assignFor, e.id)}
                    disabled={!!current && current.projectId === assignFor}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-gray-800 bg-gray-900 text-left disabled:opacity-40">
                    <span className="text-xs font-bold text-white">{e.name}</span>
                    {elsewhere && (
                      <span className="text-[9px] font-mono text-amber-400 truncate">
                        {t.schedAlreadyOn} {projects.find(p => p.id === current!.projectId)?.name || '—'}
                      </span>
                    )}
                    {current && current.projectId === assignFor && (
                      <span className="text-[9px] font-mono text-emerald-400">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
