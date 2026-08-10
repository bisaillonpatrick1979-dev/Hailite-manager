// Journées et mois calculés dans le fuseau horaire réel du travailleur.
//
// POURQUOI CE MODULE EXISTE
// Un pointage est enregistré comme un instant absolu (ISO/UTC) : c'est correct
// et non ambigu. Le bug venait de la *dérivation de la journée civile* à partir
// de cet instant : `iso.split('T')[0]` lit la date UTC, pas la date locale.
// En Alberta (UTC−6), tout ce qui est pointé après 18 h locale basculait au
// lendemain. Deux pointages de la même journée de travail se retrouvaient
// classés sur deux jours différents, et les heures de l'après-midi
// disparaissaient du total « aujourd'hui ».
//
// Toutes les journées et tous les mois affichés ou totalisés doivent donc
// passer par ce module, jamais par un découpage de chaîne ISO.

// Fuseau appliqué à toute l'application. Par défaut celui de l'appareil : le
// téléphone du travailleur et le bureau sont dans la même province, donc
// l'utilisateur voit exactement les journées que sa montre indique. Une
// compagnie dont le personnel travaille dans un autre fuseau peut le fixer
// explicitement (voir setAppTimeZone).
let configuredTimeZone: string | null = null;

export function setAppTimeZone(timeZone: string | null | undefined): void {
  configuredTimeZone = timeZone && timeZone.trim() ? timeZone.trim() : null;
}

export function appTimeZone(): string {
  if (configuredTimeZone) return configuredTimeZone;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// Intl.DateTimeFormat est coûteux à construire : les totaux parcourent des
// milliers de pointages, on garde donc une instance par fuseau.
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  // On assemble les parties au lieu de se fier au format d'une locale : le
  // résultat est identique quel que soit l'environnement (navigateur, Node, CI).
  const created = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  formatterCache.set(timeZone, created);
  return created;
}

interface LocalParts {
  year: number; month: number; day: number;
  hour: number; minute: number; second: number;
}

function localParts(value: string | number | Date, timeZone: string): LocalParts | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = partsFormatter(timeZone).formatToParts(date);
  const read = (type: string) => Number(parts.find(p => p.type === type)?.value);
  const year = read('year');
  const month = read('month');
  const day = read('day');
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  // « 24 » est renvoyé par certaines implémentations pour minuit en hour12:false.
  const rawHour = read('hour');
  return {
    year, month, day,
    hour: Number.isFinite(rawHour) ? rawHour % 24 : 0,
    minute: read('minute') || 0,
    second: read('second') || 0
  };
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Journée civile locale d'un instant, au format « AAAA-MM-JJ ». */
export function localDayKey(value: string | number | Date, timeZone: string = appTimeZone()): string {
  const parts = localParts(value, timeZone);
  if (!parts) return '';
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** Mois civil local d'un instant, au format « AAAA-MM ». */
export function localMonthKey(value: string | number | Date, timeZone: string = appTimeZone()): string {
  return localDayKey(value, timeZone).slice(0, 7);
}

/** Journée locale courante, au format « AAAA-MM-JJ ». */
export function todayKey(timeZone: string = appTimeZone()): string {
  return localDayKey(new Date(), timeZone);
}

/** Mois local courant, au format « AAAA-MM ». */
export function currentMonthKey(timeZone: string = appTimeZone()): string {
  return localMonthKey(new Date(), timeZone);
}

/** Vrai si l'instant tombe dans la journée locale indiquée. */
export function isOnLocalDay(value: string | number | Date | null | undefined, dayKey: string, timeZone: string = appTimeZone()): boolean {
  if (!value || !dayKey) return false;
  return localDayKey(value, timeZone) === dayKey;
}

/** Vrai si l'instant tombe dans le mois local indiqué (« AAAA-MM »). */
export function isInLocalMonth(value: string | number | Date | null | undefined, monthKey: string, timeZone: string = appTimeZone()): boolean {
  if (!value || !monthKey) return false;
  return localMonthKey(value, timeZone) === monthKey;
}

// ---------------------------------------------------------------------------
// Bornes d'une journée locale, exprimées en instants absolus
// ---------------------------------------------------------------------------
// Décalage du fuseau (en millisecondes) à un instant donné. Calculé en
// comparant l'heure murale locale à l'heure murale UTC : c'est la seule façon
// fiable d'obtenir le décalage réel, changements d'heure avancée inclus.
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = localParts(instant, timeZone);
  if (!parts) return 0;
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  // On ignore les millisecondes : elles sont identiques des deux côtés.
  return asUtc - (instant.getTime() - instant.getMilliseconds());
}

/** Instant absolu du début (00:00:00 local) de la journée « AAAA-MM-JJ ». */
export function startOfLocalDay(dayKey: string, timeZone: string = appTimeZone()): Date {
  const [year, month, day] = dayKey.split('-').map(Number);
  // On cherche l'instant T dont l'heure murale locale est minuit ce jour-là :
  //   T = minuitCommeSiUTC − décalage(T)
  // Le décalage dépend de T lui-même (heure avancée), d'où l'itération. On
  // repart toujours de la même base : corriger la correction ferait dériver le
  // résultat d'un décalage complet à chaque passe. Deux passes convergent, y
  // compris les nuits de changement d'heure.
  const base = Date.UTC(year, (month || 1) - 1, day || 1, 0, 0, 0);
  let guess = new Date(base);
  for (let pass = 0; pass < 2; pass++) {
    guess = new Date(base - timeZoneOffsetMs(guess, timeZone));
  }
  return guess;
}

/** Instant absolu de la fin exclusive (00:00:00 du lendemain) d'une journée locale. */
export function endOfLocalDay(dayKey: string, timeZone: string = appTimeZone()): Date {
  const start = startOfLocalDay(dayKey, timeZone);
  // On repart d'un instant sûrement situé le lendemain (36 h plus tard couvre
  // les journées de 23 h et de 25 h), puis on prend le début de cette journée.
  const nextDay = localDayKey(new Date(start.getTime() + 36 * 3600000), timeZone);
  return startOfLocalDay(nextDay, timeZone);
}
