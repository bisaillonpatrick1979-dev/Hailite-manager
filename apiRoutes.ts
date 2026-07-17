// Routes API partagées entre le serveur Node traditionnel (server.ts, utilisé en
// développement et sur un hébergement Node persistant) et la fonction serverless
// Vercel (api/index.ts). Isolé dans son propre module pour être monté sur
// n'importe quelle instance Express sans dupliquer la logique.
//
// SÉCURITÉ : la clé SUPABASE_SERVICE_ROLE_KEY reste côté serveur ; chaque route
// de données exige un jeton de session (voir auth.ts) et applique une matrice
// de permissions par table + rôle, un scoping strict par company_id, la
// redaction des colonnes sensibles (NIP, NAS/SIN, banque, clés API) et un
// journal d'audit sur toutes les écritures.
import express from 'express';
import { GoogleGenAI } from '@google/genai';
// Extension .js obligatoire (ESM sur Vercel) — voir le commentaire dans api/index.ts.
import { supabase, supabaseEnabled, resolveCompanyId, TABLES_WITH_COMPANY_ID, TABLE_ID_COLUMN } from './db.js';
import {
  AppRole, AuthContext, AuthedRequest,
  requireAuth, attachAuthOptional, verifyCredentials, signSession,
  isLoginThrottled, recordLoginFailure, clearLoginFailures, logAudit
} from './auth.js';

// Toutes les tables exposées par la couche de données générique (voir supabase_migration.sql)
const KNOWN_TABLES = [
  'companies', 'app_users', 'projects', 'project_tools', 'project_assignments', 'project_tasks',
  'punches', 'catalog_items', 'suppliers', 'inventory_items', 'supplier_orders', 'supplier_order_items',
  'clients', 'documents', 'document_items', 'document_payments', 'payroll_entries', 'payroll_payments',
  'production_entries', 'weekly_goals', 'motivation_teams', 'motivation_goals', 'hr_alerts', 'expenses'
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
  supplier_orders: ALL_ROLES, supplier_order_items: ALL_ROLES,
  clients: OFFICE, documents: OFFICE, document_items: OFFICE, document_payments: OFFICE,
  payroll_entries: ALL_ROLES, payroll_payments: ALL_ROLES, production_entries: ALL_ROLES,
  weekly_goals: ALL_ROLES, motivation_teams: ALL_ROLES, motivation_goals: ALL_ROLES,
  hr_alerts: MANAGERS, expenses: OFFICE
};

const TABLE_WRITE_ROLES: Record<string, AppRole[]> = {
  companies: ADMIN_ONLY, app_users: ADMIN_ONLY,
  projects: MANAGERS, project_tasks: ALL_ROLES, project_tools: ALL_ROLES, project_assignments: MANAGERS,
  punches: ALL_ROLES, catalog_items: MANAGERS, suppliers: MANAGERS, inventory_items: MANAGERS,
  supplier_orders: MANAGERS, supplier_order_items: MANAGERS,
  clients: MANAGERS, documents: MANAGERS, document_items: MANAGERS, document_payments: MANAGERS,
  payroll_entries: ALL_ROLES, payroll_payments: ADMIN_ONLY, production_entries: MANAGERS,
  weekly_goals: ALL_ROLES, motivation_teams: ADMIN_ONLY, motivation_goals: ADMIN_ONLY,
  hr_alerts: ALL_ROLES, expenses: OFFICE
};

// Colonne "propriétaire" pour les contraintes de ligne des rôles non gestionnaires
const OWNER_COLUMN: Record<string, string> = {
  punches: 'employee_id',
  payroll_entries: 'user_id',
  payroll_payments: 'employee_id',
  weekly_goals: 'employee_id'
};
// Lecture restreinte à ses propres lignes pour les rôles hors bureau
const READ_OWN_ONLY = new Set(['payroll_entries', 'payroll_payments']);
// Écriture restreinte à ses propres lignes pour les rôles non gestionnaires
const WRITE_OWN_ONLY = new Set(['punches', 'payroll_entries', 'weekly_goals']);

// ---------------------------------------------------------------------------
// Redaction des colonnes sensibles — le navigateur (et donc le modèle IA qui
// reçoit son contexte) ne voit jamais : clés API, NIP, NAS/SIN, coordonnées
// bancaires. Le NIP reste visible à l'admin (il le gère dans Réglages).
// ---------------------------------------------------------------------------
const SENSITIVE_ALWAYS: Record<string, string[]> = {
  companies: ['ai_api_key']
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
  return out;
}
function sanitizeRows(table: string, rows: any[], role: AppRole): any[] {
  return (rows || []).map(r => sanitizeRow(table, r, role));
}

const isManager = (role: AppRole) => role === 'admin' || role === 'secretary';
const canRead = (table: string, role: AppRole) => (TABLE_READ_ROLES[table] || ADMIN_ONLY).includes(role);
const canWrite = (table: string, role: AppRole) => (TABLE_WRITE_ROLES[table] || ADMIN_ONLY).includes(role);

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

async function callGemini(message: string, apiKey: string, systemInstruction: string, image?: ChatImage, withTools?: boolean): Promise<ProviderResult> {
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
  });
  const parts: any[] = [];
  if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
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

async function callAnthropic(message: string, apiKey: string, systemInstruction: string, image?: ChatImage, withTools?: boolean): Promise<ProviderResult> {
  const content: any = image
    ? [
        isPdf(image)
          ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: image.data } }
          : { type: 'image', source: { type: 'base64', media_type: image.mimeType, data: image.data } },
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

async function callOpenAI(message: string, apiKey: string, systemInstruction: string, image?: ChatImage, withTools?: boolean): Promise<ProviderResult> {
  const userContent: any = image
    ? [
        { type: 'text', text: message },
        isPdf(image)
          ? { type: 'file', file: { filename: image.name || 'document.pdf', file_data: `data:application/pdf;base64,${image.data}` } }
          : { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.data}` } }
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

function requireKnownTable(table: string, res: express.Response): boolean {
  if (!KNOWN_TABLES.includes(table)) {
    res.status(404).json({ error: `Table inconnue : ${table}` });
    return false;
  }
  return true;
}

// Monte toutes les routes /api/* sur une instance Express donnée. Suppose que
// express.json() a déjà été appliqué en middleware par l'appelant.
export function registerApiRoutes(app: express.Express): void {

  // -------------------------------------------------------------------------
  // Authentification : le NIP est vérifié CÔTÉ SERVEUR contre la base de
  // données ; le navigateur ne reçoit jamais les NIP des autres utilisateurs.
  // -------------------------------------------------------------------------
  app.post('/api/auth/login', async (req, res) => {
    if (!supabaseEnabled) {
      return res.status(503).json({ error: 'Authentification indisponible (base de données non configurée)', code: 'AUTH_UNAVAILABLE' });
    }
    const { employeeId, nip } = req.body || {};
    if (typeof employeeId !== 'string' || typeof nip !== 'string' || !/^\d{4}$/.test(nip)) {
      return res.status(400).json({ error: 'Requête invalide' });
    }
    const throttleKey = `${req.ip || 'noip'}|${employeeId}`;
    if (isLoginThrottled(throttleKey)) {
      logAudit(null, 'login_throttled', 'auth', employeeId);
      return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.', code: 'THROTTLED' });
    }
    try {
      const result = await verifyCredentials(employeeId, nip);
      if (!result.ok || !result.ctx) {
        if (result.reason === 'unavailable') {
          return res.status(503).json({ error: 'Authentification indisponible', code: 'AUTH_UNAVAILABLE' });
        }
        recordLoginFailure(throttleKey);
        logAudit(null, 'login_failed', 'auth', employeeId);
        return res.status(401).json({ error: 'NIP incorrect', code: 'INVALID_CREDENTIALS' });
      }
      clearLoginFailures(throttleKey);
      const ctx = result.ctx;
      const { token, expiresAt } = signSession(ctx);
      logAudit(ctx, 'login', 'auth', ctx.userId);
      return res.json({
        token,
        expiresAt,
        user: { id: ctx.userId, name: ctx.name, role: ctx.role }
      });
    } catch (error: any) {
      console.error('Error on /api/auth/login:', error);
      return res.status(500).json({ error: 'Erreur du serveur d’authentification' });
    }
  });

  // Annuaire minimal pour l'écran de connexion (avant authentification) :
  // uniquement id, nom, rôle, métier et avatar — jamais de NIP, NAS ou salaire.
  app.get('/api/auth/directory', async (_req, res) => {
    if (!supabaseEnabled || !supabase) return res.json({ enabled: false, users: [] });
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('id, full_name, role, worker_type, avatar, is_active');
      if (error) throw error;
      return res.json({
        enabled: true,
        users: (data || [])
          .filter((u: any) => u.is_active !== false)
          .map((u: any) => ({ id: u.id, name: u.full_name || '', role: u.role || 'employee', workerType: u.worker_type || '', avatar: u.avatar || '' }))
      });
    } catch (error: any) {
      console.error('Error on /api/auth/directory:', error);
      return res.status(500).json({ error: 'Erreur de chargement de l’annuaire' });
    }
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
      if (supabaseEnabled && !req.auth) {
        return res.status(401).json({ error: 'authentification requise', code: 'AUTH_REQUIRED' });
      }

      const selectedProvider: string = provider && PROVIDER_ENV_KEYS[provider] ? provider : 'gemini';
      // Clé serveur uniquement : req.body.apiKey (ancienne version) est ignoré.
      const apiKey = process.env[PROVIDER_ENV_KEYS[selectedProvider]];

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
      return res.status(500).json({ error: error.message || 'Error occurred while calling the AI provider' });
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
      const companyId = await resolveCompanyId();
      const results: Record<string, any> = { enabled: true, companyId, viewer: { userId: auth.userId, role: auth.role } };
      for (const table of KNOWN_TABLES) {
        if (!canRead(table, auth.role)) {
          // Table non lisible par ce rôle : forme conservée, contenu vide
          results[table] = [];
          continue;
        }
        let query = supabase.from(table).select('*');
        if (TABLES_WITH_COMPANY_ID.has(table)) {
          query = query.eq('company_id', companyId);
        }
        if (READ_OWN_ONLY.has(table) && !OFFICE.includes(auth.role)) {
          query = query.eq(OWNER_COLUMN[table], auth.userId);
        }
        const { data, error } = await query;
        if (error) throw error;
        results[table] = sanitizeRows(table, data || [], auth.role);
      }
      return res.json(results);
    } catch (error: any) {
      console.error('Error on /api/hydrate:', error);
      return res.status(500).json({ error: error.message || 'Erreur de chargement des données' });
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
      let query = supabase.from(table).select('*');
      if (TABLES_WITH_COMPANY_ID.has(table)) {
        query = query.eq('company_id', auth.companyId);
      }
      if (READ_OWN_ONLY.has(table) && !OFFICE.includes(auth.role)) {
        query = query.eq(OWNER_COLUMN[table], auth.userId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return res.json(sanitizeRows(table, data || [], auth.role));
    } catch (error: any) {
      console.error(`Error on GET /api/db/${table}:`, error);
      return res.status(500).json({ error: error.message });
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

  // Création d'une ligne
  app.post('/api/db/:table', requireAuth, async (req: AuthedRequest, res) => {
    if (!supabaseEnabled || !supabase) return res.status(503).json({ error: 'Base de données non configurée' });
    const { table } = req.params;
    if (!requireKnownTable(table, res)) return;
    const auth = req.auth as AuthContext;
    if (!canWrite(table, auth.role)) return res.status(403).json({ error: 'Écriture non autorisée pour ce rôle' });
    if (table === 'hr_alerts' && !allowHrAlertMethod(auth, 'POST')) return res.status(403).json({ error: 'Non autorisé' });
    try {
      const payload = { ...req.body };
      if (TABLES_WITH_COMPANY_ID.has(table)) {
        // company_id imposé par le jeton : le client ne choisit jamais son tenant
        payload.company_id = auth.companyId;
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
      return res.status(500).json({ error: error.message });
    }
  });

  // Upsert (tables à clé naturelle, ex: weekly_goals)
  app.put('/api/db/:table', requireAuth, async (req: AuthedRequest, res) => {
    if (!supabaseEnabled || !supabase) return res.status(503).json({ error: 'Base de données non configurée' });
    const { table } = req.params;
    if (!requireKnownTable(table, res)) return;
    const auth = req.auth as AuthContext;
    if (!canWrite(table, auth.role)) return res.status(403).json({ error: 'Écriture non autorisée pour ce rôle' });
    if (table === 'hr_alerts' && !allowHrAlertMethod(auth, 'PUT')) return res.status(403).json({ error: 'Non autorisé' });
    try {
      const payload = { ...req.body };
      if (TABLES_WITH_COMPANY_ID.has(table)) {
        payload.company_id = auth.companyId;
      }
      if (!enforceOwnRow(table, auth, payload)) {
        return res.status(403).json({ error: 'Écriture limitée à vos propres enregistrements' });
      }
      const { data, error } = await supabase.from(table).upsert(payload).select().single();
      if (error) throw error;
      logAudit(auth, 'upsert', table, data?.id ?? null, { fields: Object.keys(payload) });
      return res.json(sanitizeRow(table, data, auth.role));
    } catch (error: any) {
      console.error(`Error on PUT /api/db/${table}:`, error);
      return res.status(500).json({ error: error.message });
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
    try {
      const idColumn = TABLE_ID_COLUMN[table] || 'id';
      // Rôles non gestionnaires : la ligne visée doit leur appartenir
      if (WRITE_OWN_ONLY.has(table) && !isManager(auth.role)) {
        const ownerCol = OWNER_COLUMN[table];
        const { data: existing, error: readErr } = await supabase.from(table).select(ownerCol).eq(idColumn, id).maybeSingle();
        if (readErr) throw readErr;
        if (!existing || String((existing as any)[ownerCol] || '') !== auth.userId) {
          return res.status(403).json({ error: 'Écriture limitée à vos propres enregistrements' });
        }
      }
      const payload = { ...req.body };
      if (TABLES_WITH_COMPANY_ID.has(table)) {
        // Empêche toute réaffectation de tenant via PATCH
        delete payload.company_id;
      }
      const { data, error } = await supabase.from(table).update(payload).eq(idColumn, id).select().single();
      if (error) throw error;
      logAudit(auth, 'update', table, id, { fields: Object.keys(payload) });
      return res.json(sanitizeRow(table, data, auth.role));
    } catch (error: any) {
      console.error(`Error on PATCH /api/db/${table}/${id}:`, error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Suppression par identifiant (avec vérification de propriété)
  app.delete('/api/db/:table/:id', requireAuth, async (req: AuthedRequest, res) => {
    if (!supabaseEnabled || !supabase) return res.status(503).json({ error: 'Base de données non configurée' });
    const { table, id } = req.params;
    if (!requireKnownTable(table, res)) return;
    const auth = req.auth as AuthContext;
    if (!canWrite(table, auth.role)) return res.status(403).json({ error: 'Écriture non autorisée pour ce rôle' });
    if (table === 'hr_alerts' && !allowHrAlertMethod(auth, 'DELETE')) return res.status(403).json({ error: 'Non autorisé' });
    try {
      const idColumn = TABLE_ID_COLUMN[table] || 'id';
      if (WRITE_OWN_ONLY.has(table) && !isManager(auth.role)) {
        const ownerCol = OWNER_COLUMN[table];
        const { data: existing, error: readErr } = await supabase.from(table).select(ownerCol).eq(idColumn, id).maybeSingle();
        if (readErr) throw readErr;
        if (!existing || String((existing as any)[ownerCol] || '') !== auth.userId) {
          return res.status(403).json({ error: 'Suppression limitée à vos propres enregistrements' });
        }
      }
      const { error } = await supabase.from(table).delete().eq(idColumn, id);
      if (error) throw error;
      logAudit(auth, 'delete', table, id);
      return res.json({ success: true });
    } catch (error: any) {
      console.error(`Error on DELETE /api/db/${table}/${id}:`, error);
      return res.status(500).json({ error: error.message });
    }
  });
}
