import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type AiProvider = 'gemini' | 'openai' | 'anthropic';
type ChatImage = { data: string; mimeType: string; name?: string };

const AI_PROVIDERS: AiProvider[] = ['gemini', 'openai', 'anthropic'];

const SYSTEM_INSTRUCTION = `
  Tu es l'assistant d'IA intelligent d'une entreprise québécoise de pose de toiture et parement extérieur appelée "Hailite Xteriors".
  L'application de gestion de chantier s'appelle "Gestion Chantier Pro".
  Ton but est d'aider les administrateurs et les ouvriers sur les chantiers de construction.
  Tu connais la CCQ (Commission de la construction du Québec) et les réglementations CNESST.
  Donne des conseils professionnels, clairs et utilise des termes québécois quand approprié (ex: "Chantier", "Pièce", "Bardeaux", "Soufflage").
  Réponds de manière concise, polie et technique pour les calculs de toiture, la rentabilité de chantier, la sécurité ou la gestion de l'inventaire.
  Si une photo est fournie, analyse ce que tu vois comme un assistant de chantier: matériaux, défauts visibles, sécurité, estimation ou prochaine action. Mentionne les limites si l'image ne permet pas de conclure.
`;

function normalizeProvider(provider?: string): AiProvider {
  const normalized = String(provider || process.env.AI_PROVIDER || 'gemini').toLowerCase();
  return AI_PROVIDERS.includes(normalized as AiProvider) ? (normalized as AiProvider) : 'gemini';
}

function getProviderKey(provider: AiProvider): string | undefined {
  if (provider === 'gemini') return process.env.GEMINI_API_KEY;
  if (provider === 'openai') return process.env.OPENAI_API_KEY;
  return process.env.ANTHROPIC_API_KEY;
}

function isMissingKey(provider: AiProvider): boolean {
  const key = getProviderKey(provider);
  const placeholders = ['MY_GEMINI_API_KEY', 'MY_OPENAI_API_KEY', 'MY_ANTHROPIC_API_KEY'];
  return !key || key.trim() === '' || placeholders.includes(key.trim());
}

function getProviderModel(provider: AiProvider): string {
  if (provider === 'gemini') return process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  if (provider === 'openai') return process.env.OPENAI_MODEL || 'gpt-4o-mini';
  return process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest';
}

function getFallbackReply(provider: AiProvider, image?: ChatImage) {
  return {
    provider,
    reply: image
      ? `🤖 Photo reçue en mode simulation locale. Configurez la clé ${provider.toUpperCase()}_API_KEY pour activer l'analyse visuelle avec le provider ${provider}.`
      : `🤖 L'assistant IA fonctionne en mode simulation locale car la clé du provider ${provider} n'est pas configurée dans les variables d'environnement. Ajoutez GEMINI_API_KEY, OPENAI_API_KEY ou ANTHROPIC_API_KEY, puis choisissez le provider actif dans Réglages > Compagnie.`,
    simulated: true,
  };
}

async function generateWithGemini(message: string, image?: ChatImage) {
  const ai = new GoogleGenAI({
    apiKey: getProviderKey('gemini') || '',
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
  });

  const userParts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
    { text: `Système: ${SYSTEM_INSTRUCTION}\n\nClient message: ${message || 'Analyse cette photo de chantier et donne tes recommandations.'}` }
  ];

  if (image?.data && image?.mimeType) {
    userParts.push({ inlineData: { data: image.data, mimeType: image.mimeType } });
  }

  const response = await ai.models.generateContent({
    model: getProviderModel('gemini'),
    contents: [{ role: 'user', parts: userParts }],
  });

  return response.text || '';
}

async function generateWithOpenAI(message: string, image?: ChatImage) {
  const content: any[] = [
    { type: 'text', text: `Système: ${SYSTEM_INSTRUCTION}\n\nClient message: ${message || 'Analyse cette photo de chantier et donne tes recommandations.'}` }
  ];

  if (image?.data && image?.mimeType) {
    content.push({ type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.data}` } });
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getProviderKey('openai')}`,
    },
    body: JSON.stringify({
      model: getProviderModel('openai'),
      messages: [{ role: 'user', content }],
      temperature: 0.3,
    }),
  });

  if (!response.ok) throw new Error(`OpenAI API error ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function generateWithAnthropic(message: string, image?: ChatImage) {
  const content: any[] = [
    { type: 'text', text: `Système: ${SYSTEM_INSTRUCTION}\n\nClient message: ${message || 'Analyse cette photo de chantier et donne tes recommandations.'}` }
  ];

  if (image?.data && image?.mimeType) {
    content.push({ type: 'image', source: { type: 'base64', media_type: image.mimeType, data: image.data } });
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getProviderKey('anthropic') || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: getProviderModel('anthropic'),
      max_tokens: 900,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!response.ok) throw new Error(`Anthropic API error ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return data.content?.map((part: any) => part.text || '').join('\n').trim() || '';
}

async function generateAiReply(provider: AiProvider, message: string, image?: ChatImage) {
  if (isMissingKey(provider)) return getFallbackReply(provider, image);

  const reply = provider === 'gemini'
    ? await generateWithGemini(message, image)
    : provider === 'openai'
      ? await generateWithOpenAI(message, image)
      : await generateWithAnthropic(message, image);

  return { provider, reply, simulated: false };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  app.get('/api/ai/providers', (_req, res) => {
    const activeProvider = normalizeProvider();
    return res.json({
      activeProvider,
      providers: AI_PROVIDERS.map(provider => ({
        id: provider,
        model: getProviderModel(provider),
        configured: !isMissingKey(provider),
        active: provider === activeProvider,
      })),
    });
  });

  app.post('/api/ai/test', async (req, res) => {
    const requestedProvider = req.body?.provider as string | undefined;
    const providersToTest = requestedProvider === 'all'
      ? AI_PROVIDERS
      : [normalizeProvider(requestedProvider)];

    const results = await Promise.all(providersToTest.map(async (provider) => {
      try {
        const result = await generateAiReply(provider, 'Réponds seulement: OK provider prêt pour Gestion Chantier Pro.');
        return { provider, ok: true, model: getProviderModel(provider), ...result };
      } catch (error: any) {
        return { provider, ok: false, model: getProviderModel(provider), error: error.message || 'Erreur inconnue' };
      }
    }));

    return res.json({ activeProvider: normalizeProvider(requestedProvider), results });
  });

  app.post('/api/chat', async (req, res) => {
    try {
      const { message, image, provider } = req.body as {
        message?: string;
        provider?: string;
        image?: ChatImage;
      };

      const result = await generateAiReply(normalizeProvider(provider), message || '', image);
      return res.json(result);
    } catch (error: any) {
      console.error('Error on /api/chat:', error);
      return res.status(500).json({ error: error.message || 'Error occurred while calling AI provider' });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);
    
    // Serve index.html dynamically
    app.get('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = await vite.transformIndexHtml(url, `<!doctype html>
<html lang="fr-CA">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Gestion Chantier Pro</title>
  </head>
  <body class="bg-[#0F1115] text-[#E0E2E6]">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        console.error(e);
        next(e);
      }
    });
  } else {
    // Serve static files in production
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist/index.html'));
    });
  }

  const port = 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
  });
}

startServer();
