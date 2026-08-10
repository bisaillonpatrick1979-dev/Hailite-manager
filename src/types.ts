export type EmployeeRole = 'admin' | 'employee' | 'accountant' | 'secretary';

export type VisualTheme = 'quantum' | 'xp' | 'deco' | 'inferno' | 'arctic' | 'carbon';

export type PayMode = 'horaire' | 'surface' | 'forfait';


export type EmployeeCredentialType =
  | 'manlift'
  | 'scissor_lift'
  | 'first_aid_cpr'
  | 'fall_protection'
  | 'whmis'
  | 'forklift'
  | 'confined_space'
  | 'custom';

export interface EmployeeCredential {
  id: string;
  type: EmployeeCredentialType;
  name: string;
  issuer: string;
  credentialNumber: string;
  issuedDate: string;
  expiryDate: string;
  renewalReminderDays: number;
  doesNotExpire?: boolean;
  photoFront?: string;
  photoBack?: string;
  notes?: string;
  notifiedAt?: string;
}

export interface Employee {
  id: string;
  name: string;
  nip: string; // valeur transitoire d'écriture seulement; jamais relue ni persistée
  role: EmployeeRole;
  hourlyRate: number;
  workerType: string; // ex: 'Compagnon', 'Salarié', 'Apprenti', etc.
  asNumber: string; // Numéro CCQ / AS
  phone: string;
  address: string;
  hireDate: string;
  avatar: string;
  level: number;
  xp: number;
  
  // Advanced fields
  workMode?: 'sqft' | 'hour' | 'flat';
  contractRenewalDate?: string;
  vacationRateOverride?: number;
  email?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  businessName?: string;
  gstNumber?: string;
  sin?: string;
  employeeProvince?: string;
  payFrequency?: 'weekly' | 'biweekly' | 'semi-monthly' | 'monthly';
  payPeriodStart?: string;
  annualSalary?: number;
  credentials?: EmployeeCredential[];
  businessLogo?: string;
  privacyNoticeVersion?: string;
  privacyNoticeAcknowledgedAt?: string;
  locationNoticeAcknowledgedAt?: string;
}

export interface ProjectTask {
  id: string;
  text: string; // ex: "Refaire le revêtement côté gauche"
  done: boolean;
  priority: 'normal' | 'critique';
  createdAt: string;
}

export interface ProjectTool {
  id: string;
  name: string; // ex: "Cloueuse pneumatique"
  brought: boolean;
}

export interface Project {
  id: string;
  name: string;
  clientName: string;
  address: string;
  latitude: number;
  longitude: number;
  radius: number; // default: 100 meters
  assignedEmployees: string[]; // Employee IDs
  status: 'active' | 'completed' | 'on-hold';
  tasks?: ProjectTask[]; // Liste de tâches à cocher pour ce chantier
  tools?: ProjectTool[]; // Outils à apporter sur le chantier
}

export interface SurfaceMaterialInput {
  name: string;
  quantity: number;
  unitPrice: number;
  emoji: string;
}

// Étape de validation administrative d'un pointage.
// « pending »   : fermé par le travailleur, pas encore vérifié par le bureau.
// « corrected » : les heures ont été rectifiées par la gestion.
// « approved »  : vérifié, sert de base à la paie et à la facturation.
export type PunchApprovalStatus = 'pending' | 'corrected' | 'approved';

// Piste d'audit : chaque modification d'heures ou d'état est horodatée avec
// son auteur. Indispensable pour vendre l'application à d'autres entrepreneurs
// — et pour qu'un employé puisse contester une correction.
export interface PunchCorrection {
  at: string;        // ISO
  byId: string;
  byName: string;
  field: 'startTime' | 'endTime' | 'pauseMinutes' | 'approval';
  before: string;
  after: string;
  note?: string;
}

export interface PunchSession {
  id: string;
  employeeId: string;
  employeeName: string;
  projectId: string;
  projectName: string;
  payMode: PayMode;
  rate: number; // Hourly rate or forfait rate or base rate
  startTime: string; // ISO String
  endTime: string | null; // ISO String or null if active
  pausedAt: string | null; // ISO String of when pause started
  totalPauseMinutes: number;
  withinGeofence: boolean;
  attemptedOutsideGeofence?: boolean; // logged infractions
  outsideDetails?: string; // e.g., "At 345m"
  // Position relevée au moment du pointage. Elle est transmise au serveur, qui
  // recalcule lui-même la distance au chantier : `withinGeofence` venant du
  // navigateur n'est jamais une preuve, seulement un affichage.
  latitude?: number;
  longitude?: number;
  surfaceMaterials?: SurfaceMaterialInput[];
  revenue: number;
  totalWorkedHours?: number;
  // Validation administrative. Absent = « pending » (pointages d'avant la
  // mise en place de la validation, traités comme non encore vérifiés).
  approvalStatus?: PunchApprovalStatus;
  approvedById?: string;
  approvedByName?: string;
  approvedAt?: string;
  corrections?: PunchCorrection[];
}

export interface Invoice {
  id: string;
  employeeId: string;
  employeeName: string;
  invoiceNumber: string;
  date: string;
  sessionIds: string[];
  totalHours: number;
  amount: number;
  gstAmount: number;
  qstAmount: number;
  totalWithTaxes: number;
  status: 'draft' | 'pending' | 'paid';
  notes?: string;
  taxIncluded: boolean;
  // Tactile signature required from the employee/sous-traitant before sending to the company
  employeeSignature?: string; // Base64 signature image data
  employeeSignedAt?: string;
  currency?: string;
  taxRate1?: number;
  taxRate2?: number;
  localTaxRate?: number;
  localTaxAmount?: number;
  taxRate1Name?: string;
  taxRate2Name?: string;
  issuerName?: string;
  issuerAddress?: string;
  issuerTaxNumber?: string;
  issuerLogo?: string;
  recipientName?: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export type CatalogueUnit = 'pi2' | 'pi_lin' | 'boite' | 'rouleau' | 'unite' | 'lot';

export interface CatalogueMaterial {
  id: string;
  name: string;
  emoji: string;
  pricePerSqFt: number; // Prix payé au sous-traitant / unité (utilisé pour calculer la paie en mode Surface)
  supplierPrice?: number; // Coût payé au fournisseur / unité
  clientPrice?: number; // Prix chargé au client / unité
  supplierId?: string; // Référence vers Supplier.id
  unit?: CatalogueUnit; // Unité de vente : pi², pi linéaire, boîte, rouleau, unité, lot (défaut : pi2)
  unitNote?: string; // Précision libre, ex: "≈340 pièces/boîte"
  imageUrl?: string;
  imageAlt?: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  emoji: string;
  minThreshold: number;
}


export type ToolAssetStatus = 'in_service' | 'loaned' | 'repair' | 'missing' | 'stolen' | 'retired';
// Source unique des statuts acceptés : sert à valider ce qui vient de la base
// avant que l'interface ne s'en serve pour chercher un libellé.
export const TOOL_ASSET_STATUSES: ToolAssetStatus[] = [
  'in_service', 'loaned', 'repair', 'missing', 'stolen', 'retired'
];
export function normalizeToolAssetStatus(value: unknown): ToolAssetStatus {
  const candidate = String(value || '');
  return (TOOL_ASSET_STATUSES as string[]).includes(candidate)
    ? (candidate as ToolAssetStatus)
    : 'in_service';
}

export interface ToolAsset {
  id: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  serialNumber: string;
  assetTag: string;
  purchaseDate: string;
  purchasePrice: number;
  replacementValue: number;
  seller: string;
  warrantyExpiry: string;
  currentLocation: string;
  assignedEmployeeId?: string;
  assignedEmployeeName?: string;
  status: ToolAssetStatus;
  notes: string;
  toolPhoto?: string;
  serialPhoto?: string;
  receiptPhoto?: string;
  receiptFileName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ToolTheftSnapshot {
  toolId: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  serialNumber: string;
  assetTag: string;
  purchaseDate: string;
  purchasePrice: number;
  replacementValue: number;
  currentLocation: string;
  assignedEmployeeName?: string;
  notes: string;
  hasToolPhoto: boolean;
  hasSerialPhoto: boolean;
  hasReceipt: boolean;
  receiptFileName?: string;
}

export interface ToolTheftReport {
  id: string;
  incidentDate: string;
  incidentTime: string;
  incidentLocation: string;
  circumstances: string;
  discoveredBy: string;
  policeService: string;
  policeFileNumber: string;
  insurer: string;
  insuranceClaimNumber: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  toolIds: string[];
  toolSnapshots: ToolTheftSnapshot[];
  totalReplacementValue: number;
  status: 'draft' | 'reported' | 'insurance_submitted' | 'closed';
  createdAt: string;
  updatedAt: string;
}

export interface SupplierOrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface SupplierOrder {
  id: string;
  supplierName: string;
  date: string;
  items: SupplierOrderItem[];
  status: 'ordered' | 'received' | 'pending';
  totalAmount: number;
}

export interface Client {
  id: string;
  name: string;
  company?: string;
  email: string;
  phone: string;
  address: string;
}

export interface CompanyInfo {
  name: string;
  address: string;
  phone: string;
  email: string;
  gstNumber: string; // TPS
  qstNumber: string; // TVQ
  wcbNumber: string; // CNESST / WCB / Workers' Comp registration
  bnNumber: string; // NEQ / BN
  constructionLicenseNumber?: string; // ex: Permis RBQ (Québec) ou licence d'entrepreneur locale
  logo: string;
  interacEmail: string;
  bankDetails: {
    bank: string;
    transit: string;
    institution: string;
    account: string;
  };
  geofencingEnabled: boolean;
  vacationRate: number; // e.g. 4% or 6% or 8%
  legalMinimumWage: number; // minimum légal
  voiceReminderVolume: number; // 0-100
  voiceReminderSchedule: string; // hours e.g., "08:00, 12:00, 17:00"
  paymentTerms: string; // conditions de paiement

  // Conditions par défaut appliquées aux nouveaux devis/contrats/factures
  defaultLateInterestPct?: number;
  defaultWarrantyYears?: number;
  defaultClauseChangeOrder?: string;
  defaultClauseResiliation?: string;

  // Salaried Payroll Settings
  payrollVacationRate?: number;
  payrollHealthInsurance?: number;
  payrollDentalInsurance?: number;
  payrollLifeInsurance?: number;
  payrollLTD?: number;
  payrollRRSP?: number;
  payrollEAP?: number;
  payrollCustom1Name?: string;
  payrollCustom1Amount?: number;
  payrollCustom2Name?: string;
  payrollCustom2Amount?: number;
  
  // Onboarding metadata
  isOnboarded?: boolean;
  country?: 'CA' | 'US' | 'EU';
  region?: string;
  taxRate1?: number; // Federal tax rate e.g. 0.05
  taxRate2?: number; // Provincial/state tax rate e.g. 0.09975
  taxRate1Name?: string; // e.g. "GST" or "TPS"
  taxRate2Name?: string; // e.g. "PST" or "TVQ" or "State Tax"
  paymentDepositPct?: number;
  paymentMidPct?: number;
  paymentFinalPct?: number;

  // Internationalisation, fiscalité et confidentialité
  currency?: string;
  unitSystem?: 'imperial' | 'metric';
  dateLocale?: string;
  // Fuseau horaire des journées de travail (ex. « America/Edmonton »). Laissé
  // vide, l'application utilise celui de l'appareil : le téléphone du
  // travailleur et le bureau sont normalement dans la même province. À définir
  // seulement si les chantiers ou le personnel se trouvent dans un autre fuseau.
  timeZone?: string;
  localTaxRate?: number;
  taxConfirmedAt?: string;
  taxDisclaimerAcceptedAt?: string;
  dataStorageMode?: 'local' | 'supabase' | 'personal_cloud' | 'hybrid' | 'cloud';
  cloudSyncConsent?: boolean;
  cloudRegion?: string;
  personalCloudProvider?: 'google_drive' | 'onedrive' | 'dropbox' | 'icloud_drive' | 'samsung_cloud' | 'device_folder' | 'other';
  backupFolderName?: string;
  backupFileName?: string;
  backupConnectionMethod?: 'directory_handle' | 'file_handle' | 'system_export';
  personalBackupConnected?: boolean;
  personalBackupAutomatic?: boolean;
  lastPersonalBackupAt?: string;
  privacyPolicyVersion?: string;
  privacyPolicyAcceptedAt?: string;
  privacyContactEmail?: string;
  privacyOfficerName?: string;
  retentionMonths?: number;
  employeeDataBasisConfirmed?: boolean;
  locationDataNoticeConfirmed?: boolean;
  crossBorderTransferAcknowledgedAt?: string;
  processorTermsAcceptedAt?: string;
  complianceVersion?: string;
  testMode?: boolean;

  // Assistant IA
  aiProvider?: 'gemini' | 'anthropic' | 'openai';
  aiApiKey?: string;
}

export interface WeeklyGoal {
  employeeId: string;
  targetAmount: number; // objectif $ de la semaine
  currentAmount: number; // revenus accumulés cette semaine
  weekStart: string; // reset automatique chaque lundi (YYYY-MM-DD)
  xpPoints: number; // XP cumulatifs depuis le début
  level: number; // calculé depuis xpPoints
  streak: number; // jours consécutifs avec punch in
  lastPunchDate: string | null;
}

export interface MotivationTeam {
  id: string;
  name: string;
  memberIds: string[];
  color: string;
  active: boolean;
  createdAt: string;
  leaderId?: string; // chef d'équipe (peut voir les stats de son équipe)
  projectIds?: string[]; // projets assignés à cette équipe
}

export interface MotivationGoal {
  id: string;
  title: string;
  scope: 'company' | 'team' | 'individual';
  metric: 'revenue' | 'hours' | 'jobs_completed' | 'checklist_done' | 'safety_days' | 'custom';
  target: number;
  current: number; // mis à jour manuellement ou auto
  startDate: string;
  endDate?: string;
  teamId?: string; // si scope = 'team'
  employeeId?: string; // si scope = 'individual'
  rewardType: 'lunch' | 'draw' | 'bonus' | 'gift' | 'trip' | 'custom';
  rewardTitle: string; // ex : "Dîner payé pour l'équipe"
  rewardDescription?: string;
  status: 'active' | 'paused' | 'achieved' | 'cancelled';
}

export interface HRAlert {
  id: string;
  type: 'warning' | 'info' | 'danger';
  title: string;
  message: string;
  date: string;
  employeeId?: string;
  employeeName?: string;
  resolved: boolean;
}

export interface GCPDocumentLineItem {
  id: string;
  description: string;
  qty: number;
  unit: string; // e.g., 'pi²', 'h', 'unité', 'forfait'
  unitPrice: number;
  total: number;
}

export interface GCPDocumentMaterialLine {
  id: string;
  claddingType: string; // ex: 'Fibre de ciment', 'Vinyle', 'Bois', 'Composite'
  brand: string; // ex: 'James Hardie', 'Gentek', 'LP SmartSide'
  thickness: string; // e.g., '1/2"', '7/16"'
  qtySqft: number;
  supplier: string;
  unitPrice: number; // $/pi²
  total: number;
}

export interface GCPDocumentLabourLine {
  id: string;
  task: string; // ex: 'Dépose', 'Préparation', 'Installation', 'Finitions', 'Nettoyage'
  estimatedHours: number;
  rate: number;
  isFlatRate: boolean;
  total: number;
}

export interface GCPDocumentOtherLine {
  id: string;
  description: string;
  amount: number;
}

export interface GCPDocumentSubcontractLine {
  id: string;
  companyName: string;
  phone: string;
  workType: string;
  amount: number;
}

export interface GCPDocumentPaymentHistoryEntry {
  id: string;
  date: string;
  amount: number;
  method: string; // ex: 'cheque', 'etransfer', 'virement', 'cash'
  notes?: string;
}

export interface GCPDocument {
  id: string;
  type: 'invoice' | 'quote' | 'contract';
  number: string; // Auto generated e.g., FAC-2026-0001
  date: string;
  dueDate: string;
  status: 'draft' | 'sent' | 'accepted' | 'completed' | 'paid' | 'overdue';
  refQuote?: string;
  refContract?: string;

  // Client Details
  clientId: string;
  clientName: string;
  clientAddress: string;
  clientEmail: string;
  clientPhone: string;
  siteAddress?: string;

  // Document Lines (categorized or simple)
  isSimpleLayout: boolean;
  lineItems: GCPDocumentLineItem[];
  materialLines: GCPDocumentMaterialLine[];
  labourLines: GCPDocumentLabourLine[];
  otherLines: GCPDocumentOtherLine[];
  subcontractLines: GCPDocumentSubcontractLine[];

  // Financial Summary
  subtotal: number;
  discountPct: number; // percentage
  taxRate: number; // combined tax percentage
  taxAmount: number;
  total: number;
  holdbackPct: number; // Builders' Lien Act
  holdbackAmount: number;
  depositAmount: number; // deposit requested / received
  balanceDue: number; // total - holdback - partialPayments

  // Payment schedule & terms
  acceptedPayments: Array<'cheque' | 'etransfer' | 'virement' | 'cash'>;
  lateInterestPct: number; // default: 2
  depositPct: number; // default: 25
  paymentMidPct: number; // default: 25
  paymentFinalPct: number; // default: 50

  // Dates & Permits
  workStartDate?: string;
  workEndDate?: string;
  quoteValidDays: number; // default 30
  permitBy: 'client' | 'contractor' | 'na';

  // Warranty & Insurances
  warrantyYears: number; // default 2
  hasInsurance: boolean;
  subcontractAuthorized: boolean;
  subcontractorName?: string;
  subcontractorPhone?: string;
  subcontractorLicense?: string;

  // Legal Clauses for Contracts
  contractObject?: string;
  clauseChangeOrder?: string;
  clauseResiliation?: string;
  clauseWarrantyDetails?: string;

  // Electronic Signature
  clientSignature?: string; // Base64 signature image data
  ownerName: string;
  ownerSignature?: string;
  signedAt?: string;

  // Payment histories
  paymentsHistory: GCPDocumentPaymentHistoryEntry[];
}

export interface ExpenseRecord {
  id: string;
  provider: string; // fournisseur
  category: 'materials' | 'tools' | 'fuel' | 'rental' | 'subcontractor' | 'admin' | 'other';
  projectId: string; // project association
  amount: number;
  tax: number;
  date: string;
  notes?: string;
  photoUrl?: string;        // photo du reçu/article (data URL redimensionnée côté client)
  submittedById?: string;   // employé/sous-traitant qui a soumis la dépense du terrain
  submittedByName?: string;
}

export interface PayrollPayment {
  id: string;
  employeeId: string;
  employeeName: string;
  projectId?: string; // optionnel: associer à un projet pour la marge brute
  period: string; // ex: "2026-06" ou "Semaine 23"
  amount: number;
  status: 'draft' | 'approved' | 'paid' | 'held' | 'refused';
  date: string;
  hours?: number;
}


// ---------------------------------------------------------------------------
// Photos de chantier — dossier avant / pendant / après
// ---------------------------------------------------------------------------
// Preuve d'état initial et d'exécution : réclamation d'assurance, litige avec
// un client, et matériel de vente. La position GPS est enregistrée quand elle
// est disponible, car une photo datée et localisée a bien plus de valeur
// probante qu'une photo seule.
export type ProjectPhotoPhase = 'before' | 'during' | 'after';

export interface ProjectPhoto {
  id: string;
  projectId: string;
  phase: ProjectPhotoPhase;
  imageUrl: string;        // data URL JPEG redimensionnée côté client
  caption?: string;
  takenAt: string;         // ISO
  takenById?: string;      // employé qui a pris la photo (imposé par le serveur)
  takenByName?: string;
  latitude?: number;
  longitude?: number;
}


// ---------------------------------------------------------------------------
// Ordres de changement — les extras constatés en cours de chantier
// ---------------------------------------------------------------------------
// Contreplaqué pourri, solin supplémentaire, ventilation non prévue : sans
// trace signée, le travail est fait mais personne ne l'a approuvé, et la
// facture finale devient une négociation. Un extra signé sur place est
// approuvé immédiatement ; sans signature il reste en attente du bureau.
export type ChangeOrderStatus = 'pending' | 'approved' | 'refused' | 'invoiced';

export interface ChangeOrder {
  id: string;
  projectId: string;
  number: string;            // OC-001, OC-002…
  description: string;
  reason?: string;           // ce qui l'a rendu nécessaire
  amount: number;            // avant taxes
  photoUrl?: string;         // preuve de la situation constatée
  status: ChangeOrderStatus;
  createdAt: string;
  createdById?: string;      // imposé par le serveur
  createdByName?: string;
  clientName?: string;
  clientSignature?: string;  // data URL
  signedAt?: string;
}


// ---------------------------------------------------------------------------
// Réclamations d'assurance — grêle, vent, dégât d'eau
// ---------------------------------------------------------------------------
// Les chiffres d'une réclamation ne doivent pas être mélangés :
//   rcv  valeur à neuf (coût de remplacement aujourd'hui)
//   acv  valeur au jour du sinistre (rcv moins la dépréciation)
//   dépréciation récupérable = rcv − acv, versée après exécution des travaux
//   premier chèque ≈ acv − franchise
// L'application calcule ces écarts plutôt que de les faire saisir, pour qu'une
// erreur d'arithmétique ne fasse pas oublier un montant à réclamer.
export type InsuranceLossType = 'hail' | 'wind' | 'water' | 'fire' | 'other';
export type InsuranceClaimStatus = 'open' | 'submitted' | 'approved' | 'partial' | 'denied' | 'closed';

export interface InsuranceClaim {
  id: string;
  projectId: string;
  insurer: string;
  claimNumber: string;
  policyNumber?: string;
  lossType: InsuranceLossType;
  lossDate?: string;
  adjusterName?: string;      // expert en sinistre
  adjusterPhone?: string;
  adjusterEmail?: string;
  deductible?: number;        // franchise
  acv?: number;               // valeur au jour du sinistre
  rcv?: number;               // valeur à neuf
  supplementAmount?: number;  // suppléments demandés
  approvedAmount?: number;
  status: InsuranceClaimStatus;
  notes?: string;
  createdAt: string;
  createdById?: string;       // imposé par le serveur
  createdByName?: string;
}


// ---------------------------------------------------------------------------
// Prospects — le parcours AVANT le devis
// ---------------------------------------------------------------------------
// Appel entrant → contacté → inspection → soumission → vendu ou perdu. Le motif
// de perte est la seule donnée qui permet d'améliorer le taux de conversion :
// on le demande donc systématiquement quand un dossier est marqué perdu.
export type LeadStatus = 'new' | 'contacted' | 'inspection' | 'quoted' | 'won' | 'lost';
export type LeadSource = 'referral' | 'phone' | 'website' | 'door' | 'repeat' | 'insurance' | 'other';

export interface Lead {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  source: LeadSource;
  status: LeadStatus;
  estimatedValue?: number;
  nextFollowUp?: string;   // date de relance (AAAA-MM-JJ)
  notes?: string;
  lostReason?: string;
  createdAt: string;
  createdById?: string;    // imposé par le serveur
  createdByName?: string;
  convertedClientId?: string;
  convertedProjectId?: string;
}


// ---------------------------------------------------------------------------
// Planification des équipes — qui va où, quel jour
// ---------------------------------------------------------------------------
// Le pointage dit où les gens ÉTAIENT ; ces affectations disent où ils DOIVENT
// être. Un employé ne peut avoir qu'une affectation par jour : assigner
// quelqu'un ailleurs remplace l'affectation existante.
export interface ShiftAssignment {
  id: string;
  date: string;            // AAAA-MM-JJ
  projectId: string;
  employeeId: string;
  employeeName?: string;
  note?: string;
  createdAt: string;
  createdById?: string;    // imposé par le serveur
  createdByName?: string;
}


// ---------------------------------------------------------------------------
// Sécurité de chantier — causeries et analyses de risques
// ---------------------------------------------------------------------------
// L'OH&S de l'Alberta exige une évaluation des dangers propre au chantier avant
// le début des travaux. Ce qui donne sa valeur au document n'est pas la liste
// des dangers, c'est la SIGNATURE des travailleurs présents : une fiche non
// signée ne prouve rien.
export type SafetyRecordType = 'toolbox' | 'hazard';

export interface SafetyAttendee {
  employeeId: string;
  employeeName: string;
  signature?: string;   // data URL
  signedAt?: string;
}

export interface SafetyRecord {
  id: string;
  type: SafetyRecordType;
  projectId: string;
  date: string;            // AAAA-MM-JJ
  topic: string;
  hazards?: string[];      // dangers cochés (analyse de risques)
  controls?: string;       // mesures de contrôle appliquées
  weather?: string;        // conditions du jour — déterminant en toiture
  notes?: string;
  attendees: SafetyAttendee[];
  createdAt: string;
  createdById?: string;    // imposé par le serveur
  createdByName?: string;
}
