// ---------------------------------------------------------------------------
// Plafonds de taille d'une compagnie
// ---------------------------------------------------------------------------
// La connexion doit retrouver un compte parmi ceux de la compagnie. La
// référence envoyée par l'annuaire est une empreinte HMAC : elle ne se
// renverse pas, il faut donc recalculer celle de chaque candidat pour trouver
// le bon. Cette recherche est bornée, et la borne était de 250.
//
// Au-delà, un employé dont la ligne tombait hors des 250 premières recevait
// « NIP incorrect » alors que son NIP était juste — un mur invisible, et le
// pire des symptômes : celui qui accuse l'utilisateur d'une faute qu'il n'a pas
// commise.
//
// Deux choses changent. La borne monte à un millier, ce qui couvre largement
// une entreprise de construction. Et surtout, quand elle est atteinte, le
// serveur ne répond plus « NIP incorrect » : il dit que l'authentification est
// indisponible. Une limite atteinte est un problème d'exploitation, pas une
// erreur de l'employé.
//
// Module à la racine, comme privacyVersions.ts : la même valeur doit valoir
// pour le serveur d'authentification et pour l'API de données.

export const MAX_COMPANY_USERS = 1000;

/** Chantiers d'une compagnie chargés en une fois par l'API de données. */
export const MAX_COMPANY_PROJECTS = 1000;
