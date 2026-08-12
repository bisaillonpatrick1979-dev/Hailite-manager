/**
 * Vérification du NIP sur l'appareil, pour le mode hors serveur.
 *
 * En mode Supabase, le serveur est l'unique autorité : ce module n'est jamais
 * appelé. Il n'existe que pour le client qui a choisi de ne créer aucun compte
 * chez personne, et dont l'application tourne seule sur son appareil.
 *
 * Ce que ce module protège, et ce qu'il ne protège pas
 * ---------------------------------------------------
 * Un NIP à quatre chiffres n'a que dix mille valeurs possibles. Aucune fonction
 * de dérivation, si lente soit-elle, n'en fait un secret : quelqu'un qui met la
 * main sur l'empreinte et qui a le temps la retrouvera. C'est vrai de toutes
 * les applications hors ligne, et le prétendre autrement serait mentir.
 *
 * Le NIP sert donc à empêcher qu'un employé ouvre le dossier d'un collègue sur
 * la tablette du chantier. La protection contre quelqu'un qui vole l'appareil,
 * c'est le verrouillage d'écran du téléphone — pas ce module.
 *
 * Ce qui est fait quand même, parce que ça ne coûte rien :
 *   • sel aléatoire par personne, donc deux employés avec le même NIP n'ont pas
 *     la même empreinte, et une table précalculée ne sert à rien;
 *   • 210 000 tours de PBKDF2-SHA256, le minimum recommandé par l'OWASP, ce qui
 *     rend l'essai en masse pénible sans que la connexion paraisse lente;
 *   • comparaison à durée constante, pour ne pas révéler le nombre de
 *     caractères justes par le temps de réponse.
 */

const ALGORITHM = 'pbkdf2-sha256';
const ITERATIONS = 210_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

function subtle(): SubtleCrypto {
  const api = globalThis.crypto?.subtle;
  if (!api) throw new Error('WebCrypto indisponible : impossible de vérifier un NIP hors serveur');
  return api;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function derive(accessCode: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await subtle().importKey(
    'raw',
    new TextEncoder().encode(accessCode),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    key,
    KEY_BITS
  );
  return new Uint8Array(bits);
}

/**
 * Empreinte d'un NIP, au format `pbkdf2-sha256$<tours>$<sel>$<empreinte>`.
 *
 * Le format porte ses propres paramètres : le jour où le nombre de tours
 * augmente, les empreintes déjà en place restent vérifiables.
 */
export async function hashAccessCode(accessCode: string): Promise<string> {
  const code = String(accessCode ?? '');
  if (code.length < 4) throw new Error('NIP trop court');

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const digest = await derive(code, salt, ITERATIONS);
  return `${ALGORITHM}$${ITERATIONS}$${toBase64(salt)}$${toBase64(digest)}`;
}

/** Vrai quand les deux tableaux sont identiques, sans court-circuit sur la première différence. */
function equalInConstantTime(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export function isLocalAccessCodeHash(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(`${ALGORITHM}$`);
}

/**
 * Compare un NIP saisi à une empreinte enregistrée.
 *
 * Renvoie faux — jamais une exception — devant une empreinte absente, tronquée
 * ou d'un format inconnu. Une empreinte abîmée doit refuser la connexion, pas
 * faire planter l'écran d'accueil.
 */
export async function verifyAccessCode(accessCode: string, stored: unknown): Promise<boolean> {
  if (!isLocalAccessCodeHash(stored)) return false;

  const [, iterationsPart, saltPart, digestPart] = String(stored).split('$');
  const iterations = Number(iterationsPart);
  if (!Number.isInteger(iterations) || iterations < 1 || !saltPart || !digestPart) return false;

  try {
    const expected = fromBase64(digestPart);
    const actual = await derive(String(accessCode ?? ''), fromBase64(saltPart), iterations);
    return equalInConstantTime(expected, actual);
  } catch {
    return false;
  }
}
