// Point d'entrée Vercel : toute requête /api/* est réécrite ici (voir vercel.json).
// Les routes elles-mêmes vivent dans apiRoutes.ts, partagé avec server.ts (le
// serveur Node traditionnel utilisé en développement local et hors Vercel).
// IMPORTANT : extension .js obligatoire sur les imports locaux — le projet est en
// ES Modules ("type": "module") et le runtime Node de Vercel ne résout pas les
// spécificateurs sans extension (ERR_MODULE_NOT_FOUND au démarrage de la fonction).
import express from 'express';
import { registerApiRoutes } from '../apiRoutes.js';
import { legacyIdGuard } from '../legacyIdGuard.js';

const app = express();
app.use(express.json({ limit: '15mb' })); // signatures tactiles encodées en base64
app.use(legacyIdGuard);
registerApiRoutes(app);

export default app;
