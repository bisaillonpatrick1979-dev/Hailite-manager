// Couche d'authentification et d'autorisation du serveur.
//
// Objectif : la clé SUPABASE_SERVICE_ROLE_KEY ne doit JAMAIS être exploitable
// depuis le navigateur. Toutes les routes de données exigent désormais un jeton
// de session (JWT HS256 signé côté serveur) qui transporte l'identité vérifiée
// de l'utilisateur : user_id, company_id et role. Le NIP n'est plus validé dans
// le navigateur : il est vérifié ici, côté serveur, contre la base de données.
//
// NOTE ARCHITECTURE : ce module implémente des sessions JWT signées par le
// serveur (SESSION_SECRET). La cible long terme reste Supabase Auth (comptes
// avec courriel + RLS par jeton Supabase) — voir SECURITY.md. En attendant,
// aucune requête de données n'est servie sans identité vérifiée.
import crypto from 'crypto';
import type express from 'express';
import { supabase, supabaseEnabled, resolveCompanyId } from './db.js';

export type AppRole = 'admin' | 'secretary' | 'accountant' | 'employee';

export interface AuthContext {
  userId: string;
  companyId: string;
  role: AppRole;
  name: string;
}

// Rôles hérités de l'ancienne version de l'app encore présents en base
const LEGACY_ROLE_MAP: Record<string, AppRole> = {
  admin: 'admin', owner: 'admin',
  secretary: 'secretary', accountant: 'accountant',
  employee: 'employee', subcontractor: 'employee'
};

export function normalizeRole(role: string | null | undefined): AppRole {
  return LEGACY_ROLE_MAP[String(role || '').toLowerCase()] || 'employee';
}

// ---------------------------------------------------------------------------
// Secret de session
// ---------------------------------------------------------------------------
// SESSION_SECRET doit être défini dans les variables d'environnement (Vercel).
// À défaut, un secret éphémère est généré : les sessions ne survivent alors pas
// à un redémarrage / une nouvelle instance serverless — acceptable en dev,
// à proscrire en production (un avertissement est journalisé).
const SESSION_SECRET: string = (() => {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.trim().length >= 16) return fromEnv.trim();
  const ephemeral = crypto.randomBytes(32).toString('hex');
  if (supabaseEnabled) {
    console.warn('[auth] SESSION_SECRET manquant : secret éphémère généré. ' +
      'Définissez SESSION_SECRET dans les variables d’environnement pour des sessions stables en production.');
  }
  return ephemeral;
})();

const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 h

// ---------------------------------------------------------------------------
// JWT HS256 minimal (crypto natif Node — aucune dépendance supplémentaire)
// ---------------------------------------------------------------------------
const b64url = (buf: Buffer | string) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const b64urlJson = (obj: unknown) => b64url(JSON.stringify(obj));

function hmac(data: string): string {
  return b64url(crypto.createHmac('sha256', SESSION_SECRET).update(data).digest());
}

export function signSession(ctx: AuthContext): { token: string; expiresAt: number } {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + SESSION_TTL_SECONDS;
  const header = b64urlJson({ alg: 'HS256', typ: 'JWT' });
  const payload = b64urlJson({
    sub: ctx.userId,
    company_id: ctx.companyId,
    role: ctx.role,
    name: ctx.name,
    iat: now,
    exp
  });
  const signature = hmac(`${header}.${payload}`);
  return { token: `${header}.${payload}.${signature}`, expiresAt: exp * 1000 };
}

export function verifySession(token: string): AuthContext | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expected = hmac(`${header}.${payload}`);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (!data.sub || !data.company_id || !data.exp) return null;
    if (Math.floor(Date.now() / 1000) >= data.exp) return null;
    return {
      userId: String(data.sub),
      companyId: String(data.company_id),
      role: normalizeRole(data.role),
      name: String(data.name || '')
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Limitation des tentatives de connexion (anti force brute sur les NIP)
// ---------------------------------------------------------------------------
// En mémoire par instance : suffisant pour ralentir un balayage de NIP à 4
// chiffres. Un stockage partagé (table/Redis) est recommandé à terme.
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; firstAt: number }>();

export function isLoginThrottled(key: string): boolean {
  const entry = loginAttempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
    return false;
  }
  return entry.count >= LOGIN_MAX_ATTEMPTS;
}

export function recordLoginFailure(key: string): void {
  const entry = loginAttempts.get(key);
  if (!entry || Date.now() - entry.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAt: Date.now() });
  } else {
    entry.count += 1;
  }
}

export function clearLoginFailures(key: string): void {
  loginAttempts.delete(key);
}

// ---------------------------------------------------------------------------
// Vérification des identifiants côté serveur (le NIP ne quitte plus la base)
// ---------------------------------------------------------------------------
export interface CredentialCheck {
  ok: boolean;
  ctx?: AuthContext;
  reason?: 'unavailable' | 'invalid' | 'inactive';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function verifyCredentials(employeeId: string, nip: string): Promise<CredentialCheck> {
  if (!supabaseEnabled || !supabase) return { ok: false, reason: 'unavailable' };
  // Identifiant local hérité (ex: "emp-1" des données de démonstration) : cet
  // utilisateur n'existe pas dans la base — on répond "unavailable" plutôt
  // qu'"invalid" pour que le client bascule sur sa vérification locale au lieu
  // d'afficher "NIP incorrect" à tort.
  if (!UUID_RE.test(employeeId)) return { ok: false, reason: 'unavailable' };

  const { data: user, error } = await supabase
    .from('app_users')
    .select('id, full_name, role, company_id, access_code_hash, is_active')
    .eq('id', employeeId)
    .maybeSingle();
  if (error || !user) return { ok: false, reason: 'invalid' };
  if (user.is_active === false) return { ok: false, reason: 'inactive' };

  const stored = String(user.access_code_hash || '');
  // Les anciens NIP hachés (bcrypt "$2...") ne sont plus utilisables : l'admin
  // doit en attribuer un nouveau. Comparaison en temps constant sinon.
  if (!stored || stored.startsWith('$2')) return { ok: false, reason: 'invalid' };
  const a = Buffer.from(stored);
  const b = Buffer.from(String(nip || ''));
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!match) return { ok: false, reason: 'invalid' };

  const companyId = user.company_id || await resolveCompanyId();
  return {
    ok: true,
    ctx: {
      userId: String(user.id),
      companyId: String(companyId),
      role: normalizeRole(user.role),
      name: String(user.full_name || '')
    }
  };
}

// ---------------------------------------------------------------------------
// Middleware Express
// ---------------------------------------------------------------------------
export interface AuthedRequest extends express.Request {
  auth?: AuthContext;
}

export function extractAuth(req: express.Request): AuthContext | null {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return verifySession(header.slice(7).trim());
}

// Exige une session valide. Toutes les routes de données passent par ici.
export function requireAuth(req: AuthedRequest, res: express.Response, next: express.NextFunction): void {
  const ctx = extractAuth(req);
  if (!ctx) {
    res.status(401).json({ error: 'authentification requise', code: 'AUTH_REQUIRED' });
    return;
  }
  req.auth = ctx;
  next();
}

// Variante pour /api/chat : identité exigée dès que le cloud est configuré ;
// en mode purement local (Supabase absent), le chat reste accessible mais sans
// aucune action (les tools ne sont jamais proposés sans rôle vérifié).
export function attachAuthOptional(req: AuthedRequest, _res: express.Response, next: express.NextFunction): void {
  const ctx = extractAuth(req);
  if (ctx) req.auth = ctx;
  next();
}

// ---------------------------------------------------------------------------
// Journal d'audit (best effort : ne bloque jamais la requête)
// ---------------------------------------------------------------------------
// Table "audit_logs" — voir supabase_security.sql pour le DDL.
export function logAudit(
  auth: AuthContext | null,
  action: string,
  target: string,
  targetId?: string | null,
  details?: Record<string, unknown>
): void {
  const entry = {
    at: new Date().toISOString(),
    user_id: auth?.userId || null,
    user_name: auth?.name || null,
    role: auth?.role || null,
    company_id: auth?.companyId || null,
    action,
    target,
    target_id: targetId || null,
    details: details || null
  };
  if (supabaseEnabled && supabase) {
    supabase.from('audit_logs').insert(entry).then(({ error }) => {
      if (error) console.warn('[audit] insertion échouée (table audit_logs manquante ?) :', error.message, JSON.stringify(entry));
    });
  } else {
    console.info('[audit]', JSON.stringify(entry));
  }
}
