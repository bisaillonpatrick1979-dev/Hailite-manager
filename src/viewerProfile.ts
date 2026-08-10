import type { Employee } from './types';

// ---------------------------------------------------------------------------
// Profil de l'utilisateur connecté, reconstruit après chaque hydratation
// ---------------------------------------------------------------------------
// Deux pièges ont déjà fait réapparaître l'avis de confidentialité à des gens
// qui l'avaient accepté, ce qui donne l'impression que rien n'est enregistré :
//
//   1. quand l'hydratation ne renvoie pas la ligne du visiteur, un profil de
//      remplacement était fabriqué sans aucun champ de consentement;
//   2. une hydratation partie AVANT l'enregistrement d'un accusé de réception
//      revenait avec des colonnes encore vides et écrasait ce qui venait
//      d'être accepté.
//
// Règle appliquée ici : un consentement connu ne se perd jamais. Il ne peut
// que passer d'absent à présent, jamais l'inverse.

export interface HydrateViewer {
  userId: string;
  name?: string;
}

function timestampValue(value: string | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function latestTimestamp(fresh: string | undefined, previous: string | undefined): string | undefined {
  if (!fresh) return previous;
  if (!previous) return fresh;
  return timestampValue(previous) > timestampValue(fresh) ? previous : fresh;
}

/**
 * Reprend les accusés de réception déjà connus quand la lecture n'en a pas et
 * conserve la paire version/date la plus récente lorsqu'une ancienne requête
 * d'hydratation revient après l'enregistrement du consentement.
 */
export function keepAcknowledgements(profile: Employee, previous: Employee | null): Employee {
  if (!previous) return profile;
  const profilePrivacyAt = profile.privacyNoticeAcknowledgedAt;
  const previousPrivacyAt = previous.privacyNoticeAcknowledgedAt;
  const previousPrivacyIsNewer = Boolean(previousPrivacyAt) && (
    !profilePrivacyAt || timestampValue(previousPrivacyAt) > timestampValue(profilePrivacyAt)
  );

  return {
    ...profile,
    privacyNoticeVersion: previousPrivacyIsNewer
      ? previous.privacyNoticeVersion || profile.privacyNoticeVersion
      : profile.privacyNoticeVersion || previous.privacyNoticeVersion,
    privacyNoticeAcknowledgedAt: latestTimestamp(profilePrivacyAt, previousPrivacyAt),
    locationNoticeAcknowledgedAt: latestTimestamp(
      profile.locationNoticeAcknowledgedAt,
      previous.locationNoticeAcknowledgedAt
    )
  };
}

/**
 * Choisit le profil actif après une hydratation : la ligne fraîche quand elle
 * existe, sinon un profil minimal complété par la session en cours. Le rôle
 * vient toujours du jeton vérifié, jamais de la session précédente.
 */
export function resolveViewerProfile(
  employees: Employee[],
  viewer: HydrateViewer | null | undefined,
  role: Employee['role'],
  sessionEmployee: Employee | null | undefined
): Employee | null {
  if (!viewer) return null;

  const previous = sessionEmployee && sessionEmployee.id === viewer.userId ? sessionEmployee : null;
  const fresh = employees.find(employee => employee.id === viewer.userId);
  if (fresh) return keepAcknowledgements({ ...fresh, role }, previous);

  const fallback: Employee = {
    ...(previous || ({} as Employee)),
    id: viewer.userId,
    name: viewer.name || previous?.name || '',
    nip: '',
    role,
    hourlyRate: previous?.hourlyRate ?? 0,
    workerType: previous?.workerType || '',
    asNumber: previous?.asNumber || '',
    phone: previous?.phone || '',
    address: previous?.address || '',
    hireDate: previous?.hireDate || '',
    avatar: previous?.avatar || '',
    level: previous?.level ?? 1,
    xp: previous?.xp ?? 0
  };
  return keepAcknowledgements(fallback, previous);
}
