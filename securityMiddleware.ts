import type express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';

const isProduction = process.env.NODE_ENV === 'production';
const NATIVE_APP_ORIGINS = new Set([
  'capacitor://localhost',
  'https://localhost'
]);

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

  // Capacitor sert les fichiers intégrés depuis localhost. Les appels API
  // utilisent un jeton Bearer court plutôt que le cookie web SameSite. Cette
  // liste fermée autorise uniquement les origines natives connues.
  app.use((req, res, next) => {
    const origin = String(req.get('origin') || '');
    if (!NATIVE_APP_ORIGINS.has(origin)) return next();
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.vary('Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Hailite-Client');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });

  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: request => !request.path.startsWith('/api/')
  }));

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
