// ---------------------------------------------------------------------------
// Confinement du compte de révision
// ---------------------------------------------------------------------------
// Google exige un profil de démonstration pour examiner une application dont
// tous les écrans sont derrière un NIP. Ce profil part chez un inconnu.
//
// L'application sait déjà présenter un jeu de données fictives de cinq ans
// (voir demoSandbox.ts), et le client bascule dessus dès la connexion d'un
// compte de révision. Mais un basculement d'écran n'est pas une protection :
// l'API reste joignable avec le jeton de session. Sans ce garde, il suffisait
// d'un appel direct pour lire les vrais chantiers, les vrais employés et
// leurs taux horaires.
//
// La règle est donc volontairement grossière et facile à vérifier : un compte
// de révision ne reçoit AUCUNE donnée d'entreprise. Pas de lecture filtrée,
// pas d'écriture surveillée — rien. Il n'a besoin de rien : ses données sont
// fabriquées dans son navigateur.
//
// Ce qui lui reste ouvert est exactement ce qu'il faut pour tenir une session :
// ouvrir et fermer sa session, la relire, et accepter les avis qu'on lui
// présente à l'écran. Tout le reste est refusé.

/**
 * Préfixes des routes qui servent ou modifient des données d'entreprise.
 * Un compte de révision n'en franchit aucune.
 *
 * On raisonne par préfixe plutôt que route par route : une route de données
 * ajoutée demain sous l'un de ces chemins est couverte d'office. L'oubli
 * jouerait autrement en faveur de la fuite.
 */
export const COMPANY_DATA_PREFIXES = [
  '/api/db',          // lecture et écriture génériques de toutes les tables
  '/api/hydrate',     // chargement en bloc de l'entreprise
  '/api/files',       // photos de chantier
  '/api/projects',    // arborescence des chantiers
  '/api/credentials', // cartes de compétence, avec photos d'identité
  '/api/chat'         // l'assistant lit les données pour répondre
];

/**
 * Routes laissées ouvertes : le strict nécessaire pour tenir une session.
 * Aucune ne renvoie de donnée d'entreprise.
 */
export const REVIEW_ACCOUNT_ALLOWED = [
  '/api/auth/session',
  '/api/auth/logout',
  '/api/auth/privacy-notice',
  '/api/ai/status'
];

/** Normalise un chemin : sans chaîne de requête, sans barre oblique finale. */
function normalizePath(path: string): string {
  const withoutQuery = String(path || '').split('?')[0];
  if (withoutQuery.length > 1 && withoutQuery.endsWith('/')) return withoutQuery.slice(0, -1);
  return withoutQuery;
}

/**
 * Ce chemin sert-il des données d'entreprise ?
 *
 * La comparaison exige une frontière de segment : `/api/dbsomething` n'est pas
 * `/api/db`. Sans cela, un préfixe couvrirait des routes qu'il ne désigne pas —
 * et, plus grave, un chemin voisin pourrait passer pour couvert alors qu'il ne
 * l'est pas.
 */
export function isCompanyDataPath(path: string): boolean {
  const normalized = normalizePath(path);
  return COMPANY_DATA_PREFIXES.some(
    prefix => normalized === prefix || normalized.startsWith(`${prefix}/`)
  );
}

/**
 * Un compte de révision peut-il appeler ce chemin ?
 *
 * Note : la liste ouverte est consultée d'abord, mais aucune de ses entrées
 * n'est sous un préfixe de données. Les deux ensembles sont disjoints, et le
 * test le vérifie — sans quoi élargir la liste ouverte percerait le
 * confinement sans que personne ne s'en aperçoive.
 */
export function reviewAccountMayCall(path: string): boolean {
  const normalized = normalizePath(path);
  if (REVIEW_ACCOUNT_ALLOWED.includes(normalized)) return true;
  return !isCompanyDataPath(normalized);
}
