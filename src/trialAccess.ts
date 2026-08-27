/**
 * Essai à durée limitée.
 *
 * Pour envoyer l'application à quelqu'un qui veut l'essayer : il l'installe,
 * il repart d'une base vierge, et l'accès s'arrête tout seul au bout du délai
 * prévu. Rien à créer, rien à révoquer, rien à se rappeler de couper.
 *
 * Ce n'est PAS le même mécanisme que l'accès à durée limitée d'un compte
 * (`access_expires_at`, dans auth.ts). Celui-là vit dans la base du
 * propriétaire et concerne quelqu'un qui se connecte à SON serveur. Ici, il
 * n'y a ni serveur ni compte : l'essai est une propriété de l'installation
 * elle-même, décidée au moment de la compilation.
 *
 * Ce que ça protège, et ce que ça ne protège pas
 * ----------------------------------------------
 * Une horloge locale est celle de la personne qui essaie l'application. Elle
 * peut la reculer, et elle peut désinstaller puis réinstaller pour repartir à
 * zéro. Aucun code embarqué ne peut empêcher ça — seul un serveur le pourrait,
 * et c'est justement ce qu'on cherche à éviter ici.
 *
 * Donc : c'est une échéance de courtoisie, pas un verrou. Elle empêche l'essai
 * de traîner indéfiniment chez quelqu'un de bonne foi, ce qui est le cas qu'on
 * veut couvrir. Une seule ruse est bloquée, parce qu'elle est trop facile :
 * reculer l'horloge. La date la plus avancée jamais vue est mémorisée, et le
 * temps ne peut donc jamais remonter.
 */

export interface TrialStatus {
  /** Faux quand la compilation n'est pas un essai : l'application est normale. */
  enabled: boolean;
  startedAt: string;
  expiresAt: string;
  /** Jours entiers restants, zéro quand c'est fini. */
  daysLeft: number;
  expired: boolean;
}

export const TRIAL_START_KEY = 'gcp_trialStartedAt';
export const TRIAL_SEEN_KEY = 'gcp_trialLastSeenAt';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Application normale : aucune échéance. */
export const NO_TRIAL: TrialStatus = {
  enabled: false, startedAt: '', expiresAt: '', daysLeft: 0, expired: false
};

/**
 * Nombre de jours d'essai demandé à la compilation (VITE_TRIAL_DAYS).
 *
 * Zéro, absent, illisible ou négatif = application normale. C'est le bon
 * défaut : une variable mal orthographiée doit produire une application
 * complète, jamais une application qui s'éteint au bout d'une semaine sans
 * que personne l'ait voulu.
 */
export function trialDays(raw: unknown): number {
  const days = Number(String(raw ?? '').trim());
  if (!Number.isFinite(days) || days <= 0) return 0;
  return Math.floor(days);
}

/**
 * État de l'essai.
 *
 * `lastSeen` est la date la plus avancée que l'application ait jamais
 * constatée. Le temps retenu est le plus tardif des deux : reculer l'horloge
 * de l'appareil ne rallonge donc pas l'essai.
 *
 * Une date de début illisible est traitée comme « maintenant » plutôt que
 * comme une erreur : un fichier abîmé ne doit pas verrouiller quelqu'un
 * dehors, et il ne doit pas non plus lui offrir un accès sans fin.
 */
export function evaluateTrial(
  days: number,
  startedAt: unknown,
  lastSeen: unknown,
  now: Date = new Date()
): TrialStatus {
  if (days <= 0) return NO_TRIAL;

  const startMs = readTime(startedAt) ?? now.getTime();
  const seenMs = readTime(lastSeen) ?? 0;
  const effectiveNow = Math.max(now.getTime(), seenMs);
  const expiresMs = startMs + days * DAY_MS;
  const remaining = expiresMs - effectiveNow;

  return {
    enabled: true,
    startedAt: new Date(startMs).toISOString(),
    expiresAt: new Date(expiresMs).toISOString(),
    daysLeft: remaining <= 0 ? 0 : Math.ceil(remaining / DAY_MS),
    expired: remaining <= 0
  };
}

function readTime(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Tout le stockage de l'application est en JSON, et la purge de démarrage
 * relit chaque clé avec JSON.parse : une date écrite en texte brut serait
 * illisible pour elle, donc effacée à chaque lancement — et l'essai
 * repartirait indéfiniment à zéro. On écrit et on relit donc du JSON, en
 * acceptant aussi le texte brut pour les installations déjà en place.
 */
function readStored(store: Storage, key: string): string | null {
  const raw = store.getItem(key);
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'string' ? parsed : null;
  } catch {
    return raw;
  }
}

function writeStored(store: Storage, key: string, value: string): void {
  store.setItem(key, JSON.stringify(value));
}

// ---------------------------------------------------------------------------
// Branchement sur l'appareil
// ---------------------------------------------------------------------------

const CONFIGURED_TRIAL_DAYS = trialDays(
  typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_TRIAL_DAYS : undefined
);

/** Vrai quand cette compilation est une version d'essai. */
export const IS_TRIAL_BUILD = CONFIGURED_TRIAL_DAYS > 0;

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Démarre l'essai au premier lancement, puis avance la date la plus tardive
 * connue à chaque ouverture. Appelée au démarrage, avant l'affichage.
 */
export function armTrial(now: Date = new Date()): TrialStatus {
  if (!IS_TRIAL_BUILD) return NO_TRIAL;

  const store = storage();
  if (!store) {
    // Sans stockage, on ne peut rien mémoriser. L'essai est alors considéré
    // comme commençant maintenant : c'est plus accueillant qu'un refus, et la
    // situation ne se produit que dans une fenêtre privée.
    return evaluateTrial(CONFIGURED_TRIAL_DAYS, now.toISOString(), null, now);
  }

  let startedAt = readStored(store, TRIAL_START_KEY);
  if (!startedAt) {
    startedAt = now.toISOString();
    writeStored(store, TRIAL_START_KEY, startedAt);
  }

  const seenMs = readTime(readStored(store, TRIAL_SEEN_KEY)) ?? 0;
  if (now.getTime() > seenMs) writeStored(store, TRIAL_SEEN_KEY, now.toISOString());

  return evaluateTrial(CONFIGURED_TRIAL_DAYS, startedAt, readStored(store, TRIAL_SEEN_KEY), now);
}

/** État courant, sans rien écrire. */
export function currentTrial(now: Date = new Date()): TrialStatus {
  if (!IS_TRIAL_BUILD) return NO_TRIAL;
  const store = storage();
  if (!store) return evaluateTrial(CONFIGURED_TRIAL_DAYS, now.toISOString(), null, now);
  return evaluateTrial(
    CONFIGURED_TRIAL_DAYS,
    readStored(store, TRIAL_START_KEY),
    readStored(store, TRIAL_SEEN_KEY),
    now
  );
}
