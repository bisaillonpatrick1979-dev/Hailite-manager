// Routes API partagées entre le serveur Node traditionnel (server.ts, utilisé en
// développement et sur un hébergement Node persistant) et la fonction serverless
// Vercel (api/index.ts). Isolé dans son propre module pour être monté sur
// n'importe quelle instance Express sans dupliquer la logique.
//
// SÉCURITÉ : la clé Supabase secrète reste côté serveur ; chaque route
// de données exige un jeton de session (voir auth.ts) et applique une matrice
// de permissions par table + rôle, un scoping strict par company_id, la
// redaction des colonnes sensibles (NIP, NAS/SIN, banque, clés API) et un
// journal d'audit sur toutes les écritures.
import express from 'express';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
// Extension .js obligatoire (ESM sur Vercel) — voir le commentaire dans api/index.ts.
import { supabase, supabaseEnabled, resolveCompanyId, TABLES_WITH_COMPANY_ID, TABLE_ID_COLUMN } from './db.js';
import {
  AppRole, AuthContext, AuthedRequest,
  requireAuth, attachAuthOptional, verifyCredentials, signSession,
  isLoginThrottled, recordLoginFailure, clearLoginFailures, logAudit,
  createLoginHandle, hashPin, SESSION_COOKIE_NAME
} from './auth.js';
import { USER_PRIVACY_NOTICE_VERSION } from './privacyVersions.js';
import {
  applyReview, buildSubmittedCredential, canReviewCredential, compareReadingToDeclared,
  inspectionVerdict, parseCredentialReading, validateSubmission,
  CREDENTIAL_READING_INSTRUCTION, type SubmissionInput
} from './credentialVerification.js';

// Une carte soumise par un travailleur ne peut pas se déclarer vérifiée : la
// méthode est bornée ici, côté serveur, et non lue telle quelle depuis la
// requête.
const ALLOWED_VERIFICATION_METHODS = new Set(['registry', 'issuer', 'document', 'other']);

// Garde-fou contre une fiche qui gonflerait indéfiniment : chaque carte porte
// deux photos, et app_users est relu à chaque hydratation.
const MAX_CREDENTIALS_PER_USER = 40;

// Toutes les tables exposées par la couche de données générique (voir supabase_migration.sql)
const KNOWN_TABLES = [
  'companies', 'app_users', 'projects', 'project_tools', 'project_assignments', 'project_tasks',
  'punches', 'catalog_items', 'suppliers', 'inventory_items', 'tool_assets', 'tool_theft_reports', 'supplier_orders', 'supplier_order_items',
  'clients', 'documents', 'document_items', 'document_payments', 'payroll_entries', 'payroll_payments',
  'production_entries', 'weekly_goals', 'motivation_teams', 'motivation_goals', 'hr_alerts', 'expenses',
  'project_photos', 'change_orders', 'insurance_claims', 'leads', 'shift_assignments', 'safety_records'
];

// ---------------------------------------------------------------------------
// Matrice de permissions par table et par rôle
// ---------------------------------------------------------------------------
const ALL_ROLES: AppRole[] = ['admin', 'secretary', 'accountant', 'employee'];
const OFFICE: AppRole[] = ['admin', 'secretary', 'accountant'];
const MANAGERS: AppRole[] = ['admin', 'secretary'];
const ADMIN_ONLY: AppRole[] = ['admin'];

const TABLE_READ_ROLES: Record<string, AppRole[]> = {
  companies: ALL_ROLES, app_users: ALL_ROLES,
  projects: ALL_ROLES, project_tasks: ALL_ROLES, project_tools: ALL_ROLES, project_assignments: ALL_ROLES,
  punches: ALL_ROLES, catalog_items: ALL_ROLES, suppliers: ALL_ROLES, inventory_items: ALL_ROLES,
  tool_assets: OFFICE, tool_theft_reports: OFFICE,
  supplier_orders: ALL_ROLES, supplier_order_items: ALL_ROLES,
  clients: OFFICE, documents: OFFICE, document_items: OFFICE, document_payments: OFFICE,
  payroll_entries: ALL_ROLES, payroll_payments: ALL_ROLES, production_entries: OFFICE,
  weekly_goals: ALL_ROLES, motivation_teams: ALL_ROLES, motivation_goals: ALL_ROLES,
  hr_alerts: MANAGERS, expenses: OFFICE, project_photos: ALL_ROLES, change_orders: ALL_ROLES,
  insurance_claims: OFFICE, leads: OFFICE, shift_assignments: ALL_ROLES,
  safety_records: ALL_ROLES
};

const TABLE_WRITE_ROLES: Record<string, AppRole[]> = {
  companies: ADMIN_ONLY, app_users: ADMIN_ONLY,
  projects: MANAGERS, project_tasks: ALL_ROLES, project_tools: ALL_ROLES, project_assignments: MANAGERS,
  punches: ALL_ROLES, catalog_items: MANAGERS, suppliers: MANAGERS, inventory_items: MANAGERS,
  tool_assets: MANAGERS, tool_theft_reports: MANAGERS,
  supplier_orders: MANAGERS, supplier_order_items: MANAGERS,
  clients: MANAGERS, documents: MANAGERS, document_items: MANAGERS, document_payments: MANAGERS,
  payroll_entries: ALL_ROLES, payroll_payments: ADMIN_ONLY, production_entries: MANAGERS,
  weekly_goals: ALL_ROLES, motivation_teams: ADMIN_ONLY, motivation_goals: ADMIN_ONLY,
  // expenses : les employés/sous-traitants soumettent leurs dépenses de terrain
  // (INSERT seulement — voir allowExpenseMethod) ; gestion complète pour le bureau
  // project_photos : les employés photographient le chantier (INSERT seulement,
  // voir allowProjectPhotoMethod) ; correction et suppression réservées à la gestion
  // insurance_claims : consultable par tous, écrit par la gestion seulement
  hr_alerts: ALL_ROLES, expenses: ALL_ROLES, project_photos: ALL_ROLES, change_orders: ALL_ROLES,
  // leads : la prospection appartient au bureau
  // shift_assignments : chacun consulte son horaire, la gestion le bâtit
  // safety_records : le terrain crée la fiche et collecte les signatures
  insurance_claims: MANAGERS, leads: MANAGERS, shift_assignments: MANAGERS,
  safety_records: ALL_ROLES
};

// Colonne "propriétaire" pour les contraintes de ligne des rôles non gestionnaires
const OWNER_COLUMN: Record<string, string> = {
  app_users: 'id',
  punches: 'employee_id',
  payroll_entries: 'user_id',
  payroll_payments: 'employee_id',
  weekly_goals: 'employee_id',
  shift_assignments: 'employee_id'
};
// Lecture restreinte à ses propres lignes pour les rôles hors bureau
const READ_OWN_ONLY = new Set([
  'app_users', 'punches', 'payroll_entries', 'payroll_payments', 'weekly_goals', 'shift_assignments'
]);
// Écriture restreinte à ses propres lignes pour les rôles non gestionnaires
const WRITE_OWN_ONLY = new Set(['punches', 'payroll_entries', 'weekly_goals']);

// ---------------------------------------------------------------------------
// Redaction des colonnes sensibles — le navigateur (et donc le modèle IA qui
// reçoit son contexte) ne voit jamais : clés API, NIP, NAS/SIN, coordonnées
// bancaires. Le NIP n'est visible pour aucun rôle, y compris l'administrateur.
// ---------------------------------------------------------------------------
const SENSITIVE_ALWAYS: Record<string, string[]> = {
  companies: ['ai_api_key'],
  app_users: ['access_code_hash', 'access_code', 'nip']
};
const SENSITIVE_NON_ADMIN: Record<string, string[]> = {
  app_users: ['access_code_hash', 'sin'],
  companies: ['bank_name', 'bank_transit', 'bank_institution', 'bank_account', 'interac_email']
};

function sanitizeRow(table: string, row: Record<string, any>, role: AppRole): Record<string, any> {
  const out = { ...row };
  for (const col of SENSITIVE_ALWAYS[table] || []) delete out[col];
  if (role !== 'admin') {
    for (const col of SENSITIVE_NON_ADMIN[table] || []) delete out[col];
  }
  if (table === 'project_photos' && out.id) {
    // Le chemin Storage ou l'ancienne data URL ne quitte jamais l'API. Le
    // téléchargement passe par une route authentifiée et scopée au tenant.
    out.image_url = `/api/files/project-photo/${encodeURIComponent(String(out.id))}`;
  }
  return out;
}
function sanitizeRows(table: string, rows: any[], role: AppRole): any[] {
  return (rows || []).map(r => sanitizeRow(table, r, role));
}

const isManager = (role: AppRole) => role === 'admin' || role === 'secretary';
const canRead = (table: string, role: AppRole) => (TABLE_READ_ROLES[table] || ADMIN_ONLY).includes(role);
const canWrite = (table: string, role: AppRole) => (TABLE_WRITE_ROLES[table] || ADMIN_ONLY).includes(role);
const protectedRuntime = supabaseEnabled || process.env.NODE_ENV === 'production';
const PROJECT_MEDIA_BUCKET = process.env.SUPABASE_PROJECT_MEDIA_BUCKET || 'project-media';
const EMPLOYEE_PROJECT_TABLES = new Set([
  'project_tasks', 'project_tools', 'project_assignments', 'project_photos',
  'change_orders', 'safety_records'
]);
const PARENT_SCOPE: Record<string, { table: string; foreignKey: string }> = {
  supplier_order_items: { table: 'supplier_orders', foreignKey: 'order_id' },
  document_items: { table: 'documents', foreignKey: 'document_id' },
  document_payments: { table: 'documents', foreignKey: 'document_id' },
  weekly_goals: { table: 'app_users', foreignKey: 'employee_id' }
};
const USER_REFERENCE_COLUMN: Record<string, string> = {
  project_assignments: 'user_id',
  project_tasks: 'assigned_user_id',
  punches: 'employee_id',
  payroll_entries: 'user_id',
  payroll_payments: 'employee_id',
  production_entries: 'user_id',
  weekly_goals: 'employee_id',
  hr_alerts: 'employee_id',
  motivation_goals: 'employee_id',
  shift_assignments: 'employee_id'
};

async function employeeProjectIds(auth: AuthContext): Promise<string[]> {
  if (auth.role !== 'employee' || !supabase) return [];
  const { data, error } = await supabase
    .from('project_assignments')
    .select('project_id')
    .eq('company_id', auth.companyId)
    .eq('user_id', auth.userId)
    .limit(500);
  if (error) throw error;
  return Array.from(new Set((data || []).map((row: any) => String(row.project_id)).filter(Boolean)));
}

function applyReadScope(query: any, table: string, auth: AuthContext, projectIds: string[]): any {
  if (auth.role !== 'employee') return query;
  if (READ_OWN_ONLY.has(table)) return query.eq(OWNER_COLUMN[table], auth.userId);
  if (table === 'projects') {
    return projectIds.length > 0 ? query.in('id', projectIds) : query.eq('id', '00000000-0000-0000-0000-000000000000');
  }
  if (table === 'project_assignments') return query.eq('user_id', auth.userId);
  if (EMPLOYEE_PROJECT_TABLES.has(table)) {
    return projectIds.length > 0
      ? query.in('project_id', projectIds)
      : query.eq('project_id', '00000000-0000-0000-0000-000000000000');
  }
  return query;
}

// ---------------------------------------------------------------------------
// Géorepérage vérifié par le serveur
// ---------------------------------------------------------------------------
// La règle de géorepérage vivait uniquement dans le navigateur : le serveur
// acceptait n'importe quel pointage et faisait confiance au drapeau
// `within_geofence` envoyé par le client. Refuser la permission de
// localisation, ou rejouer la requête à la main, suffisait donc à pointer de
// n'importe où. Le serveur recalcule maintenant la distance lui-même.
//
// Le couple exactement (0, 0) marque un chantier dont les coordonnées n'ont
// jamais été saisies — voir hasProjectCoordinates côté client.
function projectIsGeofenced(project: { latitude: unknown; longitude: unknown }): boolean {
  const latitude = Number(project.latitude);
  const longitude = Number(project.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  return !(latitude === 0 && longitude === 0);
}

// Distance orthodromique en mètres (même formule que le client).
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(deltaPhi / 2) ** 2
    + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

interface GeofenceVerdict {
  ok: boolean;
  error?: string;
  distanceMeters?: number;
  radiusMeters?: number;
}

// Réécrit `within_geofence` et `approval_status` à partir de la position
// réellement transmise. Le client ne décide plus de sa propre conformité.
export async function enforcePunchGeofence(
  payload: Record<string, any>,
  auth: AuthContext
): Promise<GeofenceVerdict> {
  // La gestion peut saisir un pointage pour autrui (correction, oubli) : le
  // géorepérage vise le travailleur sur le terrain.
  if (isManager(auth.role)) return { ok: true };
  if (!supabase || typeof payload.project_id !== 'string' || !payload.project_id) return { ok: true };

  const { data: company } = await supabase
    .from('companies')
    .select('geofencing_enabled')
    .eq('id', auth.companyId)
    .maybeSingle();
  if (!company || company.geofencing_enabled === false) return { ok: true };

  const { data: project } = await supabase
    .from('projects')
    .select('latitude, longitude, radius')
    .eq('id', payload.project_id)
    .eq('company_id', auth.companyId)
    .maybeSingle();
  if (!project || !projectIsGeofenced(project)) return { ok: true };

  const latitude = Number(payload.latitude);
  const longitude = Number(payload.longitude);
  const hasPosition = Number.isFinite(latitude) && Number.isFinite(longitude);

  if (!hasPosition) {
    // Position indisponible : on n'empêche pas de travailler (sous-sol, toit
    // métallique, permission refusée), mais le pointage ne peut pas prétendre
    // avoir été vérifié et part en attente d'approbation.
    payload.within_geofence = false;
    payload.approval_status = 'pending';
    return { ok: true };
  }

  const radius = Number(project.radius);
  const radiusMeters = Number.isFinite(radius) && radius > 0 ? radius : 100;
  const distanceMeters = haversineMeters(latitude, longitude, Number(project.latitude), Number(project.longitude));

  if (distanceMeters > radiusMeters) {
    return {
      ok: false,
      distanceMeters,
      radiusMeters,
      error: `Pointage refusé : vous êtes à ${distanceMeters} m du chantier (maximum ${radiusMeters} m).`
    };
  }

  payload.within_geofence = true;
  return { ok: true, distanceMeters, radiusMeters };
}

async function hasProjectAccess(auth: AuthContext, projectId: unknown): Promise<boolean> {
  if (!supabase || typeof projectId !== 'string' || !projectId) return false;
  const { data: project, error } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('company_id', auth.companyId)
    .maybeSingle();
  if (error || !project) return false;
  if (auth.role !== 'employee') return true;
  const { data: assignment, error: assignmentError } = await supabase
    .from('project_assignments')
    .select('project_id')
    .eq('company_id', auth.companyId)
    .eq('project_id', projectId)
    .eq('user_id', auth.userId)
    .maybeSingle();
  return !assignmentError && !!assignment;
}

async function parentBelongsToCompany(table: string, payload: Record<string, any>, companyId: string): Promise<boolean> {
  if (!supabase || !PARENT_SCOPE[table]) return true;
  const parent = PARENT_SCOPE[table];
  const parentId = String(payload[parent.foreignKey] || '');
  if (!parentId) return false;
  const { data, error } = await supabase
    .from(parent.table)
    .select('id')
    .eq('id', parentId)
    .eq('company_id', companyId)
    .maybeSingle();
  return !error && !!data;
}

async function userReferenceBelongsToCompany(
  table: string,
  payload: Record<string, any>,
  companyId: string
): Promise<boolean> {
  if (!supabase) return false;
  const column = USER_REFERENCE_COLUMN[table];
  if (!column) return true;
  const rawUserId = payload[column];
  // Certaines références sont facultatives (p. ex. tâche non assignée).
  // Les contraintes NOT NULL de la table valident les références obligatoires.
  if (rawUserId === undefined || rawUserId === null || rawUserId === '') return true;
  const { data, error } = await supabase
    .from('app_users')
    .select('id')
    .eq('id', String(rawUserId))
    .eq('company_id', companyId)
    .maybeSingle();
  return !error && !!data;
}

async function prepareAppUserPin(payload: Record<string, any>, required: boolean): Promise<void> {
  const rawPin = payload.access_code ?? payload.nip;
  delete payload.access_code;
  delete payload.nip;
  // Le client n'a jamais le droit de fournir directement un prétendu hash.
  delete payload.access_code_hash;
  if (rawPin === undefined || rawPin === null || rawPin === '') {
    if (required) throw new Error('PIN_REQUIRED');
    return;
  }
  const pin = String(rawPin);
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN_INVALID');
  payload.access_code_hash = await hashPin(pin);
}

function decodeImageDataUrl(value: unknown): { bytes: Buffer; mimeType: string; extension: string } | null {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(value || ''));
  if (!match) return null;
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length === 0 || bytes.length > 5 * 1024 * 1024) return null;
  const extension = match[1] === 'image/png' ? 'png' : match[1] === 'image/webp' ? 'webp' : 'jpg';
  return { bytes, mimeType: match[1], extension };
}

async function uploadProjectPhoto(auth: AuthContext, projectId: string, photoId: string, dataUrl: unknown): Promise<string> {
  if (!supabase) throw new Error('STORAGE_UNAVAILABLE');
  const decoded = decodeImageDataUrl(dataUrl);
  if (!decoded) throw new Error('PHOTO_INVALID');
  const objectPath = `${auth.companyId}/${projectId}/${photoId}-${crypto.randomBytes(8).toString('hex')}.${decoded.extension}`;
  const { error } = await supabase.storage
    .from(PROJECT_MEDIA_BUCKET)
    .upload(objectPath, decoded.bytes, { contentType: decoded.mimeType, upsert: false });
  if (error) throw error;
  return objectPath;
}

function applyTenantWriteScope(query: any, table: string, auth: AuthContext): any {
  if (TABLES_WITH_COMPANY_ID.has(table)) return query.eq('company_id', auth.companyId);
  if (table === 'companies') return query.eq('id', auth.companyId);
  return query;
}

// ---------------------------------------------------------------------------
// Instruction système de l'assistant IA
// ---------------------------------------------------------------------------
function buildSystemInstruction(regionLabel?: string, language?: string): string {
  const location = regionLabel && regionLabel.trim() ? regionLabel.trim() : 'Amérique du Nord';
  // Langue de réponse : suit la langue choisie dans l'application (FR par défaut)
  const replyLanguage = language === 'EN' ? 'Always reply in English.' : 'Réponds toujours en français.';
  return `
    Tu es l'assistant d'IA intelligent d'une entreprise de pose de toiture et parement extérieur appelée "Hailite Xteriors", basée en ${location}.
    L'application de gestion de chantier s'appelle "Gestion Chantier Pro".
    Ton but est d'aider les administrateurs et les ouvriers sur les chantiers de construction.
    Base tes réponses de conformité, de sécurité et de charges sociales sur les règles applicables en ${location} — ne présume jamais que l'entreprise est au Québec à moins que ce soit précisé.
    Donne des conseils professionnels et clairs.
    Réponds de manière concise, polie et technique pour les calculs de toiture, la rentabilité de chantier, la sécurité ou la gestion de l'inventaire.
    Si une photo est jointe (chantier, toiture, revêtement, matériau, dommage, document), analyse-la en détail : état, matériaux visibles, problèmes potentiels, sécurité, estimation des travaux.
    Si la pièce jointe est une FACTURE ou un REÇU d'achat (magasin, quincaillerie, station-service, location d'équipement) et que l'outil create_expense est disponible : extrais le nom du fournisseur, la date, le sous-total avant taxes et le total des taxes (TPS/TVQ ou GST), choisis la catégorie appropriée, appelle create_expense, puis résume ce que tu as enregistré (fournisseur, montant, taxes, catégorie). Si le total seul est visible, estime le sous-total en retirant les taxes affichées ; ne devine jamais un montant illisible — demande plutôt confirmation.
    Si un document PDF est joint (soumission, plan, devis, facture, contrat), lis-le et résume ou analyse son contenu selon la question posée.
    Ne demande jamais et ne révèle jamais de NIP, de numéro d'assurance sociale (NAS/SIN), de clé API ni de coordonnées bancaires.
    N'utilise les outils (fonctions) QUE si l'utilisateur a clairement demandé l'action correspondante ; sinon réponds simplement en texte.
    ${replyLanguage}
  `;
}

// ---------------------------------------------------------------------------
// Outils (function calling) — remplacent l'ancien protocole texte <<<ACTION>>>.
// Chaque action est une fonction au schéma JSON strict ; le serveur valide les
// arguments avant de les retourner au client, qui les exécute via ses propres
// mutations (elles-mêmes soumises aux permissions ci-dessus lors de la sync).
// ---------------------------------------------------------------------------
interface AiToolDef {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
    additionalProperties: boolean;
  };
}

const AI_TOOL_DEFS: AiToolDef[] = [
  {
    name: 'create_employee',
    description: "Crée un nouvel employé ou sous-traitant dans l'application.",
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: "Nom complet de l'employé" },
        role: { type: 'string', enum: ['admin', 'employee', 'secretary', 'accountant'], description: 'Rôle applicatif' },
        hourlyRate: { type: 'number', description: 'Taux horaire en dollars' },
        workerType: { type: 'string', description: 'Métier / type de travailleur (ex: Compagnon)' },
        phone: { type: 'string', description: 'Téléphone' },
        address: { type: 'string', description: 'Adresse' }
      },
      required: ['name', 'role', 'hourlyRate'],
      additionalProperties: false
    }
  },
  {
    name: 'create_project',
    description: 'Crée un nouveau chantier (projet).',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nom du chantier' },
        clientName: { type: 'string', description: 'Nom du client' },
        address: { type: 'string', description: 'Adresse du chantier' }
      },
      required: ['name'],
      additionalProperties: false
    }
  },
  {
    name: 'create_client',
    description: 'Crée une fiche client.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nom du contact client' },
        phone: { type: 'string' },
        email: { type: 'string' },
        address: { type: 'string' }
      },
      required: ['name'],
      additionalProperties: false
    }
  },
  {
    name: 'add_inventory_item',
    description: "Ajoute un nouvel article à l'inventaire physique.",
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: "Nom de l'article" },
        quantity: { type: 'number', description: 'Quantité initiale' },
        unit: { type: 'string', description: 'Unité de mesure (ex: paquets)' },
        minThreshold: { type: 'number', description: "Seuil minimum d'alerte" }
      },
      required: ['name', 'quantity'],
      additionalProperties: false
    }
  },
  {
    name: 'adjust_inventory',
    description: "Fixe la quantité en stock d'un article d'inventaire existant (par son nom exact).",
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: "Nom exact de l'article existant" },
        quantity: { type: 'number', description: 'Nouvelle quantité (valeur absolue)' }
      },
      required: ['name', 'quantity'],
      additionalProperties: false
    }
  },
  {
    name: 'create_expense',
    description: "Enregistre une dépense d'entreprise. À utiliser notamment quand l'utilisateur joint la photo ou le PDF d'une facture/reçu d'achat : extrais le fournisseur, la date, le montant avant taxes, les taxes, et choisis la catégorie appropriée.",
    parameters: {
      type: 'object',
      properties: {
        provider: { type: 'string', description: 'Nom du fournisseur/magasin (ex: Rona, Petro-Canada)' },
        category: {
          type: 'string',
          enum: ['materials', 'tools', 'fuel', 'rental', 'subcontractor', 'admin', 'other'],
          description: 'Catégorie : materials=matériaux/quincaillerie, tools=outils/équipement, fuel=carburant, rental=location d\'équipement, subcontractor=sous-traitance, admin=frais administratifs, other=autres/repas'
        },
        amount: { type: 'number', description: 'Montant AVANT taxes en dollars (sous-total)' },
        tax: { type: 'number', description: 'Total des taxes (TPS+TVQ/GST) en dollars' },
        date: { type: 'string', description: 'Date de la facture au format AAAA-MM-JJ' },
        notes: { type: 'string', description: 'Description courte des articles achetés' },
        projectName: { type: 'string', description: 'Nom du chantier associé si mentionné (sinon omettre)' }
      },
      required: ['provider', 'category', 'amount'],
      additionalProperties: false
    }
  },
  {
    name: 'create_order',
    description: 'Crée un bon de commande fournisseur.',
    parameters: {
      type: 'object',
      properties: {
        supplierName: { type: 'string', description: 'Nom du fournisseur' },
        items: {
          type: 'array',
          description: 'Articles commandés',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              quantity: { type: 'number' },
              price: { type: 'number' }
            },
            required: ['name', 'quantity', 'price'],
            additionalProperties: false
          }
        }
      },
      required: ['supplierName', 'items'],
      additionalProperties: false
    }
  }
];

export interface AiAction { name: string; args: Record<string, any> }

// Validation stricte des arguments d'une action contre son schéma JSON :
// champs requis présents, types corrects, énumérations respectées, champs
// inconnus retirés. Retourne null si l'action est invalide.
function validateAiAction(name: string, rawArgs: any): AiAction | null {
  const def = AI_TOOL_DEFS.find(d => d.name === name);
  if (!def || typeof rawArgs !== 'object' || rawArgs === null || Array.isArray(rawArgs)) return null;

  const checkValue = (schema: any, value: any): boolean => {
    if (schema.type === 'string') {
      return typeof value === 'string' && value.length <= 500 && (!schema.enum || schema.enum.includes(value));
    }
    if (schema.type === 'number') return typeof value === 'number' && Number.isFinite(value);
    if (schema.type === 'array') {
      if (!Array.isArray(value) || value.length > 50) return false;
      return value.every(v => checkObject(schema.items, v));
    }
    if (schema.type === 'object') return checkObject(schema, value);
    return false;
  };
  const checkObject = (schema: any, value: any): boolean => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    for (const req of schema.required || []) {
      if (value[req] === undefined) return false;
    }
    for (const key of Object.keys(value)) {
      const propSchema = schema.properties?.[key];
      if (!propSchema) { delete value[key]; continue; } // champ inconnu : retiré
      if (!checkValue(propSchema, value[key])) return false;
    }
    return true;
  };

  const args = JSON.parse(JSON.stringify(rawArgs));
  if (!checkObject(def.parameters, args)) return null;
  return { name, args };
}

// Pièce jointe au message (photo de chantier ou document PDF) encodée en base64
export interface ChatImage {
  mimeType: string;
  data: string; // base64 sans préfixe data:
  name?: string; // nom de fichier (utile pour les PDF)
}

const isPdf = (a: ChatImage) => a.mimeType === 'application/pdf';

interface ProviderResult { text: string; actions: AiAction[] }

async function callGemini(message: string, apiKey: string, systemInstruction: string, image?: ChatImage, withTools?: boolean, extraImages?: ChatImage[]): Promise<ProviderResult> {
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
  });
  const parts: any[] = [];
  if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  // Une carte de compétence se lit sur ses deux faces : le numéro au recto, les
  // dates et mentions au verso. Le modèle doit les voir ensemble pour dire si
  // elles se contredisent.
  for (const extra of extraImages || []) parts.push({ inlineData: { mimeType: extra.mimeType, data: extra.data } });
  parts.push({ text: `Système: ${systemInstruction}\n\nClient message: ${message}` });
  // Gemini n'accepte pas additionalProperties dans les schémas de fonction
  const geminiTools = withTools ? [{
    functionDeclarations: AI_TOOL_DEFS.map(d => ({
      name: d.name,
      description: d.description,
      parameters: JSON.parse(JSON.stringify(d.parameters, (k, v) => (k === 'additionalProperties' ? undefined : v)))
    }))
  }] : undefined;
  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: [{ role: 'user', parts }],
    ...(geminiTools ? { config: { tools: geminiTools } } : {})
  });
  const actions: AiAction[] = [];
  const calls: any[] = (response as any).functionCalls || [];
  for (const call of calls) {
    const validated = validateAiAction(String(call.name || ''), call.args || {});
    if (validated) actions.push(validated);
  }
  return { text: response.text || '', actions };
}

async function parseJsonSafely(res: Response, providerLabel: string): Promise<any> {
  const raw = await res.text();
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Réponse invalide de l'API ${providerLabel} (HTTP ${res.status}). Vérifiez votre connexion ou réessayez plus tard.`);
  }
}

async function callAnthropic(message: string, apiKey: string, systemInstruction: string, image?: ChatImage, withTools?: boolean, extraImages?: ChatImage[]): Promise<ProviderResult> {
  const content: any = image
    ? [
        isPdf(image)
          ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: image.data } }
          : { type: 'image', source: { type: 'base64', media_type: image.mimeType, data: image.data } },
        ...(extraImages || []).map(extra => ({
          type: 'image', source: { type: 'base64', media_type: extra.mimeType, data: extra.data }
        })),
        { type: 'text', text: message }
      ]
    : message;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      system: systemInstruction,
      messages: [{ role: 'user', content }],
      ...(withTools ? {
        tools: AI_TOOL_DEFS.map(d => ({ name: d.name, description: d.description, input_schema: d.parameters }))
      } : {})
    })
  });
  const data = await parseJsonSafely(res, 'Anthropic');
  if (!res.ok) {
    throw new Error(data?.error?.message || `Anthropic API error (${res.status})`);
  }
  const blocks: any[] = Array.isArray(data?.content) ? data.content : [];
  const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  const actions: AiAction[] = [];
  for (const b of blocks.filter(b => b.type === 'tool_use')) {
    const validated = validateAiAction(String(b.name || ''), b.input || {});
    if (validated) actions.push(validated);
  }
  return { text, actions };
}

async function callOpenAI(message: string, apiKey: string, systemInstruction: string, image?: ChatImage, withTools?: boolean, extraImages?: ChatImage[]): Promise<ProviderResult> {
  const userContent: any = image
    ? [
        { type: 'text', text: message },
        isPdf(image)
          ? { type: 'file', file: { filename: image.name || 'document.pdf', file_data: `data:application/pdf;base64,${image.data}` } }
          : { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.data}` } },
        ...(extraImages || []).map(extra => ({
          type: 'image_url', image_url: { url: `data:${extra.mimeType};base64,${extra.data}` }
        }))
      ]
    : message;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userContent }
      ],
      ...(withTools ? {
        tools: AI_TOOL_DEFS.map(d => ({ type: 'function', function: { name: d.name, description: d.description, parameters: d.parameters } }))
      } : {})
    })
  });
  const data = await parseJsonSafely(res, 'OpenAI');
  if (!res.ok) {
    throw new Error(data?.error?.message || `OpenAI API error (${res.status})`);
  }
  const msg = data?.choices?.[0]?.message;
  const actions: AiAction[] = [];
  for (const call of msg?.tool_calls || []) {
    try {
      const args = JSON.parse(call?.function?.arguments || '{}');
      const validated = validateAiAction(String(call?.function?.name || ''), args);
      if (validated) actions.push(validated);
    } catch { /* arguments illisibles : action ignorée */ }
  }
  return { text: msg?.content || '', actions };
}

const PROVIDER_ENV_KEYS: Record<string, string> = {
  gemini: 'GEMINI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY'
};

const PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Google Gemini',
  anthropic: 'Anthropic Claude',
  openai: 'OpenAI'
};

// Variables reconnues pour chaque fournisseur. La première est le nom officiel
// affiché dans l'interface ; les alias Gemini permettent de conserver les noms
// de variables déjà utilisés dans certains anciens déploiements.
const PROVIDER_ENV_ALIASES: Record<string, string[]> = {
  gemini: ['GEMINI_API_KEY', 'GOOGLE_GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY']
};

function resolveProviderApiKey(provider: string): string | undefined {
  for (const envName of PROVIDER_ENV_ALIASES[provider] || []) {
    const value = process.env[envName];
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

function requireKnownTable(table: string, res: express.Response): boolean {
  if (!KNOWN_TABLES.includes(table)) {
    res.status(404).json({ error: `Table inconnue : ${table}` });
    return false;
  }
  return true;
}


// ---------------------------------------------------------------------------
// Colonnes héritées restées obligatoires (table punches)
// ---------------------------------------------------------------------------
// La table « punches » porte deux colonnes pour la même personne : « user_id »,
// du schéma d'origine et déclarée NOT NULL, et « employee_id », ajoutée
// ensuite et devenue celle que toute l'application lit et filtre. Le client
// n'écrit que la seconde : chaque pointage était donc refusé par Postgres avec
// « null value in column "user_id" violates not-null constraint », et
// l'employé voyait « Sauvegarde nuage échouée — vérifiez la connexion » alors
// que le réseau n'y était pour rien.
//
// On remplit ici l'une à partir de l'autre, dans les deux sens, pour qu'elles
// ne puissent jamais diverger, quelle que soit la version du client qui écrit.
function alignLegacyUserColumns(table: string, payload: Record<string, any>): void {
  if (table !== 'punches') return;
  const employee = payload.employee_id ?? payload.user_id ?? null;
  if (employee === null) return;
  payload.employee_id = employee;
  payload.user_id = employee;
}

// Monte toutes les routes /api/* sur une instance Express donnée. Suppose que
// express.json() a déjà été appliqué en middleware par l'appelant.
export function registerApiRoutes(app: express.Express): void {

  // -------------------------------------------------------------------------
  // Authentification : le NIP est vérifié CÔTÉ SERVEUR contre la base de
  // données ; le navigateur ne reçoit jamais les NIP des autres utilisateurs.
  // -------------------------------------------------------------------------
  app.post('/api/auth/login', async (req, res) => {
    const { employeeId: loginHandle, nip } = req.body || {};
    if (typeof loginHandle !== 'string' || typeof nip !== 'string' || !/^\d{4}$/.test(nip)) {
      return res.status(400).json({ error: 'Requête invalide' });
    }

    if (!supabaseEnabled) {
      return res.status(503).json({ error: 'Authentification indisponible (base de données non configurée)', code: 'AUTH_UNAVAILABLE' });
    }
    const clientIp = req.ip || req.socket.remoteAddress || 'noip';
    const throttleKey = `${clientIp}|${loginHandle}`;
    const ipThrottleKey = `${clientIp}|*`;
    if (await isLoginThrottled(throttleKey) || await isLoginThrottled(ipThrottleKey)) {
      logAudit(null, 'login_throttled', 'auth');
      return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.', code: 'THROTTLED' });
    }
    try {
      const result = await verifyCredentials(loginHandle, nip);
      if (!result.ok || !result.ctx) {
        if (result.reason === 'unavailable') {
          return res.status(503).json({ error: 'Authentification indisponible', code: 'AUTH_UNAVAILABLE' });
        }
        await Promise.all([recordLoginFailure(throttleKey), recordLoginFailure(ipThrottleKey)]);
        logAudit(null, 'login_failed', 'auth');
        return res.status(401).json({ error: 'NIP incorrect', code: 'INVALID_CREDENTIALS' });
      }
      await clearLoginFailures(throttleKey);
      const ctx = result.ctx;

      // L'état des consentements part avec la réponse de connexion. Sans cela,
      // le client ouvrait une session sans savoir si l'avis avait déjà été
      // accepté, et réaffichait l'écran de confidentialité à chaque connexion
      // en attendant l'hydratation. Une lecture par connexion, rien de plus.
      const { data: consent } = await supabase!
        .from('app_users')
        .select('privacy_notice_version, privacy_notice_acknowledged_at, location_notice_acknowledged_at')
        .eq('id', ctx.userId)
        .eq('company_id', ctx.companyId)
        .maybeSingle();

      const { token, expiresAt } = signSession(ctx);
      const nativeClient = ['android', 'ios'].includes(String(req.get('x-hailite-client') || '').toLowerCase());
      if (!nativeClient) {
        res.cookie(SESSION_COOKIE_NAME, token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/',
          maxAge: Math.max(0, expiresAt - Date.now())
        });
      }
      logAudit(ctx, 'login', 'auth', ctx.userId);
      return res.json({
        expiresAt,
        user: {
          id: ctx.userId,
          name: ctx.name,
          role: ctx.role,
          privacyNoticeVersion: (consent as any)?.privacy_notice_version || '',
          privacyNoticeAcknowledgedAt: (consent as any)?.privacy_notice_acknowledged_at || '',
          locationNoticeAcknowledgedAt: (consent as any)?.location_notice_acknowledged_at || ''
        },
        // L'app native ne peut pas utiliser le cookie SameSite du domaine web.
        // Son jeton de quatre heures reste uniquement en mémoire JavaScript et
        // disparaît à la fermeture ou à la déconnexion de l'application.
        ...(nativeClient ? { sessionToken: token } : {})
      });
    } catch (error: any) {
      console.error('Error on /api/auth/login:', error);
      return res.status(500).json({ error: 'Erreur du serveur d’authentification' });
    }
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });
    return res.status(204).end();
  });

  app.get('/api/auth/session', requireAuth, (req: AuthedRequest, res) => {
    const auth = req.auth as AuthContext;
    return res.json({ user: { id: auth.userId, name: auth.name, role: auth.role } });
  });

  // Un employé doit pouvoir confirmer l'avis qui lui est présenté sans pour
  // autant recevoir le droit général de modifier app_users (rôle, salaire,
  // NIP, coordonnées, etc.). L'identité, le tenant, la version et les heures
  // proviennent exclusivement de la session et du serveur.
  app.post('/api/auth/privacy-notice', requireAuth, async (req: AuthedRequest, res) => {
    if (!supabaseEnabled || !supabase) {
      return res.status(503).json({ error: 'Base de données non configurée' });
    }
    const auth = req.auth as AuthContext;
    const acknowledgedAt = new Date().toISOString();
    try {
      const { data, error } = await supabase
        .from('app_users')
        .update({
          privacy_notice_version: USER_PRIVACY_NOTICE_VERSION,
          privacy_notice_acknowledged_at: acknowledgedAt,
          location_notice_acknowledged_at: acknowledgedAt
        })
        .eq('id', auth.userId)
        .eq('company_id', auth.companyId)
        .eq('is_active', true)
        .select('privacy_notice_version, privacy_notice_acknowledged_at, location_notice_acknowledged_at')
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Compte actif introuvable' });

      logAudit(auth, 'privacy_notice_acknowledged', 'app_users', auth.userId, {
        version: USER_PRIVACY_NOTICE_VERSION
      });
      return res.json({
        privacyNoticeVersion: data.privacy_notice_version,
        privacyNoticeAcknowledgedAt: data.privacy_notice_acknowledged_at,
        locationNoticeAcknowledgedAt: data.location_notice_acknowledged_at
      });
    } catch (error: any) {
      console.error('Error on /api/auth/privacy-notice:', error);
      return res.status(500).json({ error: 'Les confirmations n’ont pas pu être enregistrées' });
    }
  });

  // -------------------------------------------------------------------------
  // Cartes de compétence soumises par le travailleur lui-même
  // -------------------------------------------------------------------------
  // La table app_users reste interdite en écriture à tout le monde sauf
  // l'administration. On n'ouvre donc pas la table : on ouvre un geste précis.
  // Cette route n'écrit que la colonne « credentials », uniquement sur la ligne
  // de la personne authentifiée, et impose le statut « soumise » — le corps de
  // la requête ne peut pas prétendre le contraire. Les cartes déjà présentes
  // sont relues côté serveur puis réécrites avec la nouvelle en fin de liste :
  // un client ne peut ni en effacer, ni en modifier une autre.
  app.post('/api/credentials', requireAuth, async (req: AuthedRequest, res) => {
    if (!supabaseEnabled || !supabase) {
      return res.status(503).json({ error: 'Base de données non configurée' });
    }
    const auth = req.auth as AuthContext;
    const input = (req.body || {}) as Record<string, any>;

    const problems = validateSubmission(input as SubmissionInput);
    if (problems.length > 0) {
      return res.status(400).json({
        error: 'Soumission incomplète',
        problems: problems.map(problem => ({ field: problem.field, messageFR: problem.messageFR, messageEN: problem.messageEN }))
      });
    }

    try {
      const { data: current, error: readError } = await supabase
        .from('app_users')
        .select('credentials')
        .eq('id', auth.userId)
        .eq('company_id', auth.companyId)
        .eq('is_active', true)
        .maybeSingle();
      if (readError) throw readError;
      if (!current) return res.status(404).json({ error: 'Compte actif introuvable' });

      const existing = Array.isArray(current.credentials) ? current.credentials : [];
      if (existing.length >= MAX_CREDENTIALS_PER_USER) {
        return res.status(409).json({ error: 'Trop de cartes enregistrées pour ce compte' });
      }

      const submitted = buildSubmittedCredential(input as SubmissionInput, auth.userId, crypto.randomUUID());
      const credentials = [...existing, submitted];

      const { error: writeError } = await supabase
        .from('app_users')
        .update({ credentials })
        .eq('id', auth.userId)
        .eq('company_id', auth.companyId)
        .eq('is_active', true);
      if (writeError) throw writeError;

      // La photo n'entre pas dans le journal : on note qu'une carte a été
      // soumise, pas ce qu'elle montre.
      logAudit(auth, 'credential_submitted', 'app_users', auth.userId, {
        credentialId: submitted.id, type: submitted.type
      });
      return res.json({ success: true, credential: submitted });
    } catch (error: any) {
      console.error('Error on /api/credentials:', error);
      return res.status(500).json({ error: 'La carte n’a pas pu être enregistrée' });
    }
  });

  // Examen d'une carte soumise. Réservé au bureau : c'est la décision qui
  // engage l'employeur devant l'organisme émetteur et devant la loi.
  app.post('/api/credentials/:employeeId/:credentialId/review', requireAuth, async (req: AuthedRequest, res) => {
    if (!supabaseEnabled || !supabase) {
      return res.status(503).json({ error: 'Base de données non configurée' });
    }
    const auth = req.auth as AuthContext;
    if (!canReviewCredential(auth)) {
      logAudit(auth, 'credential_review_denied', 'app_users', String(req.params.employeeId));
      return res.status(403).json({ error: 'Vérification réservée à la gestion' });
    }

    const { employeeId, credentialId } = req.params;
    const approved = req.body?.approved === true;
    const method = String(req.body?.method || '');
    const note = String(req.body?.note || '').slice(0, 500);

    try {
      const { data: target, error: readError } = await supabase
        .from('app_users')
        .select('credentials')
        .eq('id', employeeId)
        .eq('company_id', auth.companyId)
        .maybeSingle();
      if (readError) throw readError;
      if (!target) return res.status(404).json({ error: 'Employé introuvable' });

      const existing = Array.isArray(target.credentials) ? target.credentials : [];
      const found = existing.find((item: any) => item?.id === credentialId);
      if (!found) return res.status(404).json({ error: 'Carte introuvable' });

      const decided = applyReview(found, {
        approved,
        reviewerId: auth.userId,
        method: ALLOWED_VERIFICATION_METHODS.has(method) ? (method as any) : undefined,
        note
      });
      const credentials = existing.map((item: any) => item?.id === credentialId ? decided : item);

      const { error: writeError } = await supabase
        .from('app_users')
        .update({ credentials })
        .eq('id', employeeId)
        .eq('company_id', auth.companyId);
      if (writeError) throw writeError;

      logAudit(auth, approved ? 'credential_verified' : 'credential_rejected', 'app_users', String(employeeId), {
        credentialId, method: decided.verificationMethod
      });
      return res.json({ success: true, credential: decided });
    } catch (error: any) {
      console.error('Error on /api/credentials/review:', error);
      return res.status(500).json({ error: 'La décision n’a pas pu être enregistrée' });
    }
  });

  // -------------------------------------------------------------------------
  // Lecture assistée d'une carte soumise
  // -------------------------------------------------------------------------
  // Le modèle lit les deux faces et rapporte ce qui y est imprimé ; le serveur
  // recoupe ensuite cette lecture avec ce que le travailleur a saisi. Un numéro
  // qui ne concorde pas, une date d'expiration rallongée, un verso illisible :
  // voilà ce que ça révèle, et c'est déjà beaucoup pour repérer une carte
  // bricolée.
  //
  // Ce que la route ne prétend jamais : dire qu'une carte est authentique. Une
  // contrefaçon soignée est cohérente avec elle-même. Le verdict est donc borné
  // à « concorde », « à regarder de plus près » ou « illisible », et la
  // vérification au registre reste la réponse à « est-ce une fausse carte ».
  //
  // Réservée à la gestion : les photos d'une carte ne partent chez le
  // fournisseur d'IA que sur le geste délibéré d'une personne du bureau.
  app.post('/api/credentials/:employeeId/:credentialId/inspect', requireAuth, async (req: AuthedRequest, res) => {
    if (!supabaseEnabled || !supabase) {
      return res.status(503).json({ error: 'Base de données non configurée' });
    }
    const auth = req.auth as AuthContext;
    if (!canReviewCredential(auth)) {
      logAudit(auth, 'credential_inspect_denied', 'app_users', String(req.params.employeeId));
      return res.status(403).json({ error: 'Analyse réservée à la gestion' });
    }

    const selectedProvider: string = req.body?.provider && PROVIDER_ENV_KEYS[req.body.provider] ? req.body.provider : 'gemini';
    const apiKey = resolveProviderApiKey(selectedProvider);
    if (!apiKey) {
      return res.status(503).json({ error: 'Aucun fournisseur d’IA configuré sur le serveur' });
    }

    const { employeeId, credentialId } = req.params;
    try {
      const { data: target, error: readError } = await supabase
        .from('app_users')
        .select('credentials')
        .eq('id', employeeId)
        .eq('company_id', auth.companyId)
        .maybeSingle();
      if (readError) throw readError;
      if (!target) return res.status(404).json({ error: 'Employé introuvable' });

      const existing = Array.isArray(target.credentials) ? target.credentials : [];
      const credential = existing.find((item: any) => item?.id === credentialId);
      if (!credential) return res.status(404).json({ error: 'Carte introuvable' });

      // Les photos viennent de la base, jamais du corps de la requête : on
      // analyse la carte réellement soumise, pas une image fournie à côté.
      const front = decodeImageDataUrl(credential.photoFront);
      const back = decodeImageDataUrl(credential.photoBack);
      if (!front || !back) {
        return res.status(422).json({ error: 'Les deux photos de la carte sont nécessaires à l’analyse' });
      }

      const toChatImage = (decoded: { bytes: Buffer; mimeType: string }) => ({
        mimeType: decoded.mimeType,
        data: decoded.bytes.toString('base64')
      });

      const prompt = [
        'Première image : recto. Deuxième image : verso.',
        `Type de carte déclaré : ${String(credential.name || '')}.`
      ].join(' ');

      const call = selectedProvider === 'anthropic' ? callAnthropic
        : selectedProvider === 'openai' ? callOpenAI
        : callGemini;
      const result = await call(prompt, apiKey, CREDENTIAL_READING_INSTRUCTION, toChatImage(front), false, [toChatImage(back)]);

      const reading = parseCredentialReading(result.text);
      if (!reading) {
        return res.status(502).json({ error: 'Lecture illisible retournée par le modèle' });
      }
      const discrepancies = compareReadingToDeclared(credential, reading);
      const verdict = inspectionVerdict(reading, discrepancies);

      // On note qu'une analyse a eu lieu et ce qu'elle a conclu, jamais le
      // contenu lu sur la carte.
      logAudit(auth, 'credential_inspected', 'app_users', String(employeeId), {
        credentialId, provider: selectedProvider, verdict, discrepancies: discrepancies.length
      });
      return res.json({ reading, discrepancies, verdict, provider: selectedProvider });
    } catch (error: any) {
      console.error('Error on /api/credentials/inspect:', error);
      return res.status(500).json({ error: 'L’analyse n’a pas pu être effectuée' });
    }
  });

  // Annuaire minimal pour l'écran de connexion (avant authentification) :
  // uniquement id, nom et avatar — jamais de rôle, NIP, NAS ou salaire.
  app.get('/api/auth/directory', async (_req, res) => {
    if (!supabaseEnabled || !supabase) return res.json({ enabled: false, users: [] });
    try {
      const companyId = await resolveCompanyId();
      const { data, error } = await supabase
        .from('app_users')
        .select('id, full_name, avatar, is_active')
        .eq('company_id', companyId)
        .limit(250);
      if (error) throw error;
      return res.json({
        enabled: true,
        users: (data || [])
          .filter((u: any) => u.is_active !== false)
          .map((u: any) => ({
            id: createLoginHandle(companyId, String(u.id)),
            name: u.full_name || '',
            avatar: u.avatar || ''
          }))
      });
    } catch (error: any) {
      console.error('Error on /api/auth/directory:', error);
      return res.status(500).json({ error: 'Erreur de chargement de l’annuaire' });
    }
  });

  // État des fournisseurs, sans jamais retourner la valeur d'une clé.
  app.get('/api/ai/status', attachAuthOptional, (req: AuthedRequest, res) => {
    if (protectedRuntime && !req.auth) {
      return res.status(401).json({ error: 'authentification requise', code: 'AUTH_REQUIRED' });
    }
    return res.json({
      providers: Object.fromEntries(
        Object.keys(PROVIDER_ENV_KEYS).map(provider => [provider, {
          configured: Boolean(resolveProviderApiKey(provider)),
          envNames: PROVIDER_ENV_ALIASES[provider],
          label: PROVIDER_LABELS[provider]
        }])
      )
    });
  });

  // -------------------------------------------------------------------------
  // Assistant IA. La clé API vit EXCLUSIVEMENT dans les variables
  // d'environnement du serveur (Vercel) : toute clé envoyée par le navigateur
  // est ignorée. Les actions passent par du function calling à schéma strict.
  // -------------------------------------------------------------------------
  app.post('/api/chat', attachAuthOptional, async (req: AuthedRequest, res) => {
    try {
      const { message, provider, regionLabel, image, appContext, language, allowActions } = req.body;

      // Dès que le cloud est configuré, l'accès au modèle exige une session valide.
      if (protectedRuntime && !req.auth) {
        return res.status(401).json({ error: 'authentification requise', code: 'AUTH_REQUIRED' });
      }

      const selectedProvider: string = provider && PROVIDER_ENV_KEYS[provider] ? provider : 'gemini';
      // Clé serveur uniquement : req.body.apiKey (ancienne version) est ignoré.
      const apiKey = resolveProviderApiKey(selectedProvider);

      // Les outils (actions) ne sont proposés au modèle que pour un rôle de
      // bureau vérifié par jeton — jamais sur la seule foi du client.
      const withTools = allowActions === true && !!req.auth && isManager(req.auth.role);

      // appContext : données en direct fournies par le client pour les rôles
      // privilégiés — voir buildAiAppContext dans App.tsx (déjà exempt de NIP,
      // NAS, clés et coordonnées bancaires).
      const systemInstruction = buildSystemInstruction(regionLabel, language)
        + (typeof appContext === 'string' && appContext.trim() ? `\n\n${appContext.slice(0, 40000)}` : '');
      const chatImage: ChatImage | undefined =
        image && typeof image.data === 'string' && typeof image.mimeType === 'string'
          ? { mimeType: image.mimeType, data: image.data, name: typeof image.name === 'string' ? image.name : undefined }
          : undefined;

      if (!apiKey || apiKey.trim() === '') {
        return res.json({
          reply: language === 'EN'
            ? `🤖 The AI assistant is running in local simulation mode because no API key is configured for ${PROVIDER_LABELS[selectedProvider]}. Ask your administrator to set the server key (${PROVIDER_ENV_KEYS[selectedProvider]}) in the host environment variables.`
            : `🤖 L'assistant IA fonctionne en mode simulation locale car aucune clé API n'est configurée pour ${PROVIDER_LABELS[selectedProvider]}. Demandez à votre administrateur de définir la clé serveur (${PROVIDER_ENV_KEYS[selectedProvider]}) dans les variables d'environnement de l'hébergeur.`,
          simulated: true
        });
      }

      let result: ProviderResult;
      if (selectedProvider === 'anthropic') {
        result = await callAnthropic(message, apiKey, systemInstruction, chatImage, withTools);
      } else if (selectedProvider === 'openai') {
        result = await callOpenAI(message, apiKey, systemInstruction, chatImage, withTools);
      } else {
        result = await callGemini(message, apiKey, systemInstruction, chatImage, withTools);
      }

      // Garde-fou : maximum 5 actions par tour, toutes validées contre leur schéma.
      const actions = result.actions.slice(0, 5);
      if (actions.length > 0) {
        logAudit(req.auth || null, 'ai_actions_proposed', 'ai', null, { actions: actions.map(a => a.name) });
      }

      return res.json({
        reply: result.text,
        actions,
        provider: selectedProvider,
        keySource: 'server'
      });
    } catch (error: any) {
      console.error('Error on /api/chat:', error);
      return res.status(500).json({ error: 'Le fournisseur IA n’a pas pu traiter la demande' });
    }
  });

  // -------------------------------------------------------------------------
  // Couche de données branchée sur Supabase (voir db.ts). Chaque route exige
  // une session valide, applique la matrice de permissions et le scoping par
  // company_id, redige les colonnes sensibles et journalise les écritures.
  // -------------------------------------------------------------------------

  // Hydratation complète au démarrage : uniquement les tables lisibles par le
  // rôle du demandeur, avec filtres de propriété et redaction.
  app.get('/api/hydrate', attachAuthOptional, async (req: AuthedRequest, res) => {
    // Mode purement local (Supabase absent) : pas de cloud, donc pas de session à exiger
    if (!supabaseEnabled || !supabase) {
      return res.json({ enabled: false });
    }
    if (!req.auth) {
      return res.status(401).json({ error: 'authentification requise', code: 'AUTH_REQUIRED' });
    }
    const auth = req.auth as AuthContext;
    try {
      const companyId = auth.companyId;
      const projectIds = await employeeProjectIds(auth);
      const results: Record<string, any> = {
        enabled: true,
        companyId,
        viewer: { userId: auth.userId, role: auth.role, name: auth.name }
      };
      for (const table of KNOWN_TABLES) {
        if (!canRead(table, auth.role)) {
          // Table non lisible par ce rôle : forme conservée, contenu vide
          results[table] = [];
          continue;
        }
        const columns = table === 'project_photos'
          ? 'id,company_id,project_id,phase,caption,taken_at,taken_by,taken_by_name,latitude,longitude'
          : '*';
        let query: any = supabase.from(table).select(columns);
        if (TABLES_WITH_COMPANY_ID.has(table)) {
          query = query.eq('company_id', companyId);
        } else if (table === 'companies') {
          query = query.eq('id', companyId);
        }
        query = applyReadScope(query, table, auth, projectIds);
        query = query.limit(table === 'project_photos' ? 250 : 1000);
        const { data, error } = await query;
        if (error) throw error;
        results[table] = sanitizeRows(table, data || [], auth.role);
      }
      return res.json(results);
    } catch (error: any) {
      console.error('Error on /api/hydrate:', error);
      return res.status(500).json({ error: 'Erreur de chargement des données' });
    }
  });

  // Liste (permissions + scoping company_id + redaction)
  app.get('/api/db/:table', requireAuth, async (req: AuthedRequest, res) => {
    if (!supabaseEnabled || !supabase) return res.status(503).json({ error: 'Base de données non configurée' });
    const { table } = req.params;
    if (!requireKnownTable(table, res)) return;
    const auth = req.auth as AuthContext;
    if (!canRead(table, auth.role)) return res.status(403).json({ error: 'Lecture non autorisée pour ce rôle' });
    try {
      const projectIds = await employeeProjectIds(auth);
      const requestedLimit = Number.parseInt(String(req.query.limit || '250'), 10);
      const requestedOffset = Number.parseInt(String(req.query.offset || '0'), 10);
      const limit = Number.isFinite(requestedLimit) ? Math.min(500, Math.max(1, requestedLimit)) : 250;
      const offset = Number.isFinite(requestedOffset) ? Math.max(0, requestedOffset) : 0;
      const columns = table === 'project_photos'
        ? 'id,company_id,project_id,phase,caption,taken_at,taken_by,taken_by_name,latitude,longitude'
        : '*';
      let query: any = supabase.from(table).select(columns);
      if (TABLES_WITH_COMPANY_ID.has(table)) {
        query = query.eq('company_id', auth.companyId);
      } else if (table === 'companies') {
        query = query.eq('id', auth.companyId);
      }
      query = applyReadScope(query, table, auth, projectIds).range(offset, offset + limit - 1);
      const { data, error } = await query;
      if (error) throw error;
      return res.json(sanitizeRows(table, data || [], auth.role));
    } catch (error: any) {
      console.error(`Error on GET /api/db/${table}:`, error);
      return res.status(500).json({ error: 'Erreur de lecture des données' });
    }
  });

  // Les images demeurent dans un bucket privé. Cette route vérifie à nouveau
  // la compagnie et l'accès au chantier avant de transmettre les octets.
  app.get('/api/files/project-photo/:id', requireAuth, async (req: AuthedRequest, res) => {
    if (!supabaseEnabled || !supabase) return res.status(503).json({ error: 'Stockage indisponible' });
    const auth = req.auth as AuthContext;
    try {
      const { data: photo, error } = await supabase
        .from('project_photos')
        .select('id,project_id,image_url')
        .eq('id', req.params.id)
        .eq('company_id', auth.companyId)
        .maybeSingle();
      if (error) throw error;
      if (!photo || !(await hasProjectAccess(auth, photo.project_id))) {
        return res.status(404).json({ error: 'Photo introuvable' });
      }
      const legacy = decodeImageDataUrl(photo.image_url);
      if (legacy) {
        res.setHeader('Content-Type', legacy.mimeType);
        res.setHeader('Cache-Control', 'private, max-age=300');
        return res.end(legacy.bytes);
      }
      const { data: file, error: downloadError } = await supabase.storage
        .from(PROJECT_MEDIA_BUCKET)
        .download(String(photo.image_url || ''));
      if (downloadError || !file) return res.status(404).json({ error: 'Fichier introuvable' });
      const bytes = Buffer.from(await file.arrayBuffer());
      res.setHeader('Content-Type', file.type || 'image/jpeg');
      res.setHeader('Content-Length', String(bytes.length));
      res.setHeader('Cache-Control', 'private, max-age=300');
      return res.end(bytes);
    } catch (error: any) {
      console.error('Error on project photo download:', error);
      return res.status(500).json({ error: 'Erreur de téléchargement de la photo' });
    }
  });

  // Remplacement transactionnel des tâches, outils et assignations d'un
  // chantier. La fonction Postgres réalise tout ou rien : une coupure réseau ne
  // peut plus laisser le chantier vidé entre DELETE et INSERT.
  app.put('/api/projects/:id/children', requireAuth, async (req: AuthedRequest, res) => {
    if (!supabaseEnabled || !supabase) return res.status(503).json({ error: 'Base de données non configurée' });
    const auth = req.auth as AuthContext;
    const projectId = String(req.params.id || '');
    if (!(await hasProjectAccess(auth, projectId))) return res.status(404).json({ error: 'Chantier introuvable' });
    const tasks = Array.isArray(req.body?.tasks) ? req.body.tasks : [];
    const tools = Array.isArray(req.body?.tools) ? req.body.tools : [];
    const assignments = Array.isArray(req.body?.assignments) ? req.body.assignments : [];
    if (tasks.length > 500 || tools.length > 500 || assignments.length > 250) {
      return res.status(413).json({ error: 'Trop d’éléments à synchroniser' });
    }
    if (tasks.some((item: any) => typeof item?.title !== 'string' || item.title.length > 500) ||
        tools.some((item: any) => typeof item?.name !== 'string' || item.name.length > 250)) {
      return res.status(400).json({ error: 'Contenu de chantier invalide' });
    }
    try {
      const { error } = await supabase.rpc('replace_project_children', {
        p_company_id: auth.companyId,
        p_project_id: projectId,
        p_tasks: tasks,
        p_tools: tools,
        p_assignments: assignments,
        p_replace_assignments: isManager(auth.role)
      });
      if (error) throw error;
      logAudit(auth, 'replace_children', 'projects', projectId, {
        taskCount: tasks.length,
        toolCount: tools.length,
        assignmentCount: isManager(auth.role) ? assignments.length : undefined
      });
      return res.json({ success: true });
    } catch (error: any) {
      console.error('Error on transactional project sync:', error);
      return res.status(500).json({ error: 'La synchronisation du chantier a échoué' });
    }
  });

  // Vérifie qu'un rôle non gestionnaire n'écrit que ses propres lignes
  function enforceOwnRow(table: string, auth: AuthContext, payload: Record<string, any>): boolean {
    if (!WRITE_OWN_ONLY.has(table) || isManager(auth.role)) return true;
    const ownerCol = OWNER_COLUMN[table];
    if (!ownerCol) return true;
    return String(payload[ownerCol] || '') === auth.userId;
  }

  // hr_alerts : tous les rôles peuvent signaler (INSERT — alertes de géorepérage),
  // mais seule la gestion peut résoudre/modifier/supprimer.
  function allowHrAlertMethod(auth: AuthContext, method: string): boolean {
    return method === 'POST' || isManager(auth.role);
  }

  // expenses : un employé/sous-traitant peut SOUMETTRE une dépense (photo de reçu)
  // mais seule l'équipe de bureau peut la modifier ou la supprimer.
  function allowExpenseMethod(auth: AuthContext, method: string): boolean {
    return method === 'POST' || OFFICE.includes(auth.role);
  }

  // project_photos : n'importe quel rôle peut photographier le chantier, mais
  // seule la gestion peut corriger ou supprimer une photo — le dossier photo
  // sert de preuve, il ne doit pas pouvoir être vidé depuis le terrain.
  function allowProjectPhotoMethod(auth: AuthContext, method: string): boolean {
    return method === 'POST' || isManager(auth.role);
  }

  // change_orders : le terrain constate et fait signer l'extra (INSERT), mais
  // approuver, corriger le montant ou supprimer relève de la gestion.
  function allowChangeOrderMethod(auth: AuthContext, method: string): boolean {
    return method === 'POST' || isManager(auth.role);
  }

  // safety_records : le contremaître crée la fiche et fait signer l'équipe sur
  // place (POST et PATCH pour la collecte des signatures) ; seule la gestion
  // peut supprimer — un registre de sécurité ne s'efface pas depuis le chantier.
  function allowSafetyMethod(auth: AuthContext, method: string): boolean {
    return method === 'POST' || method === 'PATCH' || isManager(auth.role);
  }

  // insurance_claims : dossier financier et contractuel. Le terrain le consulte
  // (il doit savoir ce qui est couvert), mais seule la gestion l'écrit.
  function allowInsuranceClaimMethod(auth: AuthContext, method: string): boolean {
    return isManager(auth.role);
  }

  // Création d'une ligne
  app.post('/api/db/:table', requireAuth, async (req: AuthedRequest, res) => {
    if (!supabaseEnabled || !supabase) return res.status(503).json({ error: 'Base de données non configurée' });
    const { table } = req.params;
    if (!requireKnownTable(table, res)) return;
    const auth = req.auth as AuthContext;
    if (table === 'companies') return res.status(403).json({ error: 'Création de compagnie non autorisée par cette route' });
    if (!canWrite(table, auth.role)) return res.status(403).json({ error: 'Écriture non autorisée pour ce rôle' });
    if (table === 'hr_alerts' && !allowHrAlertMethod(auth, 'POST')) return res.status(403).json({ error: 'Non autorisé' });
    let uploadedProjectPhotoPath: string | null = null;
    try {
      const payload = { ...req.body };
      if (TABLES_WITH_COMPANY_ID.has(table)) {
        // company_id imposé par le jeton : le client ne choisit jamais son tenant
        payload.company_id = auth.companyId;
      }
      alignLegacyUserColumns(table, payload);
      if (table === 'app_users') {
        await prepareAppUserPin(payload, true);
      }
      if (!(await parentBelongsToCompany(table, payload, auth.companyId))) {
        return res.status(400).json({ error: 'Enregistrement parent inconnu pour cette compagnie' });
      }
      if (!(await userReferenceBelongsToCompany(table, payload, auth.companyId))) {
        return res.status(400).json({ error: 'Employé inconnu pour cette compagnie' });
      }
      if (payload.project_id && !(await hasProjectAccess(auth, payload.project_id))) {
        return res.status(404).json({ error: 'Chantier inconnu ou non assigné' });
      }
      if (table === 'punches') {
        const verdict = await enforcePunchGeofence(payload, auth);
        if (!verdict.ok) {
          logAudit(auth, 'punch.geofence_refused', 'punches', null, {
            project_id: payload.project_id ?? null,
            distance_m: verdict.distanceMeters ?? null,
            radius_m: verdict.radiusMeters ?? null
          });
          return res.status(403).json({ error: verdict.error });
        }
      }
      if (table === 'safety_records') {
        payload.created_by = auth.userId;
        payload.created_by_name = auth.name;
        if (!String(payload.topic || '').trim()) {
          return res.status(400).json({ error: 'Sujet de la fiche de sécurité manquant' });
        }
        if (!['toolbox', 'hazard'].includes(String(payload.type))) {
          return res.status(400).json({ error: 'Type de fiche de sécurité invalide' });
        }
        if (!Array.isArray(payload.attendees) || payload.attendees.length === 0) {
          return res.status(400).json({ error: 'Aucun travailleur présent déclaré' });
        }
        if (payload.hazards !== null && payload.hazards !== undefined && !Array.isArray(payload.hazards)) {
          return res.status(400).json({ error: 'Liste de dangers invalide' });
        }
        const { data: proj } = await supabase
          .from('projects').select('id, company_id').eq('id', payload.project_id).maybeSingle();
        if (!proj || (proj.company_id && String(proj.company_id) !== auth.companyId)) {
          return res.status(400).json({ error: 'Chantier inconnu pour cette compagnie' });
        }
      }
      if (table === 'shift_assignments') {
        payload.created_by = auth.userId;
        payload.created_by_name = auth.name;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(payload.date || ''))) {
          return res.status(400).json({ error: 'Date d’affectation invalide' });
        }
        const { data: proj } = await supabase
          .from('projects').select('id, company_id').eq('id', payload.project_id).maybeSingle();
        if (!proj || (proj.company_id && String(proj.company_id) !== auth.companyId)) {
          return res.status(400).json({ error: 'Chantier inconnu pour cette compagnie' });
        }
        const { data: emp } = await supabase
          .from('app_users').select('id, company_id').eq('id', payload.employee_id).maybeSingle();
        if (!emp || (emp.company_id && String(emp.company_id) !== auth.companyId)) {
          return res.status(400).json({ error: 'Employé inconnu pour cette compagnie' });
        }
      }
      if (table === 'leads') {
        payload.created_by = auth.userId;
        payload.created_by_name = auth.name;
        if (!String(payload.name || '').trim()) {
          return res.status(400).json({ error: 'Nom du prospect manquant' });
        }
        if (!['new', 'contacted', 'inspection', 'quoted', 'won', 'lost'].includes(String(payload.status))) {
          return res.status(400).json({ error: 'Étape de prospect invalide' });
        }
        if (!['referral', 'phone', 'website', 'door', 'repeat', 'insurance', 'other'].includes(String(payload.source))) {
          return res.status(400).json({ error: 'Provenance de prospect invalide' });
        }
        const raw = payload.estimated_value;
        if (raw === null || raw === undefined || raw === '') {
          payload.estimated_value = null;
        } else {
          const value = Number(raw);
          if (!Number.isFinite(value) || value < 0 || value > 10_000_000) {
            return res.status(400).json({ error: 'Valeur estimée invalide' });
          }
          payload.estimated_value = value;
        }
      }
      if (table === 'insurance_claims') {
        payload.created_by = auth.userId;
        payload.created_by_name = auth.name;
        if (!String(payload.insurer || '').trim()) {
          return res.status(400).json({ error: 'Assureur manquant' });
        }
        if (!['hail', 'wind', 'water', 'fire', 'other'].includes(String(payload.loss_type))) {
          return res.status(400).json({ error: 'Type de sinistre invalide' });
        }
        if (!['open', 'submitted', 'approved', 'partial', 'denied', 'closed'].includes(String(payload.status))) {
          return res.status(400).json({ error: 'Statut de réclamation invalide' });
        }
        for (const field of ['deductible', 'acv', 'rcv', 'supplement_amount', 'approved_amount']) {
          const raw = payload[field];
          if (raw === null || raw === undefined || raw === '') { payload[field] = null; continue; }
          const value = Number(raw);
          if (!Number.isFinite(value) || value < 0 || value > 10_000_000) {
            return res.status(400).json({ error: `Montant invalide : ${field}` });
          }
          payload[field] = value;
        }
        const { data: proj } = await supabase
          .from('projects').select('id, company_id').eq('id', payload.project_id).maybeSingle();
        if (!proj || (proj.company_id && String(proj.company_id) !== auth.companyId)) {
          return res.status(400).json({ error: 'Chantier inconnu pour cette compagnie' });
        }
      }
      if (table === 'change_orders') {
        // L'auteur vient du jeton, jamais du client
        payload.created_by = auth.userId;
        payload.created_by_name = auth.name;
        if (!String(payload.description || '').trim()) {
          return res.status(400).json({ error: 'Description d’extra manquante' });
        }
        const amount = Number(payload.amount);
        if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
          return res.status(400).json({ error: 'Montant d’extra invalide' });
        }
        payload.amount = amount;
        // Le terrain ne peut pas déclarer un extra déjà facturé : signé sur
        // place = approuvé, sinon en attente du bureau.
        if (!isManager(auth.role)) {
          payload.status = payload.client_signature ? 'approved' : 'pending';
        } else if (!['pending', 'approved', 'refused', 'invoiced'].includes(String(payload.status))) {
          return res.status(400).json({ error: 'Statut d’extra invalide' });
        }
        const { data: proj } = await supabase
          .from('projects').select('id, company_id').eq('id', payload.project_id).maybeSingle();
        if (!proj || (proj.company_id && String(proj.company_id) !== auth.companyId)) {
          return res.status(400).json({ error: 'Chantier inconnu pour cette compagnie' });
        }
      }
      if (table === 'project_photos') {
        // L'auteur de la photo vient du jeton, jamais du client
        payload.taken_by = auth.userId;
        payload.taken_by_name = auth.name;
        if (!['before', 'during', 'after'].includes(String(payload.phase))) {
          return res.status(400).json({ error: 'Phase de photo invalide' });
        }
        const photoId = String(payload.id || crypto.randomUUID());
        payload.id = photoId;
        try {
          payload.image_url = await uploadProjectPhoto(auth, String(payload.project_id), photoId, payload.image_url);
          uploadedProjectPhotoPath = String(payload.image_url);
        } catch (error: any) {
          if (error?.message === 'PHOTO_INVALID') return res.status(413).json({ error: 'Photo invalide ou trop volumineuse (maximum 5 Mo)' });
          throw error;
        }
      }
      if (table === 'expenses' && !OFFICE.includes(auth.role)) {
        // L'identité du soumissionnaire vient du jeton, jamais du client
        payload.submitted_by = auth.userId;
        payload.submitted_by_name = auth.name;
        // Validation stricte des dépenses soumises du terrain : montant positif,
        // taxe non négative, catégorie connue, chantier appartenant à la compagnie
        const amount = Number(payload.amount);
        if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
          return res.status(400).json({ error: 'Montant de dépense invalide' });
        }
        payload.amount = amount;
        const tax = payload.tax == null || payload.tax === '' ? 0 : Number(payload.tax);
        if (!Number.isFinite(tax) || tax < 0 || tax > amount) {
          return res.status(400).json({ error: 'Taxe de dépense invalide' });
        }
        payload.tax = tax;
        const EXPENSE_CATEGORIES = ['materials', 'tools', 'fuel', 'rental', 'subcontractor', 'admin', 'other'];
        if (!EXPENSE_CATEGORIES.includes(String(payload.category))) {
          return res.status(400).json({ error: 'Catégorie de dépense invalide' });
        }
        if (payload.project_id) {
          const { data: proj } = await supabase
            .from('projects')
            .select('id, company_id')
            .eq('id', payload.project_id)
            .maybeSingle();
          if (!proj || (proj.company_id && String(proj.company_id) !== auth.companyId)) {
            return res.status(400).json({ error: 'Chantier inconnu pour cette compagnie' });
          }
        }
      }
      if (!enforceOwnRow(table, auth, payload)) {
        return res.status(403).json({ error: 'Écriture limitée à vos propres enregistrements' });
      }
      const { data, error } = await supabase.from(table).insert(payload).select().single();
      if (error) throw error;
      logAudit(auth, 'insert', table, data?.id ?? null, { fields: Object.keys(payload) });
      return res.json(sanitizeRow(table, data, auth.role));
    } catch (error: any) {
      console.error(`Error on POST /api/db/${table}:`, error);
      if (uploadedProjectPhotoPath && supabase) {
        const { error: cleanupError } = await supabase.storage
          .from(PROJECT_MEDIA_BUCKET)
          .remove([uploadedProjectPhotoPath]);
        if (cleanupError) console.error('[storage] nettoyage de photo orpheline impossible :', cleanupError.message);
      }
      if (error?.message === 'PIN_REQUIRED') return res.status(400).json({ error: 'Un NIP à quatre chiffres est requis' });
      if (error?.message === 'PIN_INVALID') return res.status(400).json({ error: 'Le NIP doit contenir exactement quatre chiffres' });
      return res.status(500).json({ error: 'La sauvegarde a échoué' });
    }
  });

  // Upsert (tables à clé naturelle, ex: weekly_goals)
  app.put('/api/db/:table', requireAuth, async (req: AuthedRequest, res) => {
    if (!supabaseEnabled || !supabase) return res.status(503).json({ error: 'Base de données non configurée' });
    const { table } = req.params;
    if (!requireKnownTable(table, res)) return;
    const auth = req.auth as AuthContext;
    if (table === 'companies') return res.status(403).json({ error: 'Opération non autorisée par cette route' });
    if (!canWrite(table, auth.role)) return res.status(403).json({ error: 'Écriture non autorisée pour ce rôle' });
    if (table === 'hr_alerts' && !allowHrAlertMethod(auth, 'PUT')) return res.status(403).json({ error: 'Non autorisé' });
    if (table === 'expenses' && !allowExpenseMethod(auth, 'PUT')) return res.status(403).json({ error: 'Non autorisé' });
    if (table === 'project_photos' && !allowProjectPhotoMethod(auth, 'PUT')) return res.status(403).json({ error: 'Non autorisé' });
    if (table === 'change_orders' && !allowChangeOrderMethod(auth, 'PUT')) return res.status(403).json({ error: 'Non autorisé' });
    if (table === 'safety_records' && !allowSafetyMethod(auth, 'PUT')) return res.status(403).json({ error: 'Non autorisé' });
    if (table === 'insurance_claims' && !allowInsuranceClaimMethod(auth, 'PUT')) return res.status(403).json({ error: 'Non autorisé' });
    try {
      const payload = { ...req.body };
      if (TABLES_WITH_COMPANY_ID.has(table)) {
        payload.company_id = auth.companyId;
      }
      alignLegacyUserColumns(table, payload);
      if (!enforceOwnRow(table, auth, payload)) {
        return res.status(403).json({ error: 'Écriture limitée à vos propres enregistrements' });
      }
      if (!(await parentBelongsToCompany(table, payload, auth.companyId))) {
        return res.status(400).json({ error: 'Enregistrement parent inconnu pour cette compagnie' });
      }
      if (!(await userReferenceBelongsToCompany(table, payload, auth.companyId))) {
        return res.status(400).json({ error: 'Employé inconnu pour cette compagnie' });
      }
      if (payload.project_id && !(await hasProjectAccess(auth, payload.project_id))) {
        return res.status(404).json({ error: 'Chantier inconnu ou non assigné' });
      }
      const idColumn = TABLE_ID_COLUMN[table] || 'id';
      const idValue = payload[idColumn];
      if (!idValue) return res.status(400).json({ error: 'Identifiant manquant' });
      let existingQuery: any = supabase.from(table).select(idColumn).eq(idColumn, idValue);
      existingQuery = applyTenantWriteScope(existingQuery, table, auth);
      const { data: existing, error: existingError } = await existingQuery.maybeSingle();
      if (existingError) throw existingError;
      let data: any;
      if (table === 'app_users') await prepareAppUserPin(payload, !existing);
      if (existing) {
        delete payload.company_id;
        let updateQuery: any = supabase.from(table).update(payload).eq(idColumn, idValue);
        updateQuery = applyTenantWriteScope(updateQuery, table, auth);
        const result = await updateQuery.select().single();
        if (result.error) throw result.error;
        data = result.data;
      } else {
        const result = await supabase.from(table).insert(payload).select().single();
        if (result.error) throw result.error;
        data = result.data;
      }
      logAudit(auth, 'upsert', table, data?.id ?? null, { fields: Object.keys(payload) });
      return res.json(sanitizeRow(table, data, auth.role));
    } catch (error: any) {
      console.error(`Error on PUT /api/db/${table}:`, error);
      if (error?.message === 'PIN_REQUIRED') return res.status(400).json({ error: 'Un NIP à quatre chiffres est requis' });
      if (error?.message === 'PIN_INVALID') return res.status(400).json({ error: 'Le NIP doit contenir exactement quatre chiffres' });
      return res.status(500).json({ error: 'La sauvegarde a échoué' });
    }
  });

  // Mise à jour partielle par identifiant (avec vérification de propriété)
  app.patch('/api/db/:table/:id', requireAuth, async (req: AuthedRequest, res) => {
    if (!supabaseEnabled || !supabase) return res.status(503).json({ error: 'Base de données non configurée' });
    const { table, id } = req.params;
    if (!requireKnownTable(table, res)) return;
    const auth = req.auth as AuthContext;
    if (!canWrite(table, auth.role)) return res.status(403).json({ error: 'Écriture non autorisée pour ce rôle' });
    if (table === 'hr_alerts' && !allowHrAlertMethod(auth, 'PATCH')) return res.status(403).json({ error: 'Non autorisé' });
    if (table === 'expenses' && !allowExpenseMethod(auth, 'PATCH')) return res.status(403).json({ error: 'Non autorisé' });
    if (table === 'project_photos' && !allowProjectPhotoMethod(auth, 'PATCH')) return res.status(403).json({ error: 'Non autorisé' });
    if (table === 'change_orders' && !allowChangeOrderMethod(auth, 'PATCH')) return res.status(403).json({ error: 'Non autorisé' });
    if (table === 'safety_records' && !allowSafetyMethod(auth, 'PATCH')) return res.status(403).json({ error: 'Non autorisé' });
    if (table === 'insurance_claims' && !allowInsuranceClaimMethod(auth, 'PATCH')) return res.status(403).json({ error: 'Non autorisé' });
    let uploadedProjectPhotoPath: string | null = null;
    try {
      const idColumn = TABLE_ID_COLUMN[table] || 'id';
      const existingColumns = Array.from(new Set([
        idColumn,
        ...(OWNER_COLUMN[table] ? [OWNER_COLUMN[table]] : []),
        ...(EMPLOYEE_PROJECT_TABLES.has(table) ? ['project_id'] : []),
        ...(PARENT_SCOPE[table] ? [PARENT_SCOPE[table].foreignKey] : []),
        ...(USER_REFERENCE_COLUMN[table] ? [USER_REFERENCE_COLUMN[table]] : []),
        ...(table === 'project_photos' ? ['image_url'] : [])
      ])).join(',');
      let existingQuery: any = supabase.from(table).select(existingColumns).eq(idColumn, id);
      existingQuery = applyTenantWriteScope(existingQuery, table, auth);
      const { data: existing, error: readErr } = await existingQuery.maybeSingle();
      if (readErr) throw readErr;
      if (!existing) return res.status(404).json({ error: 'Enregistrement introuvable' });
      if (WRITE_OWN_ONLY.has(table) && !isManager(auth.role)) {
        const ownerCol = OWNER_COLUMN[table];
        if (String((existing as any)[ownerCol] || '') !== auth.userId) {
          return res.status(403).json({ error: 'Écriture limitée à vos propres enregistrements' });
        }
      }
      if ((existing as any).project_id && !(await hasProjectAccess(auth, (existing as any).project_id))) {
        return res.status(404).json({ error: 'Chantier introuvable ou non assigné' });
      }
      const payload = { ...req.body };
      // Empêche toute réaffectation de tenant ou de clé primaire via PATCH.
      delete payload.company_id;
      delete payload[idColumn];
      // Si la modification touche la personne rattachée, les deux colonnes
      // héritées doivent bouger ensemble (voir alignLegacyUserColumns).
      alignLegacyUserColumns(table, payload);
      if (table === 'app_users') await prepareAppUserPin(payload, false);
      if (!(await parentBelongsToCompany(table, { ...existing, ...payload }, auth.companyId))) {
        return res.status(400).json({ error: 'Enregistrement parent inconnu pour cette compagnie' });
      }
      if (!(await userReferenceBelongsToCompany(table, { ...existing, ...payload }, auth.companyId))) {
        return res.status(400).json({ error: 'Employé inconnu pour cette compagnie' });
      }
      if (payload.project_id && !(await hasProjectAccess(auth, payload.project_id))) {
        return res.status(404).json({ error: 'Chantier inconnu ou non assigné' });
      }
      if (table === 'project_photos' && payload.image_url) {
        payload.image_url = await uploadProjectPhoto(
          auth,
          String(payload.project_id || (existing as any).project_id),
          id,
          payload.image_url
        );
        uploadedProjectPhotoPath = String(payload.image_url);
      }
      let updateQuery: any = supabase.from(table).update(payload).eq(idColumn, id);
      updateQuery = applyTenantWriteScope(updateQuery, table, auth);
      const { data, error } = await updateQuery.select().maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Enregistrement introuvable' });
      if (table === 'project_photos' && payload.image_url) {
        const previousPath = String((existing as any).image_url || '');
        const nextPath = String((data as any).image_url || '');
        if (previousPath && previousPath !== nextPath && !previousPath.startsWith('data:')) {
          const { error: storageError } = await supabase.storage
            .from(PROJECT_MEDIA_BUCKET)
            .remove([previousPath]);
          if (storageError) console.error('[storage] ancienne photo non supprimée :', storageError.message);
        }
      }
      logAudit(auth, 'update', table, id, { fields: Object.keys(payload) });
      return res.json(sanitizeRow(table, data, auth.role));
    } catch (error: any) {
      console.error(`Error on PATCH /api/db/${table}/${id}:`, error);
      if (uploadedProjectPhotoPath && supabase) {
        const { error: cleanupError } = await supabase.storage
          .from(PROJECT_MEDIA_BUCKET)
          .remove([uploadedProjectPhotoPath]);
        if (cleanupError) console.error('[storage] nettoyage de photo orpheline impossible :', cleanupError.message);
      }
      if (error?.message === 'PIN_INVALID') return res.status(400).json({ error: 'Le NIP doit contenir exactement quatre chiffres' });
      if (error?.message === 'PHOTO_INVALID') return res.status(413).json({ error: 'Photo invalide ou trop volumineuse (maximum 5 Mo)' });
      return res.status(500).json({ error: 'La mise à jour a échoué' });
    }
  });

  // Suppression par identifiant (avec vérification de propriété)
  app.delete('/api/db/:table/:id', requireAuth, async (req: AuthedRequest, res) => {
    if (!supabaseEnabled || !supabase) return res.status(503).json({ error: 'Base de données non configurée' });
    const { table, id } = req.params;
    if (!requireKnownTable(table, res)) return;
    const auth = req.auth as AuthContext;
    if (table === 'companies') return res.status(403).json({ error: 'Suppression de compagnie non autorisée' });
    if (!canWrite(table, auth.role)) return res.status(403).json({ error: 'Écriture non autorisée pour ce rôle' });
    if (table === 'hr_alerts' && !allowHrAlertMethod(auth, 'DELETE')) return res.status(403).json({ error: 'Non autorisé' });
    if (table === 'expenses' && !allowExpenseMethod(auth, 'DELETE')) return res.status(403).json({ error: 'Non autorisé' });
    if (table === 'project_photos' && !allowProjectPhotoMethod(auth, 'DELETE')) return res.status(403).json({ error: 'Non autorisé' });
    if (table === 'change_orders' && !allowChangeOrderMethod(auth, 'DELETE')) return res.status(403).json({ error: 'Non autorisé' });
    if (table === 'safety_records' && !allowSafetyMethod(auth, 'DELETE')) return res.status(403).json({ error: 'Non autorisé' });
    if (table === 'insurance_claims' && !allowInsuranceClaimMethod(auth, 'DELETE')) return res.status(403).json({ error: 'Non autorisé' });
    try {
      const idColumn = TABLE_ID_COLUMN[table] || 'id';
      const existingColumns = Array.from(new Set([
        idColumn,
        ...(OWNER_COLUMN[table] ? [OWNER_COLUMN[table]] : []),
        ...(EMPLOYEE_PROJECT_TABLES.has(table) ? ['project_id'] : []),
        ...(table === 'project_photos' ? ['image_url'] : [])
      ])).join(',');
      let existingQuery: any = supabase.from(table).select(existingColumns).eq(idColumn, id);
      existingQuery = applyTenantWriteScope(existingQuery, table, auth);
      const { data: existing, error: readErr } = await existingQuery.maybeSingle();
      if (readErr) throw readErr;
      if (!existing) {
        // Supprimer ce qui n'est déjà plus là n'est pas un échec : l'état voulu
        // est atteint. Le 404 renvoyé auparavant s'affichait à l'écran comme
        // « Sauvegarde nuage échouée — vérifiez la connexion » alors que le
        // réseau allait très bien, typiquement pour un objectif hebdomadaire
        // jamais monté dans le nuage. Au passage, ne plus distinguer l'absence
        // supprime aussi un moyen de deviner l'existence d'une ligne
        // appartenant à une autre compagnie.
        logAudit(auth, 'delete_noop', table, id);
        return res.json({ success: true, alreadyAbsent: true });
      }
      if (WRITE_OWN_ONLY.has(table) && !isManager(auth.role)) {
        const ownerCol = OWNER_COLUMN[table];
        if (String((existing as any)[ownerCol] || '') !== auth.userId) {
          return res.status(403).json({ error: 'Suppression limitée à vos propres enregistrements' });
        }
      }
      if ((existing as any).project_id && !(await hasProjectAccess(auth, (existing as any).project_id))) {
        return res.status(404).json({ error: 'Chantier introuvable ou non assigné' });
      }
      let deleteQuery: any = supabase.from(table).delete().eq(idColumn, id);
      deleteQuery = applyTenantWriteScope(deleteQuery, table, auth);
      const { error } = await deleteQuery;
      if (error) throw error;
      const storagePath = table === 'project_photos' ? String((existing as any).image_url || '') : '';
      if (storagePath && !storagePath.startsWith('data:')) {
        const { error: storageError } = await supabase.storage.from(PROJECT_MEDIA_BUCKET).remove([storagePath]);
        if (storageError) console.error('[storage] photo supprimée de la base mais pas du bucket :', storageError.message);
      }
      logAudit(auth, 'delete', table, id);
      return res.json({ success: true });
    } catch (error: any) {
      console.error(`Error on DELETE /api/db/${table}/${id}:`, error);
      return res.status(500).json({ error: 'La suppression a échoué' });
    }
  });
}
