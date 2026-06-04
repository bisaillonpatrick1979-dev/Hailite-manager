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
  app.use(express.json({ limit: '12mb' }));

  // API Route for Gemini Agent chat
  app.post('/api/chat', async (req, res) => {
    try {
      const { message, image } = req.body as {
        message?: string;
        image?: { data: string; mimeType: string; name?: string };
      };
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
        return res.json({
          reply: image
            ? "🤖 Photo reçue en mode simulation locale. Configurez GEMINI_API_KEY pour activer l'analyse visuelle Gemini avec les questions vocales ou texte."
            : "🤖 L'assistant IA fonctionne en mode simulation locale car la clé GEMINI_API_KEY n'est pas encore configurée dans vos Variables d'Environnement / Secrets. Pour l'activer, ajoutez la clé de l'API Gemini dans le panneau latérale de configuration.",
          simulated: true
        });
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Prepare system instruction
      const systemInstruction = `
        Tu es l'assistant d'IA intelligent d'une entreprise québécoise de pose de toiture et parement extérieur appelée "Hailite Xteriors".
        L'application de gestion de chantier s'appelle "Gestion Chantier Pro".
        Ton but est d'aider les administrateurs et les ouvriers sur les chantiers de construction.
        Tu connais la CCQ (Commission de la construction du Québec) et les réglementations CNESST.
        Donne des conseils professionnels, clairs et utilise des termes québécois quand approprié (ex: "Chantier", "Pièce", "Bardeaux", "Soufflage").
        Réponds de manière concise, polie et technique pour les calculs de toiture, la rentabilité de chantier, la sécurité ou la gestion de l'inventaire.
        Si une photo est fournie, analyse ce que tu vois comme un assistant de chantier: matériaux, défauts visibles, sécurité, estimation ou prochaine action. Mentionne les limites si l'image ne permet pas de conclure.
      `;

      const userParts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
        { text: `Système: ${systemInstruction}\n\nClient message: ${message || 'Analyse cette photo de chantier et donne tes recommandations.'}` }
      ];

      if (image?.data && image?.mimeType) {
        userParts.push({
          inlineData: {
            data: image.data,
            mimeType: image.mimeType,
          },
        });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [
          { role: 'user', parts: userParts }
        ],
      });

      const text = response.text;
      return res.json({ reply: text });
    } catch (error: any) {
      console.error('Error on /api/chat:', error);
      return res.status(500).json({ error: error.message || 'Error occurred while calling Gemini API' });
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
