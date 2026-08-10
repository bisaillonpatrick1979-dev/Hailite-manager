// ---------------------------------------------------------------------------
// Dossier d'un employé — ce qu'il a réellement fait, par jour, mois et année
// ---------------------------------------------------------------------------
// Le tableau de bord montre l'équipe en direct, mais rien ne permettait de
// s'arrêter sur une personne : combien d'heures elle a faites ce mois-ci,
// l'an dernier, sur quels chantiers, ce qu'elle a été payée. Ce module fait
// tous les calculs, sans rien afficher, pour qu'ils soient vérifiables par des
// tests plutôt que noyés dans du JSX.
//
// Règle de calcul : une journée appartient à la date locale de son début de
// pointage. Un quart commencé à 22 h et terminé à 2 h compte donc pour la
// journée où l'employé est arrivé sur le chantier — c'est ainsi que
// l'entrepreneur lit sa feuille de temps.

import type { Employee, PayrollPayment, PunchSession } from './types';

export interface DossierDay {
  date: string;            // 2026-08-10
  hours: number;
  revenue: number;
  sessions: number;
  projects: string[];
  inProgress: boolean;
}

export interface DossierMonth {
  month: string;           // 2026-08
  hours: number;
  revenue: number;
  daysWorked: number;
}

export interface DossierYear {
  year: string;            // 2026
  hours: number;
  revenue: number;
  daysWorked: number;
  months: DossierMonth[];  // uniquement les mois travaillés, du plus récent au plus ancien
}

export interface DossierProject {
  projectId: string;
  projectName: string;
  hours: number;
  revenue: number;
  days: number;
  lastWorked: string;
}

export interface EmployeeDossier {
  employeeId: string;
  today: DossierDay | null;
  currentMonth: DossierMonth | null;
  currentYear: DossierYear | null;
  years: DossierYear[];    // du plus récent au plus ancien
  projects: DossierProject[];
  totals: { hours: number; revenue: number; daysWorked: number; sessions: number };
  activeSession: PunchSession | null;
  firstDay: string | null;
  lastDay: string | null;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Clé de jour dans le fuseau de l'appareil, jamais en UTC : un pointage de
 *  18 h à Fort McMurray ne doit pas basculer au lendemain. */
export function localDayKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Heures réellement travaillées dans un pointage. La valeur enregistrée fait
 * foi quand elle existe ; sinon on la reconstitue, pauses déduites, et un
 * pointage encore ouvert est compté jusqu'à maintenant.
 */
export function punchSessionHours(session: PunchSession, now: Date = new Date()): number {
  if (typeof session.totalWorkedHours === 'number' && Number.isFinite(session.totalWorkedHours)) {
    return Math.max(0, session.totalWorkedHours);
  }
  const start = new Date(session.startTime).getTime();
  if (Number.isNaN(start)) return 0;
  const end = session.endTime ? new Date(session.endTime).getTime() : now.getTime();
  if (Number.isNaN(end)) return 0;
  const pauseMs = Math.max(0, Number(session.totalPauseMinutes || 0)) * 60_000;
  return Math.max(0, end - start - pauseMs) / 3_600_000;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Regroupe les pointages d'un employé par jour, mois, année et chantier.
 * `now` est injectable pour que les tests ne dépendent pas de l'horloge.
 */
export function buildEmployeeDossier(
  employeeId: string,
  punchSessions: PunchSession[],
  now: Date = new Date()
): EmployeeDossier {
  const mine = punchSessions.filter(session => session.employeeId === employeeId);

  const days = new Map<string, DossierDay>();
  const projects = new Map<string, DossierProject>();
  let activeSession: PunchSession | null = null;

  for (const session of mine) {
    const dayKey = localDayKey(session.startTime);
    if (!dayKey) continue;

    const hours = punchSessionHours(session, now);
    const revenue = Number.isFinite(Number(session.revenue)) ? Number(session.revenue) : 0;
    const open = session.endTime === null;
    if (open && (!activeSession || new Date(session.startTime) > new Date(activeSession.startTime))) {
      activeSession = session;
    }

    const day = days.get(dayKey) || { date: dayKey, hours: 0, revenue: 0, sessions: 0, projects: [], inProgress: false };
    day.hours += hours;
    day.revenue += revenue;
    day.sessions += 1;
    day.inProgress = day.inProgress || open;
    if (session.projectName && !day.projects.includes(session.projectName)) day.projects.push(session.projectName);
    days.set(dayKey, day);

    const projectKey = session.projectId || session.projectName || 'inconnu';
    const project = projects.get(projectKey) || {
      projectId: session.projectId || '',
      projectName: session.projectName || '',
      hours: 0, revenue: 0, days: 0, lastWorked: dayKey
    };
    project.hours += hours;
    project.revenue += revenue;
    if (dayKey > project.lastWorked) project.lastWorked = dayKey;
    projects.set(projectKey, project);
  }

  // Jours distincts par chantier : une deuxième passe évite de compter deux
  // fois une journée où l'employé a pointé deux quarts sur le même chantier.
  const projectDays = new Map<string, Set<string>>();
  for (const session of mine) {
    const dayKey = localDayKey(session.startTime);
    if (!dayKey) continue;
    const projectKey = session.projectId || session.projectName || 'inconnu';
    const set = projectDays.get(projectKey) || new Set<string>();
    set.add(dayKey);
    projectDays.set(projectKey, set);
  }
  for (const [key, set] of projectDays) {
    const project = projects.get(key);
    if (project) project.days = set.size;
  }

  const monthMap = new Map<string, DossierMonth>();
  for (const day of days.values()) {
    const monthKey = day.date.slice(0, 7);
    const month = monthMap.get(monthKey) || { month: monthKey, hours: 0, revenue: 0, daysWorked: 0 };
    month.hours += day.hours;
    month.revenue += day.revenue;
    if (day.hours > 0 || day.sessions > 0) month.daysWorked += 1;
    monthMap.set(monthKey, month);
  }

  const yearMap = new Map<string, DossierYear>();
  for (const month of monthMap.values()) {
    const yearKey = month.month.slice(0, 4);
    const year = yearMap.get(yearKey) || { year: yearKey, hours: 0, revenue: 0, daysWorked: 0, months: [] };
    year.hours += month.hours;
    year.revenue += month.revenue;
    year.daysWorked += month.daysWorked;
    year.months.push({ ...month, hours: round2(month.hours), revenue: round2(month.revenue) });
    yearMap.set(yearKey, year);
  }

  const years = Array.from(yearMap.values())
    .map(year => ({
      ...year,
      hours: round2(year.hours),
      revenue: round2(year.revenue),
      months: year.months.sort((a, b) => b.month.localeCompare(a.month))
    }))
    .sort((a, b) => b.year.localeCompare(a.year));

  const dayKeys = Array.from(days.keys()).sort();
  const todayKey = localDayKey(now);
  const currentMonthKey = todayKey.slice(0, 7);
  const currentYearKey = todayKey.slice(0, 4);
  const todayEntry = days.get(todayKey);
  const currentMonthEntry = monthMap.get(currentMonthKey);

  return {
    employeeId,
    today: todayEntry ? { ...todayEntry, hours: round2(todayEntry.hours), revenue: round2(todayEntry.revenue) } : null,
    currentMonth: currentMonthEntry
      ? { ...currentMonthEntry, hours: round2(currentMonthEntry.hours), revenue: round2(currentMonthEntry.revenue) }
      : null,
    currentYear: years.find(year => year.year === currentYearKey) || null,
    years,
    projects: Array.from(projects.values())
      .map(project => ({ ...project, hours: round2(project.hours), revenue: round2(project.revenue) }))
      .sort((a, b) => b.hours - a.hours),
    totals: {
      hours: round2(Array.from(days.values()).reduce((sum, day) => sum + day.hours, 0)),
      revenue: round2(Array.from(days.values()).reduce((sum, day) => sum + day.revenue, 0)),
      daysWorked: days.size,
      sessions: mine.length
    },
    activeSession,
    firstDay: dayKeys[0] || null,
    lastDay: dayKeys[dayKeys.length - 1] || null
  };
}

/** Versements de paie d'un employé, du plus récent au plus ancien. */
export function employeePayrollHistory(employeeId: string, payments: PayrollPayment[]): PayrollPayment[] {
  return payments
    .filter(payment => payment.employeeId === employeeId)
    .slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

/** Total réellement versé — les brouillons et les retenues n'ont rien payé. */
export function employeePaidTotal(employeeId: string, payments: PayrollPayment[]): number {
  return round2(payments
    .filter(payment => payment.employeeId === employeeId && payment.status === 'paid')
    .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0));
}

/**
 * Champs du dossier qu'on accepte de montrer. Le NIP et le numéro
 * d'assurance sociale n'apparaissent nulle part : ni à l'écran, ni dans une
 * capture d'écran envoyée par messagerie, ni devant l'assistant. Cette liste
 * est la seule porte d'entrée du composant d'affichage.
 */
export const DOSSIER_VISIBLE_FIELDS = [
  'name', 'role', 'workerType', 'phone', 'email', 'address', 'city', 'province',
  'postalCode', 'hireDate', 'hourlyRate', 'workMode', 'payFrequency', 'level', 'xp',
  'emergencyContactName', 'emergencyContactPhone', 'emergencyContactRelation',
  'businessName', 'contractRenewalDate', 'avatar', 'credentials'
] as const;

export const DOSSIER_FORBIDDEN_FIELDS = ['nip', 'sin', 'asNumber', 'gstNumber'] as const;

export type DossierIdentity = Pick<Employee, (typeof DOSSIER_VISIBLE_FIELDS)[number]> & { id: string };

/**
 * Ne laisse passer que les champs autorisés. Un champ ajouté plus tard au type
 * Employee — un numéro de compte bancaire, par exemple — n'apparaîtra pas par
 * accident dans le dossier : il faudra l'inscrire explicitement ci-dessus.
 */
export function dossierIdentity(employee: Employee): DossierIdentity {
  const identity = { id: employee.id } as DossierIdentity;
  for (const field of DOSSIER_VISIBLE_FIELDS) {
    (identity as any)[field] = (employee as any)[field];
  }
  return identity;
}
