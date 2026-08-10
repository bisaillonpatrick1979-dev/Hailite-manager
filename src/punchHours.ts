// Répartition des heures d'un pointage sur les journées civiles locales.
//
// POURQUOI CE MODULE EXISTE
// `totalWorkedHours` est un bloc unique attribué au jour de départ. Un pointage
// commencé à 22 h et terminé à 2 h comptait donc quatre heures sur la première
// journée et zéro sur la seconde. Ici, on découpe la durée réellement travaillée
// selon les frontières de journée du fuseau local.
//
// Les pauses ne sont pas horodatées individuellement (`totalPauseMinutes` est un
// cumul). On les répartit donc au prorata du temps écoulé dans chaque journée :
// c'est l'approximation la plus fidèle possible sans changer le format stocké,
// et elle conserve exactement le total (la somme des journées égale le total).

import type { PunchSession } from './types';
import { appTimeZone, localDayKey, endOfLocalDay } from './localTime';

export interface PunchDaySlice {
  dayKey: string;   // « AAAA-MM-JJ » local
  hours: number;    // heures travaillées imputées à cette journée
}

/** Instant de fin retenu : la fin réelle, ou maintenant si le pointage est ouvert. */
function effectiveEnd(punch: PunchSession, now: Date): Date {
  return punch.endTime ? new Date(punch.endTime) : now;
}

/**
 * Découpe un pointage en tranches journalières locales.
 * La somme des heures des tranches vaut le temps travaillé total (pauses
 * déduites), aux arrondis près.
 */
export function splitPunchByLocalDay(
  punch: PunchSession,
  timeZone: string = appTimeZone(),
  now: Date = new Date()
): PunchDaySlice[] {
  const start = new Date(punch.startTime);
  const end = effectiveEnd(punch, now);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const totalElapsedMs = end.getTime() - start.getTime();
  if (totalElapsedMs <= 0) return [];

  // Temps réellement travaillé : durée écoulée moins les pauses cumulées.
  const pauseMs = Math.max(0, (punch.totalPauseMinutes || 0) * 60000);
  const workedMs = Math.max(0, totalElapsedMs - pauseMs);
  // Fraction de la durée écoulée qui compte comme du travail. Appliquée à
  // chaque tranche, elle répartit les pauses au prorata.
  const workedRatio = workedMs / totalElapsedMs;

  const slices: PunchDaySlice[] = [];
  let cursor = start;
  // Garde-fou : un pointage oublié pendant des mois ne doit pas boucler sans fin.
  for (let guard = 0; guard < 400 && cursor < end; guard++) {
    const dayKey = localDayKey(cursor, timeZone);
    const dayEnd = endOfLocalDay(dayKey, timeZone);
    const sliceEnd = dayEnd < end ? dayEnd : end;
    const sliceMs = sliceEnd.getTime() - cursor.getTime();
    if (sliceMs > 0) {
      slices.push({ dayKey, hours: (sliceMs * workedRatio) / 3600000 });
    }
    if (sliceEnd.getTime() <= cursor.getTime()) break; // sécurité anti-boucle
    cursor = sliceEnd;
  }
  return slices;
}

/** Heures d'un pointage imputées à une journée locale précise. */
export function punchHoursOnDay(
  punch: PunchSession,
  dayKey: string,
  timeZone: string = appTimeZone(),
  now: Date = new Date()
): number {
  return splitPunchByLocalDay(punch, timeZone, now)
    .filter(slice => slice.dayKey === dayKey)
    .reduce((sum, slice) => sum + slice.hours, 0);
}

/** Heures d'un pointage imputées à un mois local (« AAAA-MM »). */
export function punchHoursInMonth(
  punch: PunchSession,
  monthKey: string,
  timeZone: string = appTimeZone(),
  now: Date = new Date()
): number {
  return splitPunchByLocalDay(punch, timeZone, now)
    .filter(slice => slice.dayKey.startsWith(monthKey))
    .reduce((sum, slice) => sum + slice.hours, 0);
}

/** Total des heures d'une liste de pointages sur une journée locale. */
export function totalHoursOnDay(
  punches: PunchSession[],
  dayKey: string,
  timeZone: string = appTimeZone(),
  now: Date = new Date()
): number {
  return punches.reduce((sum, punch) => sum + punchHoursOnDay(punch, dayKey, timeZone, now), 0);
}

/** Total des heures d'une liste de pointages sur un mois local. */
export function totalHoursInMonth(
  punches: PunchSession[],
  monthKey: string,
  timeZone: string = appTimeZone(),
  now: Date = new Date()
): number {
  return punches.reduce((sum, punch) => sum + punchHoursInMonth(punch, monthKey, timeZone, now), 0);
}

/**
 * Montant d'un pointage imputé à une journée locale.
 * Le revenu est stocké pour la session entière : on le répartit au prorata des
 * heures de chaque journée. Pour un forfait ou un mode surface, cela revient à
 * répartir le montant sur la durée réellement travaillée, ce qui reste cohérent
 * avec les totaux journaliers affichés à côté.
 */
export function punchRevenueOnDay(
  punch: PunchSession,
  dayKey: string,
  timeZone: string = appTimeZone(),
  now: Date = new Date()
): number {
  const slices = splitPunchByLocalDay(punch, timeZone, now);
  const total = slices.reduce((sum, slice) => sum + slice.hours, 0);
  if (total <= 0) return 0;
  const onDay = slices
    .filter(slice => slice.dayKey === dayKey)
    .reduce((sum, slice) => sum + slice.hours, 0);
  return (punch.revenue || 0) * (onDay / total);
}

/** Montant d'un pointage imputé à un mois local (« AAAA-MM »). */
export function punchRevenueInMonth(
  punch: PunchSession,
  monthKey: string,
  timeZone: string = appTimeZone(),
  now: Date = new Date()
): number {
  const slices = splitPunchByLocalDay(punch, timeZone, now);
  const total = slices.reduce((sum, slice) => sum + slice.hours, 0);
  if (total <= 0) return 0;
  const inMonth = slices
    .filter(slice => slice.dayKey.startsWith(monthKey))
    .reduce((sum, slice) => sum + slice.hours, 0);
  return (punch.revenue || 0) * (inMonth / total);
}

/** Journées locales touchées par un pointage. */
export function punchDayKeys(
  punch: PunchSession,
  timeZone: string = appTimeZone(),
  now: Date = new Date()
): string[] {
  return splitPunchByLocalDay(punch, timeZone, now).map(slice => slice.dayKey);
}
