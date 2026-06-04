import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateAiReply, listAiProviderStatus, normalizeProvider, testAiProviders } from './src/aiProviders';
import type { ChatImage } from './src/aiProviders';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  app.get('/api/ai/providers', (_req, res) => {
    return res.json(listAiProviderStatus());
  });

  app.post('/api/ai/test', async (req, res) => {
    return res.json(await testAiProviders(req.body?.provider));
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
