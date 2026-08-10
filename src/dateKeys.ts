const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

type DateInput = Date | string | number;

function parsedDate(value: DateInput): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function zonedParts(date: Date, timeZone?: string): { year: number; month: number; day: number } {
  if (!timeZone) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate()
    };
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const value = (type: 'year' | 'month' | 'day') =>
    Number(parts.find(part => part.type === type)?.value || 0);
  return { year: value('year'), month: value('month'), day: value('day') };
}

/** Date civile de l'appareil. Une date déjà sans heure reste inchangée. */
export function localDateKey(value: DateInput = new Date(), timeZone?: string): string {
  if (typeof value === 'string') {
    const exact = value.match(DATE_ONLY);
    if (exact) return value;
  }
  const date = parsedDate(value);
  if (!date) return '';
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Mois civil de l'appareil pour un instant ISO enregistré en UTC. */
export function localMonthKey(value: DateInput = new Date(), timeZone?: string): string {
  if (typeof value === 'string' && DATE_ONLY.test(value)) return value.slice(0, 7);
  const date = parsedDate(value);
  if (!date) return '';
  const { year, month } = zonedParts(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function isInLocalMonth(
  value: DateInput | null | undefined,
  yearMonth: string,
  timeZone?: string
): boolean {
  return value !== null && value !== undefined && localMonthKey(value, timeZone) === yearMonth;
}

export function isOnLocalDate(
  value: DateInput | null | undefined,
  dateKey: string,
  timeZone?: string
): boolean {
  return value !== null && value !== undefined && localDateKey(value, timeZone) === dateKey;
}

export function offsetMonthKey(yearMonth: string, offset: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) return localMonthKey();
  const date = new Date(Number(match[1]), Number(match[2]) - 1 + offset, 1, 12);
  return localMonthKey(date);
}

/** Options toujours cohérentes avec la valeur contrôlée, même après 2026. */
export function monthOptions(center: string, monthsBack = 60, monthsAhead = 12): string[] {
  const options = Array.from(
    { length: monthsBack + monthsAhead + 1 },
    (_, index) => offsetMonthKey(center, monthsAhead - index)
  );
  return Array.from(new Set(options));
}
