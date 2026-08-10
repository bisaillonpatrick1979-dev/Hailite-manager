// ---------------------------------------------------------------------------
// Mon horaire — bandeau sur l'accueil de l'employé
// ---------------------------------------------------------------------------
// Un calendrier que personne ne consulte ne sert à rien. L'employé ouvre son
// application le matin et doit voir immédiatement où il va aujourd'hui, puis
// les jours suivants. Rien à chercher, rien à ouvrir.
import { useMemo } from 'react';
import useAppStore from '../store';
import { translations } from '../translations';
import { CalendarDays, MapPin } from 'lucide-react';
import { localDateKey } from '../dateKeys';

export default function MyScheduleStrip() {
  const { currentLanguage, activeEmployee, shiftAssignments, projects } = useAppStore();
  const t = translations[currentLanguage];
  const dateLocale = currentLanguage === 'FR' ? 'fr-CA' : 'en-CA';

  const today = localDateKey();
  // Aujourd'hui et les six jours suivants : au-delà, ça change encore trop.
  const horizon = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 6);
    return localDateKey(d);
  }, []);

  const mine = useMemo(() => {
    if (!activeEmployee) return [];
    return shiftAssignments
      .filter(a => a.employeeId === activeEmployee.id && a.date >= today && a.date <= horizon)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [shiftAssignments, activeEmployee, today, horizon]);

  if (!activeEmployee || mine.length === 0) return null;

  const todayEntry = mine.find(a => a.date === today);
  const upcoming = mine.filter(a => a.date !== today);
  const projectOf = (id: string) => projects.find(p => p.id === id);

  return (
    <div className="w-full max-w-md bg-gray-950/60 border border-gray-800 rounded-2xl p-3 flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-gray-400">
        <CalendarDays className="w-3.5 h-3.5 text-orange-500" /> {t.schedMineTitle}
      </p>

      {todayEntry ? (() => {
        const project = projectOf(todayEntry.projectId);
        return (
          <div className="p-3 bg-orange-600/15 border border-orange-500/40 rounded-xl">
            <p className="text-[9px] font-mono uppercase text-orange-300">{t.schedMineToday}</p>
            <p className="text-sm font-black text-white mt-0.5">{project?.name || t.schedMineUnknownProject}</p>
            {project?.address && (
              <p className="flex items-center gap-1 text-[11px] text-gray-300 mt-1">
                <MapPin className="w-3 h-3 text-orange-400" /> {project.address}
              </p>
            )}
          </div>
        );
      })() : (
        <p className="text-[11px] text-gray-500">{t.schedMineNothingToday}</p>
      )}

      {upcoming.length > 0 && (
        <div className="flex flex-col gap-1">
          {upcoming.map(a => (
            <div key={a.id} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-mono text-gray-500 shrink-0">
                {new Date(`${a.date}T12:00:00`).toLocaleDateString(dateLocale, { weekday: 'short', day: 'numeric' })}
              </span>
              <span className="text-gray-300 truncate text-right">
                {projectOf(a.projectId)?.name || t.schedMineUnknownProject}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
