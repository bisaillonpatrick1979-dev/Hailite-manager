import type express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';

const isProduction = process.env.NODE_ENV === 'production';

// Origines réelles des WebView natives. Ce ne sont pas des choix esthétiques :
// Capacitor 8 sert l'application Android depuis `https://localhost`
// (androidScheme, épinglé dans capacitor.config.ts) et iOS depuis
// `capacitor://localhost`. Retirer l'une des deux coupe l'application native.
//
// `https://localhost` n'est pas une origine exclusive à cette application :
// n'importe qui peut faire tourner un serveur local. C'est acceptable parce
// qu'aucune réponse ne porte `Access-Control-Allow-Credentials` — voir
// assertNoCredentialedCors ci-dessous. Sans cet en-tête, le navigateur refuse
// d'attacher le cookie de session à une requête d'origine croisée, donc une
// page locale hostile ne peut ni lire ni écrire au nom d'un utilisateur
// connecté. C'est cette invariante, et non la liste d'origines, qui protège.
export const NATIVE_APP_ORIGINS = new Set([
  'capacitor://localhost',
  'https://localhost'
]);

// Ne jamais autoriser les requêtes d'origine croisée porteuses de cookies :
// toute la défense CSRF de l'application repose là-dessus. Exporté pour être
// vérifié par les tests (tests/security-regressions.test.ts).
export const CREDENTIALED_CORS_HEADER = 'access-control-allow-credentials';

export function registerSecurityMiddleware(app: express.Express): void {
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: isProduction
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
            fontSrc: ["'self'", 'data:'],
            connectSrc: ["'self'", 'https:'],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            frameAncestors: ["'none'"]
          }
        }
      : false,
    crossOriginEmbedderPolicy: false
  }));

  // Le limiteur de débit passe avant la réponse CORS : autrement, un flot de
  // requêtes OPTIONS depuis une origine autorisée court-circuitait le compteur.
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: request => !request.path.startsWith('/api/')
  }));

  // Capacitor sert les fichiers intégrés depuis localhost. Les appels API
  // utilisent un jeton Bearer court plutôt que le cookie web SameSite. Cette
  // liste fermée autorise uniquement les origines natives connues, et
  // uniquement sur /api/ : le reste du site n'a aucune raison d'être lu depuis
  // une autre origine.
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/')) return next();
    const origin = String(req.get('origin') || '');
    if (!NATIVE_APP_ORIGINS.has(origin)) return next();
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.vary('Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Hailite-Client');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
    // Volontairement : pas d'Access-Control-Allow-Credentials. L'application
    // native s'authentifie par jeton Bearer, jamais par cookie.
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });

  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');
    }
    next();
  });

  // Les cookies SameSite=Strict constituent la première défense CSRF. Ce garde
  // rejette en plus toute écriture provenant explicitement d'une autre origine.
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/') || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (!origin) return next();
    try {
      const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
      const requestHost = forwardedHost || req.get('host') || '';
      const configuredOrigin = process.env.APP_URL ? new URL(process.env.APP_URL).origin : '';
      const nativeClient = ['android', 'ios'].includes(String(req.get('x-hailite-client') || '').toLowerCase());
      if (new URL(origin).host === requestHost || origin === configuredOrigin) return next();
      if (nativeClient && NATIVE_APP_ORIGINS.has(origin)) return next();
    } catch {
      // Toute origine mal formée est refusée.
    }
    return res.status(403).json({ error: 'Origine non autorisée' });
  });
}

export function apiErrorHandler(
  error: any,
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  if (!req.path.startsWith('/api/')) return next(error);
  console.error('[api] requête rejetée :', error?.message || error);
  const tooLarge = error?.type === 'entity.too.large' || error?.status === 413;
  res.status(tooLarge ? 413 : 400).json({
    error: tooLarge ? 'Requête trop volumineuse' : 'Requête invalide'
  });
}
