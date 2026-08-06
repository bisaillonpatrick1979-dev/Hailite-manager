// Serveur Node traditionnel : utilisé en développement local (npm run dev) et
// pour tout hébergement Node persistant (Railway, Render, VM, etc.). Sur
// Vercel, c'est api/index.ts qui sert les mêmes routes en fonction serverless
// (voir apiRoutes.ts, partagé entre les deux entrées) — server.ts n'y tourne pas.
import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerApiRoutes } from './apiRoutes.js';
import { registerBootstrapRoutes } from './bootstrapRoutes.js';
import { legacyIdGuard } from './legacyIdGuard.js';
import { apiErrorHandler, registerSecurityMiddleware } from './securityMiddleware.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistDirectory = path.basename(__dirname) === 'dist'
  ? __dirname
  : path.join(__dirname, 'dist');

async function startServer() {
  const app = express();
  registerSecurityMiddleware(app);
  app.use(express.json({ limit: '8mb' }));
  app.use(legacyIdGuard);

  registerBootstrapRoutes(app);
  registerApiRoutes(app);
  app.use(apiErrorHandler);

  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    app.get('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        const template = await vite.transformIndexHtml(url, `<!doctype html>
<html lang="fr-CA">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Hailite Manager</title>
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
    app.use(express.static(clientDistDirectory));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDistDirectory, 'index.html'));
    });
  }

  const configuredPort = Number.parseInt(String(process.env.PORT || '3000'), 10);
  const port = Number.isFinite(configuredPort) && configuredPort > 0 ? configuredPort : 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
  });
}

startServer();
