// Routes API partagées entre le serveur Node traditionnel (server.ts, utilisé en
// développement et sur un hébergement Node persistant) et la fonction serverless
// Vercel (api/index.ts). Isolé dans son propre module pour être monté sur
// n'importe quelle instance Express sans dupliquer la logique.
import express from 'express';
import { GoogleGenAI } from '@google/genai';
// Extension .js obligatoire (ESM sur Vercel) — voir le commentaire dans api/index.ts.
import { supabase, supabaseEnabled, resolveCompanyId, TABLES_WITH_COMPANY_ID, TABLE_ID_COLUMN } from './db.js';

// Toutes les tables exposées par la couche de données générique (voir supabase_migration.sql)
const KNOWN_TABLES = [
  'companies', 'app_users', 'projects', 'project_tools', 'project_assignments', 'project_tasks',
  'punches', 'catalog_items', 'suppliers', 'inventory_items', 'supplier_orders', 'supplier_order_items',
  'clients', 'documents', 'document_items', 'document_payments', 'payroll_entries', 'payroll_payments',
  'production_entries', 'weekly_goals', 'motivation_teams', 'motivation_goals', 'hr_alerts', 'expenses'
];

function buildSystemInstruction(regionLabel?: string): string {
  const location = regionLabel && regionLabel.trim() ? regionLabel.trim() : 'Amérique du Nord';
  return `
    Tu es l'assistant d'IA intelligent d'une entreprise de pose de toiture et parement extérieur appelée "Hailite Xteriors", basée en ${location}.
    L'application de gestion de chantier s'appelle "Gestion Chantier Pro".
    Ton but est d'aider les administrateurs et les ouvriers sur les chantiers de construction.
    Base tes réponses de conformité, de sécurité et de charges sociales sur les règles applicables en ${location} — ne présume jamais que l'entreprise est au Québec à moins que ce soit précisé.
    Donne des conseils professionnels et clairs.
    Réponds de manière concise, polie et technique pour les calculs de toiture, la rentabilité de chantier, la sécurité ou la gestion de l'inventaire.
    Si une photo est jointe (chantier, toiture, revêtement, matériau, dommage, document), analyse-la en détail : état, matériaux visibles, problèmes potentiels, sécurité, estimation des travaux.
    Si un document PDF est joint (soumission, plan, devis, facture, contrat), lis-le et résume ou analyse son contenu selon la question posée.
  `;
}

// Pièce jointe au message (photo de chantier ou document PDF) encodée en base64
export interface ChatImage {
  mimeType: string;
  data: string; // base64 sans préfixe data:
  name?: string; // nom de fichier (utile pour les PDF)
}

const isPdf = (a: ChatImage) => a.mimeType === 'application/pdf';

async function callGemini(message: string, apiKey: string, systemInstruction: string, image?: ChatImage): Promise<string> {
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
  });
  const parts: any[] = [];
  if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  parts.push({ text: `Système: ${systemInstruction}\n\nClient message: ${message}` });
  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: [{ role: 'user', parts }],
  });
  return response.text || '';
}

async function parseJsonSafely(res: Response, providerLabel: string): Promise<any> {
  const raw = await res.text();
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Réponse invalide de l'API ${providerLabel} (HTTP ${res.status}). Vérifiez votre connexion ou réessayez plus tard.`);
  }
}

async function callAnthropic(message: string, apiKey: string, systemInstruction: string, image?: ChatImage): Promise<string> {
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
      messages: [{ role: 'user', content }]
    })
  });
  const data = await parseJsonSafely(res, 'Anthropic');
  if (!res.ok) {
    throw new Error(data?.error?.message || `Anthropic API error (${res.status})`);
  }
  return data?.content?.[0]?.text || '';
}

async function callOpenAI(message: string, apiKey: string, systemInstruction: string, image?: ChatImage): Promise<string> {
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
      ]
    })
  });
  const data = await parseJsonSafely(res, 'OpenAI');
  if (!res.ok) {
    throw new Error(data?.error?.message || `OpenAI API error (${res.status})`);
  }
  return data?.choices?.[0]?.message?.content || '';
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
  // API Route for AI Agent chat (Gemini / Anthropic / OpenAI)
  app.post('/api/chat', async (req, res) => {
    try {
      const { message, provider, apiKey: clientApiKey, regionLabel, image, appContext } = req.body;
      const selectedProvider: string = provider && PROVIDER_ENV_KEYS[provider] ? provider : 'gemini';
      const envKey = process.env[PROVIDER_ENV_KEYS[selectedProvider]];
      const apiKey = (clientApiKey && clientApiKey.trim()) || envKey;
      // appContext : données en direct + protocole d'actions, fournis par le client
      // pour les rôles privilégiés (admin/secrétaire) — voir buildAiAppContext dans App.tsx
      const systemInstruction = buildSystemInstruction(regionLabel)
        + (typeof appContext === 'string' && appContext.trim() ? `\n\n${appContext.slice(0, 40000)}` : '');
      const chatImage: ChatImage | undefined =
        image && typeof image.data === 'string' && typeof image.mimeType === 'string'
          ? { mimeType: image.mimeType, data: image.data, name: typeof image.name === 'string' ? image.name : undefined }
          : undefined;

      if (!apiKey || apiKey.trim() === '') {
        return res.json({
          reply: `🤖 L'assistant IA fonctionne en mode simulation locale car aucune clé API n'est configurée pour ${PROVIDER_LABELS[selectedProvider]}. Ajoutez votre clé API dans Réglages > Assistant IA pour l'activer.`,
          simulated: true
        });
      }

      let text = '';
      if (selectedProvider === 'anthropic') {
        text = await callAnthropic(message, apiKey, systemInstruction, chatImage);
      } else if (selectedProvider === 'openai') {
        text = await callOpenAI(message, apiKey, systemInstruction, chatImage);
      } else {
        text = await callGemini(message, apiKey, systemInstruction, chatImage);
      }

      return res.json({ reply: text });
    } catch (error: any) {
      console.error('Error on /api/chat:', error);
      return res.status(500).json({ error: error.message || 'Error occurred while calling the AI provider' });
    }
  });

  // -------------------------------------------------------------------------
  // Couche de données générique branchée sur Supabase (voir db.ts et
  // supabase_migration.sql). Chaque action du store applicatif passe par ces
  // routes REST au lieu d'écrire directement dans LocalStorage.
  // -------------------------------------------------------------------------

  // Hydratation complète au démarrage de l'application : toutes les tables en un seul appel
  app.get('/api/hydrate', async (_req, res) => {
    if (!supabaseEnabled || !supabase) {
      return res.json({ enabled: false });
    }
    try {
      const companyId = await resolveCompanyId();
      const results: Record<string, any> = { enabled: true, companyId };
      for (const table of KNOWN_TABLES) {
        const { data, error } = await supabase.from(table).select('*');
        if (error) throw error;
        results[table] = data;
      }
      return res.json(results);
    } catch (error: any) {
      console.error('Error on /api/hydrate:', error);
      return res.status(500).json({ error: error.message || 'Erreur de chargement des données' });
    }
  });

  // Liste (avec filtre optionnel par company_id pour les tables mono-tenant)
  app.get('/api/db/:table', async (req, res) => {
    if (!supabaseEnabled || !supabase) return res.status(503).json({ error: 'Base de données non configurée' });
    const { table } = req.params;
    if (!requireKnownTable(table, res)) return;
    try {
      let query = supabase.from(table).select('*');
      if (TABLES_WITH_COMPANY_ID.has(table)) {
        const companyId = await resolveCompanyId();
        query = query.eq('company_id', companyId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return res.json(data);
    } catch (error: any) {
      console.error(`Error on GET /api/db/${table}:`, error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Création d'une ligne (injecte automatiquement company_id si applicable et absent)
  app.post('/api/db/:table', async (req, res) => {
    if (!supabaseEnabled || !supabase) return res.status(503).json({ error: 'Base de données non configurée' });
    const { table } = req.params;
    if (!requireKnownTable(table, res)) return;
    try {
      const payload = { ...req.body };
      if (TABLES_WITH_COMPANY_ID.has(table) && !payload.company_id) {
        payload.company_id = await resolveCompanyId();
      }
      const { data, error } = await supabase.from(table).insert(payload).select().single();
      if (error) throw error;
      return res.json(data);
    } catch (error: any) {
      console.error(`Error on POST /api/db/${table}:`, error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Upsert générique (utile pour les tables clé-primaire naturelle, ex: weekly_goals)
  app.put('/api/db/:table', async (req, res) => {
    if (!supabaseEnabled || !supabase) return res.status(503).json({ error: 'Base de données non configurée' });
    const { table } = req.params;
    if (!requireKnownTable(table, res)) return;
    try {
      const payload = { ...req.body };
      if (TABLES_WITH_COMPANY_ID.has(table) && !payload.company_id) {
        payload.company_id = await resolveCompanyId();
      }
      const { data, error } = await supabase.from(table).upsert(payload).select().single();
      if (error) throw error;
      return res.json(data);
    } catch (error: any) {
      console.error(`Error on PUT /api/db/${table}:`, error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Mise à jour partielle d'une ligne existante par identifiant
  app.patch('/api/db/:table/:id', async (req, res) => {
    if (!supabaseEnabled || !supabase) return res.status(503).json({ error: 'Base de données non configurée' });
    const { table, id } = req.params;
    if (!requireKnownTable(table, res)) return;
    try {
      const idColumn = TABLE_ID_COLUMN[table] || 'id';
      const { data, error } = await supabase.from(table).update(req.body).eq(idColumn, id).select().single();
      if (error) throw error;
      return res.json(data);
    } catch (error: any) {
      console.error(`Error on PATCH /api/db/${table}/${id}:`, error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Suppression d'une ligne par identifiant
  app.delete('/api/db/:table/:id', async (req, res) => {
    if (!supabaseEnabled || !supabase) return res.status(503).json({ error: 'Base de données non configurée' });
    const { table, id } = req.params;
    if (!requireKnownTable(table, res)) return;
    try {
      const idColumn = TABLE_ID_COLUMN[table] || 'id';
      const { error } = await supabase.from(table).delete().eq(idColumn, id);
      if (error) throw error;
      return res.json({ success: true });
    } catch (error: any) {
      console.error(`Error on DELETE /api/db/${table}/${id}:`, error);
      return res.status(500).json({ error: error.message });
    }
  });
}
