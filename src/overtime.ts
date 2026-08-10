// Heures régulières, heures supplémentaires et arrondi au quart d'heure.
//
// POURQUOI CE MODULE EXISTE
// La paie faisait `gross = hours * hourlyRate`, sans aucune notion d'heures
// supplémentaires : sur un chantier de toiture, chaque semaine chargée était
// sous-payée. Les seuils ne peuvent pas se déduire d'un total mensuel — la
// règle est quotidienne et hebdomadaire — d'où le calcul à partir des
// pointages, journée par journée.

import type { CompanyInfo, Employee, PunchSession } from './types';
import { appTimeZone } from './localTime';
import { splitPunchByLocalDay } from './punchHours';

export interface OvertimeRules {
  dailyThreshold: number;    // heures/jour au-delà desquelles c'est du supplémentaire
  weeklyThreshold: number;   // heures/semaine
  multiplier: number;        // ex. 1.5
  roundingMinutes: number;   // arrondi appliqué au total de chaque journée (0 = aucun)
  exempt: boolean;           // employé non admissible aux heures supplémentaires
}

// Valeurs par défaut : règle albertaine (8 h/jour ou 44 h/semaine, à 1,5×) et
// arrondi au quart d'heure. Chaque compagnie peut les changer dans ses
// réglages, et chaque employé peut porter une surcharge.
export const DEFAULT_OVERTIME_RULES: OvertimeRules = {
  dailyThreshold: 8,
  weeklyThreshold: 44,
  multiplier: 1.5,
  roundingMinutes: 15,
  exempt: false
};

const positiveOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;

/**
 * Règles applicables à un employé : le réglage de la compagnie sert de base,
 * la fiche de l'employé peut le surcharger — même logique que le taux de
 * vacances (`payrollVacationRate` / `vacationRateOverride`).
 */
export function resolveOvertimeRules(company: CompanyInfo, employee?: Employee): OvertimeRules {
  const base: OvertimeRules = {
    dailyThreshold: positiveOr(company.overtimeDailyHours, DEFAULT_OVERTIME_RULES.dailyThreshold),
    weeklyThreshold: positiveOr(company.overtimeWeeklyHours, DEFAULT_OVERTIME_RULES.weeklyThreshold),
    multiplier: positiveOr(company.overtimeMultiplier, DEFAULT_OVERTIME_RULES.multiplier),
    // 0 est une valeur volontaire (« aucun arrondi »), donc on ne peut pas
    // utiliser positiveOr ici.
    roundingMinutes: typeof company.hourRoundingMinutes === 'number' && company.hourRoundingMinutes >= 0
      ? company.hourRoundingMinutes
      : DEFAULT_OVERTIME_RULES.roundingMinutes,
    exempt: false
  };
  if (!employee) return base;
  return {
    dailyThreshold: positiveOr(employee.overtimeDailyHoursOverride, base.dailyThreshold),
    weeklyThreshold: positiveOr(employee.overtimeWeeklyHoursOverride, base.weeklyThreshold),
    multiplier: positiveOr(employee.overtimeMultiplierOverride, base.multiplier),
    roundingMinutes: base.roundingMinutes,
    exempt: employee.overtimeExempt === true
  };
}

/**
 * Arrondi des heures au multiple demandé, au plus proche.
 * Convention retenue : le plus proche (7 min restent à 0, 8 min passent à 15),
 * norme de l'industrie. Un arrondi systématiquement favorable au travailleur
 * se ferait en remplaçant Math.round par Math.ceil.
 */
export function roundHours(hours: number, roundingMinutes: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  if (!roundingMinutes || roundingMinutes <= 0) return Number(hours.toFixed(4));
  const increment = roundingMinutes / 60;
  return Number((Math.round(hours / increment) * increment).toFixed(4));
}

// Lundi de la semaine contenant la journée « AAAA-MM-JJ ».
// Sert uniquement à regrouper des journées entre elles : un calcul en UTC
// convient ici puisque les deux bornes sont des journées civiles déjà locales.
function weekKeyOf(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  const weekday = date.getUTCDay();                 // 0 = dimanche
  const offset = weekday === 0 ? -6 : 1 - weekday;  // ramène au lundi
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export interface HoursBreakdown {
  regularHours: number;
  overtimeHours: number;
  totalHours: number;
  /** Détail par journée locale, utile pour justifier un montant à un employé. */
  byDay: { dayKey: string; hours: number }[];
}

/**
 * Répartit les heures d'une période entre régulières et supplémentaires.
 *
 * Règle appliquée (celle de l'Alberta) : pour chaque semaine, on retient le
 * PLUS GRAND entre le cumul des dépassements quotidiens et le dépassement
 * hebdomadaire — jamais les deux additionnés, ce qui paierait deux fois la
 * même heure.
 *
 * `periodPrefix` suit les clés de journée : « 2026-07 » pour un mois,
 * « 2026 » pour une année, chaîne vide pour tout l'historique.
 */
export function computeHoursBreakdown(
  punches: PunchSession[],
  rules: OvertimeRules,
  periodPrefix: string,
  timeZone: string = appTimeZone(),
  now: Date = new Date()
): HoursBreakdown {
  // 1. Cumul des heures par journée locale.
  const perDay = new Map<string, number>();
  for (const punch of punches) {
    if (!punch.endTime) continue;
    for (const slice of splitPunchByLocalDay(punch, timeZone, now)) {
      if (!slice.dayKey.startsWith(periodPrefix)) continue;
      perDay.set(slice.dayKey, (perDay.get(slice.dayKey) || 0) + slice.hours);
    }
  }

  // 2. Arrondi appliqué au total de la journée, pas à chaque pointage : trois
  //    allers-retours dans la même journée ne doivent pas être arrondis trois
  //    fois.
  const byDay = [...perDay.entries()]
    .map(([dayKey, hours]) => ({ dayKey, hours: roundHours(hours, rules.roundingMinutes) }))
    .filter(entry => entry.hours > 0)
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey));

  const totalHours = Number(byDay.reduce((sum, entry) => sum + entry.hours, 0).toFixed(4));
  if (rules.exempt) {
    return { regularHours: totalHours, overtimeHours: 0, totalHours, byDay };
  }

  // 3. Regroupement par semaine, puis règle du plus grand des deux seuils.
  const perWeek = new Map<string, { total: number; dailyExcess: number }>();
  for (const entry of byDay) {
    const key = weekKeyOf(entry.dayKey);
    const bucket = perWeek.get(key) || { total: 0, dailyExcess: 0 };
    bucket.total += entry.hours;
    bucket.dailyExcess += Math.max(0, entry.hours - rules.dailyThreshold);
    perWeek.set(key, bucket);
  }

  let overtimeHours = 0;
  for (const bucket of perWeek.values()) {
    const weeklyExcess = Math.max(0, bucket.total - rules.weeklyThreshold);
    overtimeHours += Math.max(bucket.dailyExcess, weeklyExcess);
  }
  overtimeHours = Number(Math.min(overtimeHours, totalHours).toFixed(4));

  return {
    regularHours: Number((totalHours - overtimeHours).toFixed(4)),
    overtimeHours,
    totalHours,
    byDay
  };
}

/** Salaire brut correspondant à une répartition régulier / supplémentaire. */
export function grossFromBreakdown(breakdown: HoursBreakdown, hourlyRate: number, multiplier: number): number {
  const rate = Number.isFinite(hourlyRate) ? hourlyRate : 0;
  return Number((
    breakdown.regularHours * rate
    + breakdown.overtimeHours * rate * multiplier
  ).toFixed(2));
}
