import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.use(express.json());

  function buildSystemInstruction(regionLabel?: string): string {
    const location = regionLabel && regionLabel.trim() ? regionLabel.trim() : 'Amérique du Nord';
    return `
    Tu es l'assistant d'IA intelligent d'une entreprise de pose de toiture et parement extérieur appelée "Hailite Xteriors", basée en ${location}.
    L'application de gestion de chantier s'appelle "Gestion Chantier Pro".
    Ton but est d'aider les administrateurs et les ouvriers sur les chantiers de construction.
    Base tes réponses de conformité, de sécurité et de charges sociales sur les règles applicables en ${location} — ne présume jamais que l'entreprise est au Québec à moins que ce soit précisé.
    Donne des conseils professionnels et clairs.
    Réponds de manière concise, polie et technique pour les calculs de toiture, la rentabilité de chantier, la sécurité ou la gestion de l'inventaire.
  `;
  }

  async function callGemini(message: string, apiKey: string, systemInstruction: string): Promise<string> {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [
        { role: 'user', parts: [{ text: `Système: ${systemInstruction}\n\nClient message: ${message}` }] }
      ],
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

  async function callAnthropic(message: string, apiKey: string, systemInstruction: string): Promise<string> {
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
        messages: [{ role: 'user', content: message }]
      })
    });
    const data = await parseJsonSafely(res, 'Anthropic');
    if (!res.ok) {
      throw new Error(data?.error?.message || `Anthropic API error (${res.status})`);
    }
    return data?.content?.[0]?.text || '';
  }

  async function callOpenAI(message: string, apiKey: string, systemInstruction: string): Promise<string> {
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
          { role: 'user', content: message }
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

  // API Route for AI Agent chat (Gemini / Anthropic / OpenAI)
  app.post('/api/chat', async (req, res) => {
    try {
      const { message, provider, apiKey: clientApiKey, regionLabel } = req.body;
      const selectedProvider: string = provider && PROVIDER_ENV_KEYS[provider] ? provider : 'gemini';
      const envKey = process.env[PROVIDER_ENV_KEYS[selectedProvider]];
      const apiKey = (clientApiKey && clientApiKey.trim()) || envKey;
      const systemInstruction = buildSystemInstruction(regionLabel);

      if (!apiKey || apiKey.trim() === '') {
        return res.json({
          reply: `🤖 L'assistant IA fonctionne en mode simulation locale car aucune clé API n'est configurée pour ${PROVIDER_LABELS[selectedProvider]}. Ajoutez votre clé API dans Réglages > Assistant IA pour l'activer.`,
          simulated: true
        });
      }

      let text = '';
      if (selectedProvider === 'anthropic') {
        text = await callAnthropic(message, apiKey, systemInstruction);
      } else if (selectedProvider === 'openai') {
        text = await callOpenAI(message, apiKey, systemInstruction);
      } else {
        text = await callGemini(message, apiKey, systemInstruction);
      }

      return res.json({ reply: text });
    } catch (error: any) {
      console.error('Error on /api/chat:', error);
      return res.status(500).json({ error: error.message || 'Error occurred while calling the AI provider' });
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
