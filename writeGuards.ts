// ---------------------------------------------------------------------------
// Colonnes dont la valeur appartient au serveur ou à la gestion
// ---------------------------------------------------------------------------
// La matrice de permissions décide QUELLES LIGNES un rôle peut écrire. Elle ne
// dit rien des COLONNES. Or trois tables sont écrites par le travailleur
// lui-même sur ses propres lignes (`WRITE_OWN_ONLY`), et la mise à jour
// générique transmettait le corps de la requête tel quel à la base.
//
// Un employé muni d'une session valide pouvait donc, en appelant l'API
// directement, modifier sur son propre pointage :
//   • approval_status → « approved », en se passant de la vérification du
//     bureau, et approved_by/approved_at pour signer l'approbation au nom de
//     quelqu'un d'autre;
//   • within_geofence, latitude, longitude → effaçant après coup le refus
//     calculé par le serveur au moment du pointage;
//   • employee_id → déplaçant son pointage sur le dossier d'un collègue.
// et, sur sa propre facture, status → « paid ».
//
// L'interface n'offre aucun de ces gestes. Ce n'est pas une protection : le
// serveur doit refuser ce que le client ne demande jamais.
//
// POURQUOI ON RETIRE PLUTÔT QUE DE REFUSER
// Le client renvoie la ligne entière à chaque synchronisation (`punchToRow`),
// approbation et position comprises. Refuser la requête casserait la fin de
// quart d'un travailleur honnête. On retire donc ces colonnes du corps : les
// valeurs conservées en base restent celles que le serveur a écrites. Une
// tentative réelle de modification est journalisée.

/** Colonnes qu'un rôle non gestionnaire ne peut jamais écrire lui-même. */
export const MANAGER_OWNED_COLUMNS: Record<string, string[]> = {
  punches: [
    // Validation administrative : c'est le bureau qui approuve, pas le terrain.
    'approval_status', 'approved_by', 'approved_by_name', 'approved_at', 'corrections',
    // Géorepérage : recalculé par le serveur à l'insertion, jamais réécrit après.
    'within_geofence', 'latitude', 'longitude'
  ]
};

/**
 * Colonnes de rattachement : obligatoires à la création — c'est par elles que
 * `enforceOwnRow` vérifie que la ligne appartient bien à son auteur — mais
 * figées ensuite. Sans cela, un employé déplaçait son pointage sur le dossier
 * d'un collègue par une simple mise à jour.
 */
export const IMMUTABLE_OWNER_COLUMNS: Record<string, string[]> = {
  punches: ['employee_id', 'user_id'],
  payroll_entries: ['employee_id', 'user_id'],
  weekly_goals: ['employee_id', 'user_id']
};

/**
 * Valeurs de statut qu'un rôle non gestionnaire peut poser lui-même.
 * Le travailleur envoie sa facture (« pending »); c'est la gestion qui la
 * déclare payée. Sans cette borne, il lui suffisait d'un appel pour marquer sa
 * propre facture acquittée.
 */
export const WORKER_ALLOWED_STATUS: Record<string, string[]> = {
  payroll_entries: ['draft', 'pending']
};

export interface WriteGuardResult {
  /** Colonnes retirées parce qu'elles n'appartiennent pas à ce rôle. */
  removed: string[];
  /** Colonnes dont la valeur demandée différait réellement de l'existante. */
  attempted: string[];
  /** Motif d'un refus franc, quand la valeur elle-même est interdite. */
  rejected?: { column: string; value: string };
}

const sameValue = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  // Null et absent décrivent la même chose côté base.
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
  if (typeof a === 'object' || typeof b === 'object') {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
  }
  return String(a) === String(b);
};

/**
 * Retire du corps les colonnes réservées au serveur ou à la gestion, et refuse
 * les valeurs de statut interdites.
 *
 * `existing` sert à distinguer un renvoi à l'identique — le client réexpédie la
 * ligne entière à chaque synchronisation — d'une vraie tentative de
 * modification, seule digne d'être journalisée.
 */
export function guardWorkerWrite(
  table: string,
  payload: Record<string, unknown>,
  existing: Record<string, unknown> | null
): WriteGuardResult {
  const removed: string[] = [];
  const attempted: string[] = [];

  // `existing` absent = insertion. Les colonnes de rattachement sont alors
  // légitimes : c'est par elles que le serveur vérifie que la ligne appartient
  // à son auteur. Elles ne se figent qu'ensuite.
  const protectedColumns = existing
    ? [...(MANAGER_OWNED_COLUMNS[table] || []), ...(IMMUTABLE_OWNER_COLUMNS[table] || [])]
    : (MANAGER_OWNED_COLUMNS[table] || []);

  for (const column of protectedColumns) {
    if (!(column in payload)) continue;
    const wanted = payload[column];
    if (existing && !sameValue(wanted, existing[column])) attempted.push(column);
    else if (!existing) attempted.push(column);
    delete payload[column];
    removed.push(column);
  }

  const allowed = WORKER_ALLOWED_STATUS[table];
  if (allowed && 'status' in payload) {
    const wanted = String(payload.status ?? '');
    // Un renvoi du statut déjà en base n'est pas une tentative d'élévation.
    const unchanged = existing ? sameValue(payload.status, existing.status) : false;
    if (!unchanged && !allowed.includes(wanted)) {
      return { removed, attempted, rejected: { column: 'status', value: wanted } };
    }
  }

  return { removed, attempted };
}
