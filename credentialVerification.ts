// ---------------------------------------------------------------------------
// Cartes de compétence : soumission par le travailleur, vérification par le
// bureau
// ---------------------------------------------------------------------------
// Un employé ou un sous-traitant photographie sa nouvelle carte, recto et
// verso, et la soumet lui-même. Elle n'entre pas pour autant dans le dossier
// comme une carte vérifiée : elle attend qu'une personne du bureau la confronte
// au registre de l'organisme émetteur.
//
// POURQUOI PAS UNE VÉRIFICATION AUTOMATIQUE
//
// Il n'existe pas de registre unique, et aucun de ceux qui existent n'offre
// d'interface machine publique. Ce sont des formulaires web destinés à un
// humain, souvent protégés contre l'interrogation automatisée, et plusieurs
// exigent l'autorisation du titulaire avant de confirmer quoi que ce soit à un
// employeur. Un modèle de langage ne peut donc pas « aller vérifier » : au
// mieux il lirait la photo et récrirait ce qui y est écrit — ce qui confirme la
// lisibilité de la carte, jamais son authenticité.
//
// Ce que le logiciel fait donc : il amène la personne qui vérifie directement
// au bon registre, avec les renseignements qu'on va lui demander, puis il
// consigne qui a vérifié, quand, et par quel moyen. La décision reste humaine
// et traçable — c'est aussi ce que la loi attend de l'employeur, notamment au
// Québec où la vérification du droit de travail lui incombe explicitement.

// Module partagé entre le navigateur et le serveur, comme privacyVersions.ts :
// la même définition de ce qui est acceptable des deux côtés. L'import de types
// est effacé à la compilation, donc aucune dépendance d'exécution vers src/.
import type { EmployeeCredential, EmployeeCredentialType } from './src/types';

export type CredentialVerificationStatus = 'submitted' | 'verified' | 'rejected';

/** Comment la vérification a été faite — consigné pour pouvoir s'y référer. */
export type CredentialVerificationMethod =
  | 'registry'      // registre public de l'organisme émetteur
  | 'issuer'        // appel ou courriel à l'organisme
  | 'document'      // pièce originale vue en personne
  | 'other';

export interface CredentialRegistry {
  id: string;
  /** Marché et, quand c'est pertinent, la province ou l'État. */
  country: 'CA' | 'US';
  region?: string;
  /** Types de cartes que ce registre permet de contrôler. */
  covers: EmployeeCredentialType[] | 'trade';
  nameFR: string;
  nameEN: string;
  url: string;
  /** Ce qu'on devra saisir dans le formulaire du registre. */
  requiresFR: string;
  requiresEN: string;
  /** Limite à connaître avant de s'y fier. */
  cautionFR: string;
  cautionEN: string;
}

// Registres publics vérifiés en août 2026. Aucun n'expose d'interface machine :
// ce sont des pages à ouvrir, d'où le simple lien.
export const CREDENTIAL_REGISTRIES: CredentialRegistry[] = [
  {
    id: 'ab-tradesecrets',
    country: 'CA',
    region: 'AB',
    covers: 'trade',
    nameFR: 'Alberta — Tradesecrets, recherche de personne de métier',
    nameEN: 'Alberta — Tradesecrets Tradesperson Lookup',
    url: 'https://tradesecrets.alberta.ca/check-credentials',
    requiresFR: 'Prénom, nom et numéro de certificat (ou identifiant AIT).',
    requiresEN: 'First name, last name and certificate number (or AIT ID).',
    cautionFR: "Ne couvre que les certificats de compagnon et le Sceau rouge délivrés par l'Alberta — pas les cartes de sécurité.",
    cautionEN: 'Covers only Alberta-issued journeyperson certificates and Red Seal — not safety cards.'
  },
  {
    id: 'ca-energy-safety',
    country: 'CA',
    covers: ['whmis', 'fall_protection', 'confined_space', 'custom'],
    nameFR: 'Energy Safety Canada — validation de certificat (CSTS, CSO)',
    nameEN: 'Energy Safety Canada — certificate validation (CSTS, CSO)',
    url: 'https://www.energysafetycanada.com/certificate-validation',
    requiresFR: 'Les cinq derniers chiffres du numéro de certificat.',
    requiresEN: 'The last five digits of the certificate number.',
    cautionFR: "L'organisme ne confirme le statut à un employeur que si le titulaire l'a autorisé.",
    cautionEN: 'The issuer confirms status to an employer only with the cardholder’s authorization.'
  },
  {
    id: 'ca-red-seal',
    country: 'CA',
    covers: 'trade',
    nameFR: 'Sceau rouge — vérification d’une mention',
    nameEN: 'Red Seal — endorsement verification',
    url: 'https://www.red-seal.ca/eng/credential/credential.shtml',
    requiresFR: "Passe par l'autorité provinciale qui a délivré le certificat.",
    requiresEN: 'Goes through the provincial authority that issued the certificate.',
    cautionFR: 'Point d’entrée seulement : la vérification se fait ensuite auprès de la province.',
    cautionEN: 'Entry point only: verification then happens with the province.'
  },
  {
    id: 'qc-ccq',
    country: 'CA',
    region: 'QC',
    covers: 'trade',
    nameFR: 'Québec — CCQ, certificat de compétence',
    nameEN: 'Quebec — CCQ competency certificate',
    url: 'https://www.ccq.org/fr-CA/loi-r20/etre-employeur/regles',
    requiresFR: "Accès employeur à la CCQ ; le numéro de certificat du salarié.",
    requiresEN: 'CCQ employer access; the worker’s certificate number.',
    cautionFR: "Au Québec, la vérification du droit de travail est une obligation de l'employeur, pas une simple précaution.",
    cautionEN: 'In Quebec, verifying the right to work is a legal duty of the employer, not merely a precaution.'
  },
  {
    id: 'us-osha-outreach',
    country: 'US',
    covers: ['whmis', 'fall_protection', 'confined_space', 'custom'],
    nameFR: 'États-Unis — carte OSHA 10/30',
    nameEN: 'United States — OSHA 10/30 card',
    url: 'https://www.osha.gov/training/outreach',
    requiresFR: "Le code QR au verso des cartes émises depuis mars 2016 ; sinon, le formateur autorisé qui l'a délivrée.",
    requiresEN: 'The QR code on the back of cards issued since March 2016; otherwise the authorized trainer who issued it.',
    cautionFR: "Il n'existe pas de base fédérale consultable : la carte n'est pas un permis.",
    cautionEN: 'There is no searchable federal database: the card is not a licence.'
  }
];

/**
 * Registres utiles pour une carte donnée, les plus précis d'abord : ceux de la
 * province avant ceux du pays. On ne montre pas les cinq à chaque fois.
 */
export function registriesForCredential(
  credential: Pick<EmployeeCredential, 'type'>,
  country: string | undefined,
  region: string | undefined
): CredentialRegistry[] {
  const market = country === 'US' ? 'US' : 'CA';
  return CREDENTIAL_REGISTRIES
    .filter(registry => registry.country === market)
    .filter(registry => !registry.region || registry.region === region)
    .filter(registry => registry.covers === 'trade' || registry.covers.includes(credential.type))
    .sort((a, b) => Number(Boolean(b.region)) - Number(Boolean(a.region)));
}

/** Statut de vérification d'une carte. Une carte sans marque est ancienne :
 *  elle a été saisie par le bureau lui-même, donc déjà vérifiée. */
export function verificationStatus(credential: EmployeeCredential): CredentialVerificationStatus {
  return credential.verificationStatus || 'verified';
}

export function isAwaitingVerification(credential: EmployeeCredential): boolean {
  return verificationStatus(credential) === 'submitted';
}

/** Cartes en attente, la plus ancienne soumission d'abord : on ne fait pas
 *  attendre quelqu'un parce que sa demande a glissé en bas de la pile. */
export function pendingVerifications<T extends { id: string; name: string; credentials?: EmployeeCredential[] }>(
  employees: T[]
): Array<{ employeeId: string; employeeName: string; credential: EmployeeCredential }> {
  return employees
    .flatMap(employee => (employee.credentials || [])
      .filter(isAwaitingVerification)
      .map(credential => ({ employeeId: employee.id, employeeName: employee.name, credential })))
    .sort((a, b) => String(a.credential.submittedAt || '').localeCompare(String(b.credential.submittedAt || '')));
}

/**
 * Une carte soumise n'est pas modifiable par son titulaire : sans quoi on
 * pourrait faire vérifier une carte puis en changer la date d'expiration. Le
 * bureau, lui, corrige ce qu'il veut.
 */
export function canEditCredential(
  credential: EmployeeCredential,
  viewer: { id: string; role: string }
): boolean {
  if (viewer.role === 'admin' || viewer.role === 'secretary') return true;
  return false;
}

/** Ce qu'un travailleur a le droit de soumettre pour lui-même. */
export function canSubmitCredential(viewer: { id: string; role: string } | null, targetEmployeeId: string): boolean {
  if (!viewer) return false;
  return viewer.id === targetEmployeeId;
}

export function canReviewCredential(viewer: { role: string } | null): boolean {
  return viewer?.role === 'admin' || viewer?.role === 'secretary';
}

export interface SubmissionInput {
  type: EmployeeCredentialType;
  name: string;
  issuer?: string;
  credentialNumber?: string;
  issuedDate?: string;
  expiryDate?: string;
  renewalReminderDays?: number;
  doesNotExpire?: boolean;
  photoFront?: string;
  photoBack?: string;
  notes?: string;
}

export interface SubmissionProblem {
  field: 'name' | 'photoFront' | 'photoBack' | 'expiryDate' | 'photoSize';
  messageFR: string;
  messageEN: string;
}

/** Taille maximale d'une photo de carte, une fois compressée par le navigateur.
 *  Deux faces à 1,5 Mo tiennent largement une carte lisible et empêchent qu'un
 *  envoi accidentel de photo pleine résolution fasse gonfler la fiche. */
export const MAX_CREDENTIAL_PHOTO_BYTES = 1_500_000;

export function dataUrlByteLength(value: string | undefined): number {
  if (!value) return 0;
  const comma = value.indexOf(',');
  const payload = comma === -1 ? value : value.slice(comma + 1);
  return Math.floor((payload.length * 3) / 4);
}

/**
 * Ce qu'on refuse d'accepter. Les deux photos sont exigées : une carte n'est
 * vérifiable que si on voit le numéro au recto et les mentions au verso, et
 * c'est justement le geste que le travailleur est en train de faire.
 */
export function validateSubmission(input: SubmissionInput): SubmissionProblem[] {
  const problems: SubmissionProblem[] = [];

  if (!String(input.name || '').trim()) {
    problems.push({
      field: 'name',
      messageFR: 'Donnez un nom à la carte.',
      messageEN: 'Give the card a name.'
    });
  }
  if (!input.photoFront) {
    problems.push({
      field: 'photoFront',
      messageFR: 'La photo du recto est nécessaire : c’est là que se trouve le numéro.',
      messageEN: 'The front photo is required: that is where the number is.'
    });
  }
  if (!input.photoBack) {
    problems.push({
      field: 'photoBack',
      messageFR: 'La photo du verso est nécessaire : dates et mentions y figurent.',
      messageEN: 'The back photo is required: dates and endorsements appear there.'
    });
  }
  if (!input.doesNotExpire && !input.expiryDate) {
    problems.push({
      field: 'expiryDate',
      messageFR: 'Indiquez la date d’expiration, ou cochez « n’expire pas ».',
      messageEN: 'Enter the expiry date, or tick “does not expire”.'
    });
  }
  const weight = dataUrlByteLength(input.photoFront) + dataUrlByteLength(input.photoBack);
  if (weight > MAX_CREDENTIAL_PHOTO_BYTES * 2) {
    problems.push({
      field: 'photoSize',
      messageFR: 'Les photos sont trop lourdes. Reprenez-les de moins près.',
      messageEN: 'The photos are too heavy. Retake them from a shorter distance.'
    });
  }
  return problems;
}

/**
 * Construit la carte telle qu'elle sera enregistrée. Le statut est imposé ici
 * et non recopié depuis l'entrée : personne ne s'auto-déclare vérifié.
 */
export function buildSubmittedCredential(
  input: SubmissionInput,
  submittedBy: string,
  id: string,
  now: Date = new Date()
): EmployeeCredential {
  return {
    id,
    type: input.type,
    name: String(input.name || '').trim(),
    issuer: String(input.issuer || '').trim(),
    credentialNumber: String(input.credentialNumber || '').trim(),
    issuedDate: input.issuedDate || '',
    expiryDate: input.doesNotExpire ? '' : (input.expiryDate || ''),
    renewalReminderDays: Math.max(0, Number(input.renewalReminderDays ?? 30)),
    doesNotExpire: Boolean(input.doesNotExpire),
    photoFront: input.photoFront || '',
    photoBack: input.photoBack || '',
    notes: String(input.notes || '').trim(),
    verificationStatus: 'submitted',
    submittedBy,
    submittedAt: now.toISOString()
  };
}

export interface ReviewDecision {
  approved: boolean;
  reviewerId: string;
  method?: CredentialVerificationMethod;
  note?: string;
}

/**
 * Applique la décision du bureau. Une carte refusée reste dans le dossier avec
 * son motif : la faire disparaître empêcherait le travailleur de comprendre ce
 * qu'on attend de lui, et effacerait la trace de l'examen.
 */
export function applyReview(
  credential: EmployeeCredential,
  decision: ReviewDecision,
  now: Date = new Date()
): EmployeeCredential {
  return {
    ...credential,
    verificationStatus: decision.approved ? 'verified' : 'rejected',
    verifiedBy: decision.reviewerId,
    verifiedAt: now.toISOString(),
    verificationMethod: decision.approved ? (decision.method || 'other') : undefined,
    verificationNote: String(decision.note || '').trim() || undefined
  };
}
